import { describe, expect, it } from "vitest";
import { computeStats } from "../../src/domain/userStats.js";
import { userWith } from "../fixtures/buildUser.js";

const withAges = (...ages: number[]) => ages.map((age) => userWith({ age }));

describe("computeStats", () => {
  it("handles an empty list", () => {
    expect(computeStats([])).toEqual({
      total: 0,
      age: { min: null, max: null, mean: null, median: null },
      ageBuckets: { "<20": 0, "20-29": 0, "30-39": 0, "40-49": 0, "50-59": 0, "60-69": 0, "70+": 0 },
      gender: {},
      countries: { distinct: 0, top: [] },
    });
  });

  it("computes total, min, max", () => {
    const stats = computeStats(withAges(30, 50, 40));
    expect(stats.total).toBe(3);
    expect(stats.age.min).toBe(30);
    expect(stats.age.max).toBe(50);
  });

  it("rounds the mean to one decimal", () => {
    expect(computeStats(withAges(20, 21, 21)).age.mean).toBe(20.7);
  });

  it("computes the median for odd and even counts", () => {
    expect(computeStats(withAges(50, 20, 30)).age.median).toBe(30);
    expect(computeStats(withAges(20, 30, 40, 51)).age.median).toBe(35);
  });

  it("assigns ages to buckets at their boundaries", () => {
    const stats = computeStats(withAges(19, 20, 29, 30, 39, 40, 49, 50, 59, 60, 69, 70, 99));
    expect(stats.ageBuckets).toEqual({
      "<20": 1,
      "20-29": 2,
      "30-39": 2,
      "40-49": 2,
      "50-59": 2,
      "60-69": 2,
      "70+": 2,
    });
  });

  it("counts genders", () => {
    const users = [
      userWith({ gender: "female" }),
      userWith({ gender: "male" }),
      userWith({ gender: "female" }),
    ];
    expect(computeStats(users).gender).toEqual({ female: 2, male: 1 });
  });

  it("returns the top 5 countries sorted by count desc then name asc", () => {
    const countries = [
      ...Array(3).fill("Spain"),
      ...Array(3).fill("Brazil"),
      ...Array(2).fill("Chile"),
      "Peru",
      "Ireland",
      "Norway",
      "Canada",
    ];
    const stats = computeStats(countries.map((country) => userWith({ country })));
    expect(stats.countries.distinct).toBe(7);
    expect(stats.countries.top).toEqual([
      { country: "Brazil", count: 3 },
      { country: "Spain", count: 3 },
      { country: "Chile", count: 2 },
      { country: "Canada", count: 1 },
      { country: "Ireland", count: 1 },
    ]);
  });
});
