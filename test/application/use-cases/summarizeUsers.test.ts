import { describe, expect, it } from "vitest";
import { LlmError } from "../../../src/application/errors.js";
import { makeSummarizeUsers } from "../../../src/application/use-cases/summarizeUsers.js";
import { userWith } from "../../fixtures/buildUser.js";
import { fakeLlm, fakeUserProvider } from "../../fixtures/fakes.js";

const users = [userWith({ age: 30, country: "Spain" }), userWith({ age: 50, country: "Spain" })];

describe("summarizeUsers", () => {
  it("fetches 100 users and returns the trimmed LLM summary", async () => {
    const { provider, requested } = fakeUserProvider(users);
    const { llm } = fakeLlm(["  Two users, mean age 40.  \n"]);
    const result = await makeSummarizeUsers({ userProvider: provider, llm })();
    expect(result).toEqual({ summary: "Two users, mean age 40." });
    expect(requested).toEqual([100]);
  });

  it("sends aggregated stats to the LLM and no personal data", async () => {
    const { provider } = fakeUserProvider(users);
    const { llm, prompts } = fakeLlm(["ok"]);
    await makeSummarizeUsers({ userProvider: provider, llm })();

    const sent = JSON.stringify(prompts[0]);
    expect(prompts[0]!.user).toContain('"total":2');
    expect(prompts[0]!.user).toContain("Spain");
    expect(sent).not.toContain("jane.doe@example.com");
    expect(sent).not.toContain("Jane");
    expect(sent).not.toContain("Doe");
    expect(sent).not.toContain("123-45-6789");
    expect(prompts[0]!.system).toMatch(/only/i);
  });

  it("instructs the model to be brief and to avoid unjustified 'majority' claims", async () => {
    const { provider } = fakeUserProvider(users);
    const { llm, prompts } = fakeLlm(["ok"]);
    await makeSummarizeUsers({ userProvider: provider, llm })();

    const system = prompts[0]!.system;
    expect(system).toMatch(/2 to 3 short sentences/i);
    expect(system).toMatch(/ONLY the (provided )?numbers/i);
    expect(system).toMatch(/"the largest group"/i);
    expect(system).toMatch(/more than half/i);
    expect(system).toMatch(/never .*"majority"/i);
  });

  it("throws LlmError when the summary is empty", async () => {
    const { provider } = fakeUserProvider(users);
    const { llm } = fakeLlm(["   "]);
    await expect(makeSummarizeUsers({ userProvider: provider, llm })()).rejects.toBeInstanceOf(LlmError);
  });
});
