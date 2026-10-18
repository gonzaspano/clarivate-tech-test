import { z } from "zod";
import { LlmError } from "../../application/errors.js";
import type { LlmProvider, Prompt } from "../../application/ports/LlmProvider.js";
import { isTimeoutError } from "../isTimeoutError.js";

type Options = {
  apiKey: string;
  baseUrl: string;
  model: string;
  timeoutMs: number;
  fetch?: typeof globalThis.fetch;
};

const TEXT_TEMPERATURE = 0.3;
const JSON_TEMPERATURE = 0;

const responseSchema = z.object({
  promptFeedback: z.object({ blockReason: z.string().optional() }).optional(),
  candidates: z
    .array(
      z.object({
        finishReason: z.string().optional(),
        content: z.object({ parts: z.array(z.object({ text: z.string().optional() })).optional() }).optional(),
      }),
    )
    .optional(),
});

const part = (text: string) => ({ parts: [{ text }] });

// Gemini takes plain JSON Schema in `responseJsonSchema`, but `$schema` is not part of the accepted subset.
const withoutMetaSchema = ({ $schema: _ignored, ...schema }: Record<string, unknown>) => schema;

export function makeGeminiClient({ apiKey, baseUrl, model, timeoutMs, fetch = globalThis.fetch }: Options): LlmProvider {
  // The error messages below never include the key: it only travels in the x-goog-api-key header.
  function statusError(status: number): LlmError {
    if (status === 401 || status === 403) {
      return new LlmError(`Gemini rejected the API key (status ${status}); check GEMINI_API_KEY`);
    }
    if (status === 429) {
      return new LlmError(`Gemini rate limit or quota exceeded (status 429) for model "${model}"`);
    }
    return new LlmError(`Gemini responded with status ${status} for model "${model}"`);
  }

  // POST :generateContent (non-streaming) and return the candidate text.
  async function generate(
    prompt: Prompt,
    temperature: number,
    jsonSchema?: Record<string, unknown>,
  ): Promise<string> {
    let response: Response;
    try {
      response = await fetch(`${baseUrl}/models/${model}:generateContent`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify({
          systemInstruction: part(prompt.system),
          contents: [
            ...(prompt.examples ?? []).flatMap((example) => [
              { role: "user", ...part(example.user) },
              { role: "model", ...part(example.assistant) },
            ]),
            { role: "user", ...part(prompt.user) },
          ],
          generationConfig: {
            temperature,
            ...(jsonSchema && {
              responseMimeType: "application/json",
              responseJsonSchema: withoutMetaSchema(jsonSchema),
            }),
          },
        }),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (cause) {
      const reason = isTimeoutError(cause) ? `timed out after ${timeoutMs}ms` : "request failed";
      throw new LlmError(`Gemini ${reason} (model "${model}")`, { cause });
    }
    if (!response.ok) throw statusError(response.status);

    const parsed = responseSchema.safeParse(await response.json().catch(() => undefined));
    if (!parsed.success) throw new LlmError(`Gemini returned an unreadable response for model "${model}"`);

    const { promptFeedback, candidates } = parsed.data;
    if (promptFeedback?.blockReason) {
      throw new LlmError(`Gemini blocked the prompt (reason: ${promptFeedback.blockReason})`);
    }
    const candidate = candidates?.[0];
    if (!candidate) throw new LlmError(`Gemini returned no candidates for model "${model}"`);
    if (candidate.finishReason !== undefined && candidate.finishReason !== "STOP") {
      throw new LlmError(`Gemini stopped early (finishReason: ${candidate.finishReason})`);
    }

    const text = (candidate.content?.parts ?? []).map((p) => p.text ?? "").join("").trim();
    if (!text) throw new LlmError(`Gemini returned no content for model "${model}"`);
    return text;
  }

  return {
    generateText: (prompt) => generate(prompt, TEXT_TEMPERATURE),
    async generateJson(prompt, jsonSchema) {
      const text = await generate(prompt, JSON_TEMPERATURE, jsonSchema);
      try {
        return JSON.parse(text);
      } catch (cause) {
        throw new LlmError("Gemini returned content that is not valid JSON", { cause });
      }
    },
  };
}
