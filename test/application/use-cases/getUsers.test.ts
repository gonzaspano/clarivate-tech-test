import { describe, expect, it } from "vitest";
import { makeGetUsers } from "../../../src/application/use-cases/getUsers.js";
import { fakeUserProvider } from "../../fixtures/fakes.js";

describe("getUsers", () => {
  it("returns the raw upstream body untouched, asking for 50 users", async () => {
    const raw = '{"results":[ ],  "info":{"seed":"x"}}';
    const { provider, requested } = fakeUserProvider([], raw);
    const result = await makeGetUsers({ userProvider: provider })();
    expect(result).toBe(raw);
    expect(requested).toEqual([50]);
  });
});
