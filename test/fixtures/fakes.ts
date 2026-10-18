import type { Logger } from "../../src/application/ports/Logger.js";
import type { LlmProvider, Prompt } from "../../src/application/ports/LlmProvider.js";
import type { UserProvider } from "../../src/application/ports/UserProvider.js";
import type { User } from "../../src/domain/user.js";

export function fakeUserProvider(users: User[] = [], raw = "{}") {
  const requested: number[] = [];
  const provider: UserProvider = {
    fetchRawUsers: async (count) => {
      requested.push(count);
      return raw;
    },
    fetchUsers: async (count) => {
      requested.push(count);
      return users;
    },
  };
  return { provider, requested };
}

/** Each call consumes the next scripted reply; an Error instance is thrown instead of returned. */
export function fakeLlm(replies: Array<unknown | Error>) {
  const prompts: Prompt[] = [];
  const schemas: Array<Record<string, unknown>> = [];
  const next = async (prompt: Prompt) => {
    prompts.push(prompt);
    const reply = replies[prompts.length - 1];
    if (reply instanceof Error) throw reply;
    return reply;
  };
  const llm: LlmProvider = {
    generateText: async (prompt) => (await next(prompt)) as string,
    generateJson: async (prompt, schema) => {
      schemas.push(schema);
      return next(prompt);
    },
  };
  return { llm, prompts, schemas };
}

/** Records log calls so tests can assert on them. */
export function fakeLogger() {
  const entries: Array<{ message: string; data?: Record<string, unknown> }> = [];
  const errors: Array<{ message: string; data?: Record<string, unknown> }> = [];
  const logger: Logger = {
    info: (message, data) => void entries.push({ message, ...(data && { data }) }),
    error: (message, data) => void errors.push({ message, ...(data && { data }) }),
  };
  return { logger, entries, errors };
}
