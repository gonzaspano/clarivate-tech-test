import { computeStats } from "../../domain/userStats.js";
import { LlmError } from "../errors.js";
import type { LlmProvider } from "../ports/LlmProvider.js";
import type { UserProvider } from "../ports/UserProvider.js";

const SAMPLE_SIZE = 100;

const SYSTEM_PROMPT = `You summarize a dataset of users from pre-computed statistics.
Write 2 to 3 short sentences of plain prose describing the dataset.
Use ONLY the numbers in the provided statistics. Never invent, estimate or round figures that are not given.
Describe a group as "the largest group" unless its count is more than half of the total. Never call a group a "majority" otherwise.
Do not use bullet points, markdown or headings.`;

type Deps = { userProvider: UserProvider; llm: LlmProvider };

export const makeSummarizeUsers =
  ({ userProvider, llm }: Deps) =>
  async (): Promise<{ summary: string }> => {
    const users = await userProvider.fetchUsers(SAMPLE_SIZE);
    // Data minimization: only aggregates leave the process, never the PII-bearing records.
    const stats = computeStats(users);
    const text = await llm.generateText({
      system: SYSTEM_PROMPT,
      user: `Statistics:\n${JSON.stringify(stats)}`,
    });
    const summary = text.trim();
    if (!summary)
      throw new LlmError("The language model returned an empty summary");
    return { summary };
  };
