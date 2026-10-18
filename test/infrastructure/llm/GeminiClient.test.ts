import { describe, expect, it } from "vitest";
import { LlmError } from "../../../src/application/errors.js";
import { makeGeminiClient } from "../../../src/infrastructure/llm/GeminiClient.js";
import { failingFetch, hangingFetch, stubFetch } from "../../fixtures/stubFetch.js";

const API_KEY = "test-key-should-never-leak";
const prompt = { system: "be brief", user: "hello" };
const schema = { $schema: "https://json-schema.org/draft/2020-12/schema", type: "object", properties: {} };
const reply = (text: string, extra: Record<string, unknown> = {}) => ({
  candidates: [{ content: { role: "model", parts: [{ text }] }, finishReason: "STOP", ...extra }],
});
const BASE_URL = "https://generativelanguage.googleapis.com/v1beta";
const make = (fetch: typeof globalThis.fetch, timeoutMs = 1000, baseUrl = BASE_URL) =>
  makeGeminiClient({ apiKey: API_KEY, baseUrl, model: "test-model", timeoutMs, fetch });
const sentBody = (fetch: ReturnType<typeof stubFetch>) => JSON.parse(fetch.mock.calls[0]![1]!.body as string);

describe("GeminiClient", () => {
  describe("generateText", () => {
    it("posts to generateContent with the key in a header, never in the URL", async () => {
      const fetch = stubFetch(reply("hi"));
      expect(await make(fetch).generateText(prompt)).toBe("hi");

      const [url, init] = fetch.mock.calls[0]!;
      expect(url).toBe("https://generativelanguage.googleapis.com/v1beta/models/test-model:generateContent");
      expect(String(url)).not.toContain(API_KEY);
      expect(init!.method).toBe("POST");
      expect(init!.headers).toMatchObject({ "x-goog-api-key": API_KEY, "Content-Type": "application/json" });
    });

    it("uses the configured base URL", async () => {
      const fetch = stubFetch(reply("hi"));
      await make(fetch, 1000, "https://gateway.example.com/gemini").generateText(prompt);
      expect(fetch.mock.calls[0]![0]).toBe("https://gateway.example.com/gemini/models/test-model:generateContent");
    });

    it("sends the system prompt as systemInstruction and the user turn as contents", async () => {
      const fetch = stubFetch(reply("hi"));
      await make(fetch).generateText(prompt);

      const body = sentBody(fetch);
      expect(body.systemInstruction).toEqual({ parts: [{ text: "be brief" }] });
      expect(body.contents).toEqual([{ role: "user", parts: [{ text: "hello" }] }]);
      expect(body.generationConfig.temperature).toBeGreaterThan(0);
      expect(body.generationConfig).not.toHaveProperty("responseMimeType");
      expect(body.generationConfig).not.toHaveProperty("responseJsonSchema");
    });

    it("sends few-shot examples as alternating user/model turns before the final user message", async () => {
      const fetch = stubFetch(reply("hi"));
      await make(fetch).generateText({
        ...prompt,
        examples: [
          { user: "q1", assistant: "a1" },
          { user: "q2", assistant: "a2" },
        ],
      });
      expect(sentBody(fetch).contents).toEqual([
        { role: "user", parts: [{ text: "q1" }] },
        { role: "model", parts: [{ text: "a1" }] },
        { role: "user", parts: [{ text: "q2" }] },
        { role: "model", parts: [{ text: "a2" }] },
        { role: "user", parts: [{ text: "hello" }] },
      ]);
    });

    it("joins multiple text parts and trims", async () => {
      const fetch = stubFetch({
        candidates: [{ content: { parts: [{ text: " one " }, { text: "two " }] }, finishReason: "STOP" }],
      });
      expect(await make(fetch).generateText(prompt)).toBe("one two");
    });
  });

  describe("generateJson", () => {
    it("requests JSON with temperature 0, sends the schema without $schema, and parses the text", async () => {
      const fetch = stubFetch(reply('{"city":"Paris"}'));
      expect(await make(fetch).generateJson(prompt, schema)).toEqual({ city: "Paris" });

      const config = sentBody(fetch).generationConfig;
      expect(config.temperature).toBe(0);
      expect(config.responseMimeType).toBe("application/json");
      expect(config.responseJsonSchema).toEqual({ type: "object", properties: {} });
    });

    it("throws LlmError when the text is not JSON", async () => {
      await expect(make(stubFetch(reply("sure! here you go"))).generateJson(prompt, schema)).rejects.toThrow(
        LlmError,
      );
    });
  });

  describe.each([
    ["generateText", (client: ReturnType<typeof make>) => client.generateText(prompt)],
    ["generateJson", (client: ReturnType<typeof make>) => client.generateJson(prompt, schema)],
  ])("%s failures", (_name, call) => {
    const failure = async (fetch: typeof globalThis.fetch) => {
      const error = (await call(make(fetch)).catch((e) => e)) as Error;
      expect(error).toBeInstanceOf(LlmError);
      expect(error.message).not.toContain(API_KEY);
      return error;
    };

    it("maps 400 to a bad-request error naming the model", async () => {
      const error = await failure(stubFetch({ error: { message: "API key not valid" } }, { status: 400 }));
      expect(error.message).toContain("400");
      expect(error.message).toContain("test-model");
    });

    it.each([401, 403])("maps %i to an invalid-key message", async (status) => {
      const error = await failure(stubFetch({ error: { message: "denied" } }, { status }));
      expect(error.message).toMatch(/api key/i);
      expect(error.message).toContain(String(status));
    });

    it("maps 429 to a rate-limit/quota message", async () => {
      const error = await failure(stubFetch({ error: { message: "quota" } }, { status: 429 }));
      expect(error.message).toMatch(/rate limit|quota/i);
    });

    it("throws LlmError on other non-2xx responses", async () => {
      const error = await failure(stubFetch("boom", { status: 503 }));
      expect(error.message).toContain("503");
    });

    it("wraps network errors, keeping the cause", async () => {
      const cause = new TypeError("fetch failed");
      const error = (await call(make(failingFetch(cause))).catch((e) => e)) as Error;
      expect(error).toBeInstanceOf(LlmError);
      expect(error.cause).toBe(cause);
      expect(error.message).not.toContain(API_KEY);
    });

    it("turns a timeout into LlmError", async () => {
      const error = (await call(make(hangingFetch(), 10)).catch((e) => e)) as Error;
      expect(error).toBeInstanceOf(LlmError);
      expect(error.message).toMatch(/timed out/i);
    });

    it("reports a blocked prompt with its reason", async () => {
      const error = await failure(stubFetch({ promptFeedback: { blockReason: "SAFETY" } }));
      expect(error.message).toMatch(/blocked/i);
      expect(error.message).toContain("SAFETY");
    });

    it("throws when there are no candidates", async () => {
      await failure(stubFetch({ candidates: [] }));
      await failure(stubFetch({}));
    });

    it.each(["MAX_TOKENS", "SAFETY", "RECITATION"])("throws when finishReason is %s", async (finishReason) => {
      const error = await failure(stubFetch(reply("partial", { finishReason })));
      expect(error.message).toContain(finishReason);
    });

    it("throws on empty text", async () => {
      await failure(stubFetch(reply("  ")));
      await failure(stubFetch({ candidates: [{ content: { parts: [] }, finishReason: "STOP" }] }));
    });

    it("throws on a non-JSON response body", async () => {
      await failure(stubFetch("<html>oops</html>"));
    });
  });
});
