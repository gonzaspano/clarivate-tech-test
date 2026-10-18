import { describe, expect, it } from "vitest";
import { extractFilter } from "../../src/application/extractFilter.js";
import { InvalidQueryError, LlmError } from "../../src/application/errors.js";
import { fakeLlm, fakeLogger } from "../fixtures/fakes.js";

const nullFilter = { age: null, city: null };
const ageFilter = (age: object) => ({ age: { gt: null, gte: null, lt: null, lte: null, ...age }, city: null });

const setup = (replies: unknown[]) => {
  const { llm, prompts, schemas } = fakeLlm(replies);
  const { logger, entries } = fakeLogger();
  return { run: (query: string) => extractFilter(llm, query, logger), prompts, schemas, entries };
};

describe("extractFilter", () => {
  it("returns the domain filter with nulls stripped", async () => {
    const { run } = setup([ageFilter({ gt: 40 })]);
    expect(await run("People older than 40")).toEqual({ age: { gt: 40 } });
  });

  it("supports a city-only filter", async () => {
    const { run } = setup([{ age: null, city: "Paris" }]);
    expect(await run("Users from Paris")).toEqual({ city: "Paris" });
  });

  it("sends the query, the rules as system prompt, the examples as turns and a JSON schema", async () => {
    const { run, prompts, schemas } = setup([ageFilter({ lt: 30 })]);
    await run("People younger than 30");
    expect(prompts[0]!.user).toBe("Request: People younger than 30");
    expect(prompts[0]!.system).toContain("Rules:");
    expect(prompts[0]!.system).not.toContain("Users living in Charleston");
    expect(prompts[0]!.examples).toContainEqual({
      user: "Request: Users living in Charleston",
      assistant: '{"age":null,"city":"Charleston"}',
    });
    expect(schemas[0]).toHaveProperty("properties.city");
  });

  it("gives every example answer as valid JSON matching the LLM filter shape", async () => {
    const { run, prompts } = setup([nullFilter]);
    await run("x").catch(() => undefined);
    for (const example of prompts[0]!.examples!) {
      const parsed = JSON.parse(example.assistant);
      expect(Object.keys(parsed).sort()).toEqual(["age", "city"]);
    }
  });

  it("retries once when the first output is invalid, logging the retry", async () => {
    const { run, prompts, entries } = setup([{ nonsense: true }, ageFilter({ gt: 40 })]);
    expect(await run("older than 40")).toEqual({ age: { gt: 40 } });
    expect(prompts).toHaveLength(2);
    expect(entries).toContainEqual({
      message: "search.llm_retry",
      data: { query: "older than 40", attempt: 1, issues: expect.stringContaining("age") },
    });
  });

  it("retries with the failed output as an assistant turn and the validation problems as feedback", async () => {
    const { run, prompts } = setup([{ age: "old", city: null }, ageFilter({ gt: 40 })]);
    await run("older than 40");
    const [first, second] = prompts;
    expect(first!.user).toBe("Request: older than 40");
    expect(second!.system).toBe(first!.system);
    expect(second!.examples).toEqual([
      ...first!.examples!,
      { user: "Request: older than 40", assistant: '{"age":"old","city":null}' },
    ]);
    expect(second!.user).toContain("age");
    expect(second!.user).toContain("older than 40");
  });

  it("keeps the first prompt free of any feedback", async () => {
    const { run, prompts } = setup([ageFilter({ gt: 40 })]);
    await run("older than 40");
    expect(prompts[0]!.user).toBe("Request: older than 40");
    expect(prompts[0]!.examples).toHaveLength(7);
  });

  it("throws LlmError when the output is invalid twice", async () => {
    const { run, prompts } = setup([{ bad: 1 }, "not an object"]);
    await expect(run("older than 40")).rejects.toBeInstanceOf(LlmError);
    expect(prompts).toHaveLength(2);
  });

  it("propagates an LlmError from the provider without retrying", async () => {
    const { run, prompts } = setup([new LlmError("ollama down")]);
    await expect(run("older than 40")).rejects.toBeInstanceOf(LlmError);
    expect(prompts).toHaveLength(1);
  });

  it("throws InvalidQueryError naming the supported filters when nothing was extracted", async () => {
    const { run, prompts } = setup([nullFilter]);
    const error = await run("People who like jazz").catch((e) => e);
    expect(error).toBeInstanceOf(InvalidQueryError);
    expect(error.message).toMatch(/age/);
    expect(error.message).toMatch(/city/);
    expect(prompts).toHaveLength(1);
  });

  it("treats a domain-invalid filter (age out of range) as an unsupported query", async () => {
    const { run } = setup([ageFilter({ gt: 500 })]);
    await expect(run("older than 500")).rejects.toBeInstanceOf(InvalidQueryError);
  });
});
