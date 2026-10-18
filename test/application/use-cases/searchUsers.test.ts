import { describe, expect, it } from "vitest";
import { InvalidQueryError, LlmError } from "../../../src/application/errors.js";
import { makeSearchUsers } from "../../../src/application/use-cases/searchUsers.js";
import { toPublicUser } from "../../../src/application/publicUser.js";
import { userWith } from "../../fixtures/buildUser.js";
import { fakeLlm, fakeLogger, fakeUserProvider } from "../../fixtures/fakes.js";

const ageFilter = (age: object) => ({ age: { gt: null, gte: null, lt: null, lte: null, ...age }, city: null });

const young = userWith({ age: 25, city: "Paris" });
const old = userWith({ age: 55, city: "Charleston" });

const setup = (replies: unknown[], users = [young, old]) => {
  const { provider, requested } = fakeUserProvider(users);
  const { llm } = fakeLlm(replies);
  const { logger, entries } = fakeLogger();
  return { search: makeSearchUsers({ userProvider: provider, llm, logger }), requested, entries };
};

describe("searchUsers", () => {
  it("applies the extracted age filter to 300 fetched users", async () => {
    const { search, requested } = setup([ageFilter({ gt: 40 })]);
    const { users } = await search("People older than 40");
    expect(users).toEqual([toPublicUser(old)]);
    expect(requested).toEqual([300]);
  });

  it("never returns the login credentials", async () => {
    const { search } = setup([ageFilter({ gt: 0 })]);
    const { users } = await search("older than 0");
    expect(users).toHaveLength(2);
    for (const user of users) expect(user).not.toHaveProperty("login");
    expect(JSON.stringify(users)).not.toContain("secret");
  });

  it("keeps every other field and does not mutate the fetched users", async () => {
    const { search } = setup([ageFilter({ gt: 40 })]);
    const [result] = (await search("older than 40")).users;
    expect(result).toEqual(toPublicUser(old));
    expect(old).toHaveProperty("login");
  });

  it("logs the query, the extracted filter and the match count, never the users", async () => {
    const { search, entries } = setup([ageFilter({ gt: 40 })]);
    await search("People older than 40");
    expect(entries).toContainEqual({
      message: "search.filter_extracted",
      data: { query: "People older than 40", filter: { age: { gt: 40 } }, matched: 1, sampled: 2 },
    });
    expect(JSON.stringify(entries)).not.toContain("janedoe");
  });


  it("fails with LlmError when the model is unavailable", async () => {
    const { search } = setup([new LlmError("ollama down")]);
    await expect(search("older than 40")).rejects.toBeInstanceOf(LlmError);
  });

  it("fails with InvalidQueryError when the query is unsupported", async () => {
    const { search } = setup([{ age: null, city: null }]);
    await expect(search("People who like jazz")).rejects.toBeInstanceOf(InvalidQueryError);
  });
});
