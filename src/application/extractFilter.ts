import { z } from "zod";
import { userFilterSchema, type UserFilter } from "../domain/userFilter.js";
import { InvalidQueryError, LlmError } from "./errors.js";
import { llmFilterJsonSchema, llmFilterSchema, stripNulls, type LlmFilter } from "./llmFilter.js";
import type { LlmProvider, Prompt } from "./ports/LlmProvider.js";
import type { Logger } from "./ports/Logger.js";

const MAX_LLM_ATTEMPTS = 2;
const MAX_ISSUES_LENGTH = 500;

const SYSTEM_PROMPT = `You convert a natural-language request about users into a JSON filter.
Reply with JSON only, in this shape:
{"age": {"gt": int|null, "gte": int|null, "lt": int|null, "lte": int|null} | null, "city": string|null}

Rules:
- "older than X" or "over X" -> age.gt = X
- "younger than X" or "under X" -> age.lt = X
- "between A and B" -> age.gte = A and age.lte = B (both inclusive)
- "from <city>" or "living in <city>" -> city = <city>
- Use null for anything the request does not mention.
- If the request asks for anything else (profession, gender, hobbies, ...), set every field to null.`;

// Few-shot examples are sent as real chat turns: small models copy a neighbouring
// example's answer when the examples are a text block inside the system prompt.
const example = (request: string, answer: object) => ({
  user: `Request: ${request}`,
  assistant: JSON.stringify(answer),
});
const ageBounds = (bounds: object) => ({ age: { gt: null, gte: null, lt: null, lte: null, ...bounds }, city: null });

const EXAMPLES = [
  example("People older than 40", ageBounds({ gt: 40 })),
  example("People younger than 30", ageBounds({ lt: 30 })),
  example("Users between 20 and 35", ageBounds({ gte: 20, lte: 35 })),
  example("Users over 50", ageBounds({ gt: 50 })),
  example("Users from Charleston", { age: null, city: "Charleston" }),
  example("Users living in Charleston", { age: null, city: "Charleston" }),
  example("Users who like jazz", { age: null, city: null }),
];

/**
 * Turns a natural-language query into a validated domain filter.
 * Throws LlmError if the model fails, InvalidQueryError if the query is unsupported.
 */
export async function extractFilter(llm: LlmProvider, query: string, logger: Logger): Promise<UserFilter> {
  const llmFilter = await askModel(llm, query, logger);
  const filter = userFilterSchema.safeParse(stripNulls(llmFilter));
  if (!filter.success) {
    throw new InvalidQueryError(
      "Could not turn the query into a supported filter. Supported filters: age (older/younger than, between) and city.",
      { cause: filter.error },
    );
  }
  return filter.data;
}

// The LLM may produce output that does not fit the schema: give it one more try.
// At temperature 0 the same input gives the same output, so a retry with an identical
// prompt is pointless. Instead the failed answer goes back as an assistant turn, followed
// by the validation problems, so the model sees what to fix.
async function askModel(llm: LlmProvider, query: string, logger: Logger): Promise<LlmFilter> {
  let prompt: Prompt = { system: SYSTEM_PROMPT, examples: EXAMPLES, user: `Request: ${query}` };
  for (let attempt = 1; attempt <= MAX_LLM_ATTEMPTS; attempt++) {
    const output = await llm.generateJson(prompt, llmFilterJsonSchema);
    const parsed = llmFilterSchema.safeParse(output);
    if (parsed.success) return parsed.data;
    if (attempt < MAX_LLM_ATTEMPTS) {
      const issues = z.prettifyError(parsed.error).slice(0, MAX_ISSUES_LENGTH);
      logger.info("search.llm_retry", { query, attempt, issues });
      prompt = withFeedback(prompt, query, output, issues);
    }
  }
  throw new LlmError(`The language model did not return a valid filter after ${MAX_LLM_ATTEMPTS} attempts`);
}

function withFeedback(prompt: Prompt, query: string, output: unknown, issues: string): Prompt {
  return {
    ...prompt,
    // `output` came from JSON.parse in the adapter, so it always serializes back.
    examples: [...(prompt.examples ?? []), { user: `Request: ${query}`, assistant: JSON.stringify(output) }],
    user: `Your previous answer was invalid:\n${issues}\nAnswer again with JSON matching the shape, for the same request.\nRequest: ${query}`,
  };
}
