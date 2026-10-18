import { describe, expect, it } from "vitest";
import { toPublicUser } from "../../src/application/publicUser.js";
import { buildUser } from "../fixtures/buildUser.js";

describe("toPublicUser", () => {
  it("removes login and keeps the rest", () => {
    const user = buildUser();
    const { login: _login, ...rest } = user;
    expect(toPublicUser(user)).toEqual(rest);
    expect(toPublicUser(user)).not.toHaveProperty("login");
  });

  it("does not mutate its input", () => {
    const user = buildUser();
    toPublicUser(user);
    expect(user).toHaveProperty("login");
  });
});
