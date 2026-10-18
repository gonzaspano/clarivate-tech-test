import type { User } from "../../domain/user.js";
import { applyFilter } from "../../domain/userFilter.js";
import { extractFilter } from "../extractFilter.js";
import { toPublicUser } from "../publicUser.js";
import type { LlmProvider } from "../ports/LlmProvider.js";
import type { Logger } from "../ports/Logger.js";
import type { UserProvider } from "../ports/UserProvider.js";

const SAMPLE_SIZE = 300;

type Deps = { userProvider: UserProvider; llm: LlmProvider; logger: Logger };

export function makeSearchUsers({ userProvider, llm, logger }: Deps) {
  return async (query: string): Promise<{ users: User[] }> => {
    const [filter, users] = await Promise.all([
      extractFilter(llm, query, logger),
      userProvider.fetchUsers(SAMPLE_SIZE),
    ]);
    const matched = applyFilter(users, filter);
    logger.info("search.filter_extracted", { query, filter, matched: matched.length, sampled: users.length });
    return { users: matched.map(toPublicUser) };
  };
}
