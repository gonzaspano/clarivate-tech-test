import type { UserProvider } from "../ports/UserProvider.js";

const USER_COUNT = 50;

export const makeGetUsers =
  ({ userProvider }: { userProvider: UserProvider }) =>
  (): Promise<string> =>
    userProvider.fetchRawUsers(USER_COUNT);
