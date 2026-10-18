import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { InvalidQueryError, LlmError, UpstreamError } from "../../../../src/application/errors.js";
import { createApp } from "../../../../src/infrastructure/http/app.js";
import { fakeLogger } from "../../../fixtures/fakes.js";
import { buildUser } from "../../../fixtures/buildUser.js";

const makeApp = (overrides: Partial<Parameters<typeof createApp>[0]> = {}) => {
  const useCases = {
    getUsers: vi.fn(async () => "{}"),
    summarizeUsers: vi.fn(async () => ({ summary: "A summary." })),
    searchUsers: vi.fn(async (_query: string) => ({ users: [buildUser()] })),
    ...overrides,
  };
  return { app: createApp(useCases, fakeLogger().logger), useCases };
};

describe("GET /users", () => {
  it("passes the raw upstream body through byte for byte as JSON", async () => {
    const raw = '{ "results":[{"a":1.0}],\n "info" : {"seed":"x"} }';
    const { app } = makeApp({ getUsers: async () => raw });
    const response = await request(app).get("/users").buffer(true).parse((res, done) => {
      let data = "";
      res.on("data", (chunk: Buffer) => (data += chunk.toString()));
      res.on("end", () => done(null, data));
    });
    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toMatch(/^application\/json/);
    expect(response.body).toBe(raw);
  });

  it("maps an upstream failure to 502", async () => {
    const { app } = makeApp({
      getUsers: async () => {
        throw new UpstreamError("randomuser down");
      },
    });
    const response = await request(app).get("/users");
    expect(response.status).toBe(502);
    expect(response.body).toEqual({ error: { code: "UPSTREAM_ERROR", message: "randomuser down" } });
  });
});

describe("GET /users/summary", () => {
  it("returns the summary", async () => {
    const response = await request(makeApp().app).get("/users/summary");
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ summary: "A summary." });
  });

  it("maps an LLM failure to 502", async () => {
    const { app } = makeApp({
      summarizeUsers: async () => {
        throw new LlmError("ollama down");
      },
    });
    const response = await request(app).get("/users/summary");
    expect(response.status).toBe(502);
    expect(response.body.error.code).toBe("LLM_ERROR");
  });
});

describe("POST /users/search", () => {
  it("passes the query to the use case and returns { users }", async () => {
    const { app, useCases } = makeApp();
    const response = await request(app).post("/users/search").send({ query: "  People older than 40  " });
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ users: [buildUser()] });
    expect(useCases.searchUsers).toHaveBeenCalledWith("People older than 40");
  });

  it.each([
    ["missing query", {}],
    ["non-string query", { query: 42 }],
    ["blank query", { query: "   " }],
    ["too long query", { query: "a".repeat(501) }],
  ])("rejects %s with 400", async (_name, body) => {
    const { app, useCases } = makeApp();
    const response = await request(app).post("/users/search").send(body);
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("BAD_REQUEST");
    expect(useCases.searchUsers).not.toHaveBeenCalled();
  });

  it("rejects a request without a body with 400", async () => {
    const response = await request(makeApp().app).post("/users/search");
    expect(response.status).toBe(400);
  });

  it("maps an unsupported query to 422", async () => {
    const { app } = makeApp({
      searchUsers: async () => {
        throw new InvalidQueryError("unsupported");
      },
    });
    const response = await request(app).post("/users/search").send({ query: "who likes jazz" });
    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe("INVALID_QUERY");
  });

  it("maps an LLM failure to 502, distinct from 422", async () => {
    const { app } = makeApp({
      searchUsers: async () => {
        throw new LlmError("bad output");
      },
    });
    const response = await request(app).post("/users/search").send({ query: "older than 40" });
    expect(response.status).toBe(502);
  });

  it("forwards unexpected async errors to the error handler as 500", async () => {
    const { app } = makeApp({
      searchUsers: async () => {
        throw new Error("bug");
      },
    });
    const quiet = vi.spyOn(console, "error").mockImplementation(() => {});
    const response = await request(app).post("/users/search").send({ query: "older than 40" });
    quiet.mockRestore();
    expect(response.status).toBe(500);
    expect(response.body.error.code).toBe("INTERNAL_ERROR");
  });
});
