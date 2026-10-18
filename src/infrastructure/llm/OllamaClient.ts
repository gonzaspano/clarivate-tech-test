import { z } from "zod";
import { LlmError } from "../../application/errors.js";
import type { LlmProvider, Prompt } from "../../application/ports/LlmProvider.js";
import { isTimeoutError } from "../isTimeoutError.js";

type Options = {
  baseUrl: string;
  model: string;
  timeoutMs: number;
  maxTokens: number;
  fetch?: typeof globalThis.fetch;
};

const TEXT_TEMPERATURE = 0.3;
const JSON_TEMPERATURE = 0;

const chatResponseSchema = z.object({ message: z.object({ content: z.string() }) });

export function makeOllamaClient({ baseUrl, model, timeoutMs, maxTokens, fetch = globalThis.fetch }: Options): LlmProvider {
  // POST /api/chat (non-streaming) and return the assistant message content.
  async function chat(prompt: Prompt, temperature: number, format?: Record<string, unknown>): Promise<string> {
    let response: Response;
    try {
      response = await fetch(`${baseUrl}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: prompt.system },
            ...(prompt.examples ?? []).flatMap((example) => [
              { role: "user", content: example.user },
              { role: "assistant", content: example.assistant },
            ]),
            { role: "user", content: prompt.user },
          ],
          stream: false,
          ...(format && { format }),
          options: { temperature, num_predict: maxTokens },
        }),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (cause) {
      const reason = isTimeoutError(cause) ? `timed out after ${timeoutMs}ms` : "request failed";
      throw new LlmError(`Ollama ${reason} (model "${model}")`, { cause });
    }
    if (!response.ok) {
      throw new LlmError(`Ollama responded with status ${response.status} for model "${model}"`);
    }

    const parsed = chatResponseSchema.safeParse(await response.json().catch(() => undefined));
    const content = parsed.success ? parsed.data.message.content.trim() : "";
    if (!content) throw new LlmError(`Ollama returned no content for model "${model}"`);
    return content;
  }

  return {
    generateText: (prompt) => chat(prompt, TEXT_TEMPERATURE),
    async generateJson(prompt, jsonSchema) {
      const content = await chat(prompt, JSON_TEMPERATURE, jsonSchema);
      try {
        return JSON.parse(content);
      } catch (cause) {
        throw new LlmError("Ollama returned content that is not valid JSON", { cause });
      }
    },
  };
}
