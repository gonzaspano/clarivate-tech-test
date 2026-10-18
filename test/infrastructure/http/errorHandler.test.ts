import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { InvalidQueryError, LlmError, UpstreamError } from "../../../src/application/errors.js";
import { makeErrorHandler } from "../../../src/infrastructure/http/errorHandler.js";
import { fakeLogger } from "../../fixtures/fakes.js";

function appThrowing(error: unknown, logger = fakeLogger().logger) {
  const app = express();
  app.use(express.json());
  app.post("/boom", () => {
    throw error;
  });
  app.use(makeErrorHandler(logger));
  return app;
}

describe("errorHandler", () => {
  it.each([
    [new InvalidQueryError("bad query"), 422, "INVALID_QUERY", "bad query"],
    [new UpstreamError("randomuser down"), 502, "UPSTREAM_ERROR", "randomuser down"],
    [new LlmError("llm down"), 502, "LLM_ERROR", "llm down"],
  ])("maps %s", async (error, status, code, message) => {
    const response = await request(appThrowing(error)).post("/boom");
    expect(response.status).toBe(status);
    expect(response.body).toEqual({ error: { code, message } });
  });

  it("maps Zod errors to 400", async () => {
    const zodError = z.object({ query: z.string() }).safeParse({}).error;
    const response = await request(appThrowing(zodError)).post("/boom");
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("BAD_REQUEST");
    expect(response.body.error.message).toContain("query");
  });

  it("maps malformed JSON bodies to 400", async () => {
    const response = await request(appThrowing(new Error("unused")))
      .post("/boom")
      .set("Content-Type", "application/json")
      .send("{not json");
    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: { code: "BAD_REQUEST", message: "Malformed JSON body" },
    });
  });

  it("hides details of unknown errors", async () => {
    const response = await request(appThrowing(new Error("secret internals"))).post("/boom");
    expect(response.status).toBe(500);
    expect(response.body).toEqual({
      error: { code: "INTERNAL_ERROR", message: "Internal server error" },
    });
    expect(JSON.stringify(response.body)).not.toContain("secret");
    expect(JSON.stringify(response.body)).not.toContain("at ");
  });

  describe("logging", () => {
    it("logs a 502 with code, message, method, path and the cause chain, but no stack", async () => {
      const { logger, errors } = fakeLogger();
      const error = new LlmError("llm down", {
        cause: new TypeError("fetch failed", { cause: new Error("connect ECONNREFUSED") }),
      });
      const response = await request(appThrowing(error, logger)).post("/boom?q=1");
      expect(response.body).toEqual({ error: { code: "LLM_ERROR", message: "llm down" } });
      expect(errors).toEqual([
        {
          message: "http.error",
          data: {
            status: 502,
            code: "LLM_ERROR",
            error: "llm down",
            method: "POST",
            path: "/boom",
            causes: [
              { name: "TypeError", message: "fetch failed" },
              { name: "Error", message: "connect ECONNREFUSED" },
            ],
          },
        },
      ]);
    });

    it("limits the cause chain depth, even for circular causes", async () => {
      const { logger, errors } = fakeLogger();
      const error = new UpstreamError("loop");
      error.cause = error;
      await request(appThrowing(error, logger)).post("/boom");
      expect((errors[0]!.data!.causes as unknown[]).length).toBeLessThanOrEqual(5);
    });

    it("logs an unexpected 500 with its stack and an unchanged body", async () => {
      const { logger, errors } = fakeLogger();
      const response = await request(appThrowing(new Error("kaboom"), logger)).post("/boom");
      expect(response.body).toEqual({ error: { code: "INTERNAL_ERROR", message: "Internal server error" } });
      expect(errors[0]!.data).toMatchObject({ status: 500, code: "INTERNAL_ERROR", error: "kaboom", path: "/boom" });
      expect(errors[0]!.data!.stack).toContain("kaboom");
    });

    it("logs nothing for 4xx responses", async () => {
      const { logger, errors, entries } = fakeLogger();
      await request(appThrowing(new InvalidQueryError("bad"), logger)).post("/boom");
      expect(errors).toEqual([]);
      expect(entries).toEqual([]);
    });
  });
});
