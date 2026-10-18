import { describe, expect, it } from "vitest";
import { applyFilter, matches, userFilterSchema } from "../../src/domain/userFilter.js";
import { userWith } from "../fixtures/buildUser.js";

describe("userFilterSchema", () => {
  it.each([
    ["gt bound", { age: { gt: 40 } }],
    ["range", { age: { gte: 20, lte: 35 } }],
    ["city only", { city: "Charleston" }],
    ["age and city", { age: { lt: 30 }, city: "Charleston" }],
    ["contradictory range", { age: { gt: 50, lt: 30 } }],
  ])("accepts %s", (_name, input) => {
    expect(userFilterSchema.safeParse(input).success).toBe(true);
  });

  it.each([
    ["empty object", {}],
    ["empty age", { age: {} }],
    ["blank city", { city: "   " }],
    ["age out of range", { age: { gt: 151 } }],
    ["negative age", { age: { gte: -1 } }],
    ["non-integer age", { age: { gt: 40.5 } }],
    ["unknown bound", { age: { eq: 40 } }],
  ])("rejects %s", (_name, input) => {
    expect(userFilterSchema.safeParse(input).success).toBe(false);
  });

  it("trims the city", () => {
    expect(userFilterSchema.parse({ city: "  Charleston " })).toEqual({ city: "Charleston" });
  });
});

describe("matches", () => {
  it("applies exclusive bounds (gt / lt)", () => {
    expect(matches(userWith({ age: 41 }), { age: { gt: 40 } })).toBe(true);
    expect(matches(userWith({ age: 40 }), { age: { gt: 40 } })).toBe(false);
    expect(matches(userWith({ age: 29 }), { age: { lt: 30 } })).toBe(true);
    expect(matches(userWith({ age: 30 }), { age: { lt: 30 } })).toBe(false);
  });

  it("applies inclusive bounds (gte / lte)", () => {
    const filter = { age: { gte: 20, lte: 35 } };
    expect(matches(userWith({ age: 20 }), filter)).toBe(true);
    expect(matches(userWith({ age: 35 }), filter)).toBe(true);
    expect(matches(userWith({ age: 19 }), filter)).toBe(false);
    expect(matches(userWith({ age: 36 }), filter)).toBe(false);
  });

  it("matches nothing for a contradictory range", () => {
    const filter = { age: { gt: 50, lt: 30 } };
    expect(matches(userWith({ age: 20 }), filter)).toBe(false);
    expect(matches(userWith({ age: 60 }), filter)).toBe(false);
  });

  it("matches city ignoring case, whitespace and accents", () => {
    expect(matches(userWith({ city: "Charleston" }), { city: "charleston" })).toBe(true);
    expect(matches(userWith({ city: "Charleston" }), { city: "  CHARLESTON " })).toBe(true);
    expect(matches(userWith({ city: "Zürich" }), { city: "zurich" })).toBe(true);
    expect(matches(userWith({ city: "Zurich" }), { city: "Zürich" })).toBe(true);
  });

  it("requires an exact city match, not a substring", () => {
    expect(matches(userWith({ city: "Charleston" }), { city: "Charles" })).toBe(false);
    expect(matches(userWith({ city: "West Charleston" }), { city: "Charleston" })).toBe(false);
  });

  it("requires all criteria to match", () => {
    const filter = { age: { gt: 40 }, city: "Charleston" };
    expect(matches(userWith({ age: 50, city: "Charleston" }), filter)).toBe(true);
    expect(matches(userWith({ age: 30, city: "Charleston" }), filter)).toBe(false);
    expect(matches(userWith({ age: 50, city: "Boston" }), filter)).toBe(false);
  });
});

describe("applyFilter", () => {
  it("returns the original user objects", () => {
    const young = userWith({ age: 25 });
    const old = userWith({ age: 55 });
    const result = applyFilter([young, old], { age: { gt: 40 } });
    expect(result).toHaveLength(1);
    expect(result[0]).toBe(old);
  });

  it("returns an empty array when nothing matches", () => {
    expect(applyFilter([userWith({ age: 25 })], { age: { gt: 40 } })).toEqual([]);
  });
});
