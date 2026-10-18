import type { User } from "../../domain/user.js";

export type UserProvider = {
  /** The upstream JSON body text, untouched, so it can be passed through byte for byte. */
  fetchRawUsers(count: number): Promise<string>;
  fetchUsers(count: number): Promise<User[]>;
};
