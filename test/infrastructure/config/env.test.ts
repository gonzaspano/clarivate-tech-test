import { describe, expect, it } from "vitest";
import { loadEnv } from "../../../src/infrastructure/config/env.js";

describe("loadEnv", () => {
  it("applies defaults", () => {
    expect(loadEnv({})).toEqual({
      PORT: 3000,
      RANDOMUSER_BASE_URL: "https://randomuser.me/api",
      RANDOMUSER_TIMEOUT_MS: 10000,
      OLLAMA_BASE_URL: "http://localhost:11434",
      OLLAMA_MODEL: "qwen2.5:7b",
      OLLAMA_MAX_TOKENS: 256,
      LLM_TIMEOUT_MS: 60000,
      LLM_PROVIDER: "ollama",
      GEMINI_MODEL: "gemini-3.8-flash",
    });
  });

  describe("LLM provider", () => {
    it("selects gemini when a key is provided", () => {
      const env = loadEnv({ LLM_PROVIDER: "gemini", GEMINI_API_KEY: "k", GEMINI_MODEL: "gemini-x" });
      expect(env.LLM_PROVIDER).toBe("gemini");
      expect(env.GEMINI_API_KEY).toBe("k");
      expect(env.GEMINI_MODEL).toBe("gemini-x");
    });

    it.each([["missing", {}], ["empty", { GEMINI_API_KEY: "" }]])("fails fast without a key when gemini is selected (%s)", (_n, extra) => {
      expect(() => loadEnv({ LLM_PROVIDER: "gemini", ...extra })).toThrow(/GEMINI_API_KEY/);
    });

    it("does not require a key for ollama, and treats an empty key as unset", () => {
      expect(loadEnv({ GEMINI_API_KEY: "" }).GEMINI_API_KEY).toBeUndefined();
      expect(loadEnv({ LLM_PROVIDER: "ollama" }).GEMINI_API_KEY).toBeUndefined();
    });

    it("rejects unknown providers and never echoes the key in errors", () => {
      expect(() => loadEnv({ LLM_PROVIDER: "openai" })).toThrow();
      expect(() => loadEnv({ LLM_PROVIDER: "nope", GEMINI_API_KEY: "secret-123" })).toThrow(/^(?!.*secret-123)/s);
    });
  });

  it("coerces numbers and overrides defaults", () => {
    const env = loadEnv({ PORT: "8080", OLLAMA_MODEL: "llama3.2:3b", LLM_TIMEOUT_MS: "5000" });
    expect(env.PORT).toBe(8080);
    expect(env.OLLAMA_MODEL).toBe("llama3.2:3b");
    expect(env.LLM_TIMEOUT_MS).toBe(5000);
  });

  it("overrides the Ollama generation cap", () => {
    expect(loadEnv({ OLLAMA_MAX_TOKENS: "512" }).OLLAMA_MAX_TOKENS).toBe(512);
  });

  it.each([
    ["non-numeric port", { PORT: "abc" }],
    ["port out of range", { PORT: "70000" }],
    ["negative timeout", { LLM_TIMEOUT_MS: "-1" }],
    ["invalid url", { OLLAMA_BASE_URL: "not a url" }],
    ["empty model", { OLLAMA_MODEL: "" }],
    ["zero max tokens", { OLLAMA_MAX_TOKENS: "0" }],
    ["fractional max tokens", { OLLAMA_MAX_TOKENS: "1.5" }],
    ["non-numeric max tokens", { OLLAMA_MAX_TOKENS: "abc" }],
  ])("fails fast on %s", (_name, source) => {
    expect(() => loadEnv(source)).toThrow();
  });
});
