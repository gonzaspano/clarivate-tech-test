import { describe, expect, it } from "vitest";
import { LlmError } from "../../../src/application/errors.js";
import { makeOllamaClient } from "../../../src/infrastructure/llm/OllamaClient.js";
import { failingFetch, hangingFetch, stubFetch } from "../../fixtures/stubFetch.js";

const prompt = { system: "be brief", user: "hello" };
const schema = { type: "object" };
const reply = (content: string) => ({ message: { role: "assistant", content } });
const make = (fetch: typeof globalThis.fetch, timeoutMs = 1000) =>
  makeOllamaClient({ baseUrl: "http://ollama.test", model: "test-model", timeoutMs, maxTokens: 123, fetch });
const sentBody = (fetch: ReturnType<typeof stubFetch>) => JSON.parse(fetch.mock.calls[0]![1]!.body as string);

describe("OllamaClient", () => {
  describe("generateText", () => {
    it("posts a non-streaming chat request without a format", async () => {
      const fetch = stubFetch(reply("hi"));
      expect(await make(fetch).generateText(prompt)).toBe("hi");

      expect(fetch.mock.calls[0]![0]).toBe("http://ollama.test/api/chat");
      expect(fetch.mock.calls[0]![1]!.method).toBe("POST");
      const body = sentBody(fetch);
      expect(body).toMatchObject({
        model: "test-model",
        stream: false,
        messages: [
          { role: "system", content: "be brief" },
          { role: "user", content: "hello" },
        ],
      });
      expect(body).not.toHaveProperty("format");
      expect(body.options.temperature).toBeGreaterThan(0);
    });
  });

  describe("generation cap", () => {
    it("sends maxTokens as options.num_predict on text and JSON calls", async () => {
      const text = stubFetch(reply("hi"));
      await make(text).generateText(prompt);
      expect(sentBody(text).options.num_predict).toBe(123);

      const json = stubFetch(reply("{}"));
      await make(json).generateJson(prompt, schema);
      expect(sentBody(json).options.num_predict).toBe(123);
    });
  });

  describe("few-shot examples", () => {
    it("sends examples as alternating user/assistant turns between system and the final user message", async () => {
      const fetch = stubFetch(reply("hi"));
      const examples = [
        { user: "q1", assistant: "a1" },
        { user: "q2", assistant: "a2" },
      ];
      await make(fetch).generateText({ ...prompt, examples });
      expect(sentBody(fetch).messages).toEqual([
        { role: "system", content: "be brief" },
        { role: "user", content: "q1" },
        { role: "assistant", content: "a1" },
        { role: "user", content: "q2" },
        { role: "assistant", content: "a2" },
        { role: "user", content: "hello" },
      ]);
    });
  });

  describe("generateJson", () => {
    it("sends the JSON schema as format with temperature 0 and parses the content", async () => {
      const fetch = stubFetch(reply('{"city":"Paris"}'));
      expect(await make(fetch).generateJson(prompt, schema)).toEqual({ city: "Paris" });

      const body = sentBody(fetch);
      expect(body).toMatchObject({ model: "test-model", stream: false, format: schema });
      expect(body.options.temperature).toBe(0);
    });

    it("throws LlmError when the content is not JSON", async () => {
      await expect(make(stubFetch(reply("sure! here you go"))).generateJson(prompt, schema)).rejects.toThrow(
        LlmError,
      );
    });
  });

  describe.each([
    ["generateText", (client: ReturnType<typeof make>) => client.generateText(prompt)],
    ["generateJson", (client: ReturnType<typeof make>) => client.generateJson(prompt, schema)],
  ])("%s failures", (_name, call) => {
    it("includes the model name when it is not found (404)", async () => {
      const client = make(stubFetch({ error: "model 'test-model' not found" }, { status: 404 }));
      const error = (await call(client).catch((e) => e)) as Error;
      expect(error).toBeInstanceOf(LlmError);
      expect(error.message).toContain("test-model");
      expect(error.message).toContain("404");
    });

    it("throws LlmError on other non-2xx responses", async () => {
      await expect(call(make(stubFetch("boom", { status: 500 })))).rejects.toThrow(LlmError);
    });

    it("wraps network errors, keeping the cause", async () => {
      const cause = new TypeError("fetch failed");
      const error = (await call(make(failingFetch(cause))).catch((e) => e)) as Error;
      expect(error).toBeInstanceOf(LlmError);
      expect(error.cause).toBe(cause);
    });

    it("turns a timeout into LlmError", async () => {
      const error = (await call(make(hangingFetch(), 10)).catch((e) => e)) as Error;
      expect(error).toBeInstanceOf(LlmError);
      expect(error.message).toMatch(/timed out/i);
    });

    it("throws LlmError on empty content", async () => {
      await expect(call(make(stubFetch(reply("  "))))).rejects.toThrow(LlmError);
    });

    it("throws LlmError when the response has no message", async () => {
      await expect(call(make(stubFetch({ done: true })))).rejects.toThrow(LlmError);
    });
  });
});
