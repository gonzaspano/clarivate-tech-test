import { z } from "zod";
import type { User } from "./user.js";

const age = z.number().int().min(0).max(150);

// Bounds: "older than 40" -> { gt: 40 }; "between 20 and 35" -> { gte: 20, lte: 35 }
// (inclusive on both ends). A contradictory range (gt 50, lt 30) is valid and matches nothing.
const ageRange = z
  .strictObject({ gt: age.optional(), gte: age.optional(), lt: age.optional(), lte: age.optional() })
  .refine((range) => Object.values(range).some((bound) => bound !== undefined), {
    message: "age needs at least one bound",
  });

export const userFilterSchema = z
  .strictObject({
    age: ageRange.optional(),
    city: z.string().trim().min(1).optional(),
  })
  .refine((filter) => filter.age !== undefined || filter.city !== undefined, {
    message: "filter needs at least one criterion",
  });

export type UserFilter = z.infer<typeof userFilterSchema>;

// Lowercase, trim, and strip diacritics so "Zürich" equals "zurich".
export const normalize = (text: string): string =>
  text
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .trim()
    .toLowerCase();

const matchesAge = (value: number, range: NonNullable<UserFilter["age"]>): boolean =>
  (range.gt === undefined || value > range.gt) &&
  (range.gte === undefined || value >= range.gte) &&
  (range.lt === undefined || value < range.lt) &&
  (range.lte === undefined || value <= range.lte);

export function matches(user: User, filter: UserFilter): boolean {
  if (filter.age && !matchesAge(user.dob.age, filter.age)) return false;
  if (filter.city && normalize(user.location.city) !== normalize(filter.city)) return false;
  return true;
}

export const applyFilter = (users: User[], filter: UserFilter): User[] =>
  users.filter((user) => matches(user, filter));
