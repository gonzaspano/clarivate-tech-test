import { describe, expect, it } from "vitest";
import { UpstreamError } from "../../../src/application/errors.js";
import { makeRandomUserClient } from "../../../src/infrastructure/randomuser/RandomUserClient.js";
import { buildUser } from "../../fixtures/buildUser.js";
import { failingFetch, hangingFetch, stubFetch } from "../../fixtures/stubFetch.js";

const baseUrl = "https://randomuser.test/api";
const make = (fetch: typeof globalThis.fetch, timeoutMs = 1000) =>
  makeRandomUserClient({ baseUrl, timeoutMs, fetch });

describe("RandomUserClient", () => {
  it("requests the given number of results", async () => {
    const fetch = stubFetch({ results: [] });
    await make(fetch).fetchRawUsers(50);
    expect(fetch.mock.calls[0]![0]).toBe(`${baseUrl}/?results=50`);
  });

  it("returns the raw body byte for byte", async () => {
    const body = '{ "results" : [ ],\n "info":{"seed":"abc"} }';
    expect(await make(stubFetch(body)).fetchRawUsers(1)).toBe(body);
  });

  it("parses users and keeps every original field", async () => {
    const user = buildUser();
    const users = await make(stubFetch({ results: [user] })).fetchUsers(1);
    expect(users).toEqual([user]);
  });

  it("rejects a non-2xx response with UpstreamError", async () => {
    const client = make(stubFetch("nope", { status: 503 }));
    await expect(client.fetchRawUsers(1)).rejects.toThrow(UpstreamError);
    await expect(client.fetchRawUsers(1)).rejects.toThrow(/503/);
  });

  it("rejects a 200 response carrying an `error` key", async () => {
    const client = make(stubFetch({ error: "Uh oh, something has gone wrong" }));
    await expect(client.fetchRawUsers(1)).rejects.toThrow(UpstreamError);
    await expect(client.fetchUsers(1)).rejects.toThrow(/something has gone wrong/);
  });

  it("wraps network errors, keeping the cause", async () => {
    const cause = new TypeError("fetch failed");
    const error = await make(failingFetch(cause)).fetchRawUsers(1).catch((e) => e);
    expect(error).toBeInstanceOf(UpstreamError);
    expect(error.cause).toBe(cause);
  });

  it("turns a timeout into UpstreamError", async () => {
    const error = await make(hangingFetch(), 10).fetchRawUsers(1).catch((e) => e);
    expect(error).toBeInstanceOf(UpstreamError);
    expect(error.message).toMatch(/timed out/i);
  });

  it("rejects a body that is not JSON", async () => {
    await expect(make(stubFetch("<html>")).fetchRawUsers(1)).rejects.toThrow(UpstreamError);
  });

  it("rejects users missing a field the app depends on", async () => {
    const broken = { ...buildUser(), dob: { date: "x" } };
    await expect(make(stubFetch({ results: [broken] })).fetchUsers(1)).rejects.toThrow(UpstreamError);
  });

  it("rejects a body without results", async () => {
    await expect(make(stubFetch({ info: {} })).fetchUsers(1)).rejects.toThrow(UpstreamError);
  });
});
