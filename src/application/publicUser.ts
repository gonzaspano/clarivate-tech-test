import type { User } from "../domain/user.js";

/** Policy: credentials (`login`) never leave through the search results. Returns a copy. */
export function toPublicUser(user: User): User {
  const { login: _login, ...publicUser } = user;
  return publicUser;
}
