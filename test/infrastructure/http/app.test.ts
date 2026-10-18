import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../../../src/infrastructure/http/app.js";
import { fakeLogger } from "../../fixtures/fakes.js";

const noopUseCases = {
  getUsers: async () => "{}",
  summarizeUsers: async () => ({ summary: "" }),
  searchUsers: async () => ({ users: [] }),
};

describe("createApp", () => {
  it("GET /health returns ok", async () => {
    const response = await request(createApp(noopUseCases, fakeLogger().logger)).get("/health");
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: "ok" });
  });

  it("returns a JSON 404 for unknown routes", async () => {
    const response = await request(createApp(noopUseCases, fakeLogger().logger)).get("/nope");
    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: { code: "NOT_FOUND", message: "Route not found" } });
  });
});
