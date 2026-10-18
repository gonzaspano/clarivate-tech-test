import { describe, expect, it } from "vitest";
import { InvalidQueryError, LlmError, UpstreamError } from "../../src/application/errors.js";

describe("application errors", () => {
  it.each([
    [new UpstreamError("a"), "UPSTREAM_ERROR"],
    [new LlmError("b"), "LLM_ERROR"],
    [new InvalidQueryError("c"), "INVALID_QUERY"],
  ])("exposes a stable code", (error, code) => {
    expect(error).toBeInstanceOf(Error);
    expect(error.code).toBe(code);
  });

  it("keeps the message and cause", () => {
    const cause = new Error("boom");
    const error = new UpstreamError("randomuser failed", { cause });
    expect(error.message).toBe("randomuser failed");
    expect(error.cause).toBe(cause);
  });
});
