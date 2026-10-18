import type { User } from "./user.js";

const AGE_BUCKETS = [
  { label: "<20", max: 20 },
  { label: "20-29", max: 30 },
  { label: "30-39", max: 40 },
  { label: "40-49", max: 50 },
  { label: "50-59", max: 60 },
  { label: "60-69", max: 70 },
  { label: "70+", max: Infinity },
] as const;

const TOP_COUNTRIES = 5;

export type UserStats = {
  total: number;
  age: { min: number | null; max: number | null; mean: number | null; median: number | null };
  ageBuckets: Record<string, number>;
  gender: Record<string, number>;
  countries: { distinct: number; top: Array<{ country: string; count: number }> };
};

function countBy<T>(items: T[], key: (item: T) => string): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const item of items) counts[key(item)] = (counts[key(item)] ?? 0) + 1;
  return counts;
}

function median(sorted: number[]): number {
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
}

export function computeStats(users: User[]): UserStats {
  const ages = users.map((user) => user.dob.age).sort((a, b) => a - b);
  const bucketOf = (age: number) => AGE_BUCKETS.find((bucket) => age < bucket.max)!.label;
  const ageBuckets = Object.fromEntries(AGE_BUCKETS.map(({ label }) => [label, 0]));
  for (const age of ages) ageBuckets[bucketOf(age)]!++;

  const countryCounts = Object.entries(countBy(users, (user) => user.location.country))
    .map(([country, count]) => ({ country, count }))
    .sort((a, b) => b.count - a.count || a.country.localeCompare(b.country));

  const mean = ages.reduce((sum, age) => sum + age, 0) / ages.length;

  return {
    total: users.length,
    age: ages.length
      ? { min: ages[0]!, max: ages.at(-1)!, mean: Math.round(mean * 10) / 10, median: median(ages) }
      : { min: null, max: null, mean: null, median: null },
    ageBuckets,
    gender: countBy(users, (user) => user.gender),
    countries: { distinct: countryCounts.length, top: countryCounts.slice(0, TOP_COUNTRIES) },
  };
}
