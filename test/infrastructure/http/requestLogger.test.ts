import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { makeRequestLogger } from "../../../src/infrastructure/http/requestLogger.js";
import { fakeLogger } from "../../fixtures/fakes.js";

function appWith(logger = fakeLogger().logger) {
  const app = express();
  app.use(makeRequestLogger(logger));
  app.get("/ok", (_req, res) => void res.json({ ok: true }));
  app.get("/health", (_req, res) => void res.json({ status: "ok" }));
  app.get("/bad-gateway", (_req, res) => void res.status(502).json({}));
  app.get("/boom", (_req, res) => void res.status(500).json({}));
  return app;
}

describe("requestLogger", () => {
  it("logs a finished request with method, path, status and a numeric duration", async () => {
    const { logger, entries } = fakeLogger();
    await request(appWith(logger)).get("/ok");
    expect(entries).toHaveLength(1);
    expect(entries[0]!.message).toBe("http.request");
    expect(entries[0]!.data).toMatchObject({ method: "GET", path: "/ok", status: 200 });
    expect(entries[0]!.data!.durationMs).toEqual(expect.any(Number));
    expect(entries[0]!.data!.durationMs as number).toBeGreaterThanOrEqual(0);
  });

  it("strips the query string from the logged path", async () => {
    const { logger, entries } = fakeLogger();
    await request(appWith(logger)).get("/ok?secret=1&q=2");
    expect(entries[0]!.data!.path).toBe("/ok");
  });

  it("logs unmatched routes with their 404 status", async () => {
    const { logger, entries } = fakeLogger();
    await request(appWith(logger)).get("/nope");
    expect(entries[0]!.data).toMatchObject({ method: "GET", path: "/nope", status: 404 });
  });

  it.each([["/bad-gateway", 502], ["/boom", 500]])("logs error status for %s", async (path, status) => {
    const { logger, entries } = fakeLogger();
    await request(appWith(logger)).get(path);
    expect(entries[0]!.data).toMatchObject({ path, status });
  });

  it("does not log /health, even with a query string", async () => {
    const { logger, entries } = fakeLogger();
    await request(appWith(logger)).get("/health");
    await request(appWith(logger)).get("/health?x=1");
    expect(entries).toEqual([]);
  });
});
