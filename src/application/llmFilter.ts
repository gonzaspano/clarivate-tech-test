import { z } from "zod";
import type { UserFilter } from "../domain/userFilter.js";

const bound = z.int().nullable();

// Same shape as the domain filter, but every field is nullable: small models
// tend to return `null` for "not mentioned" instead of omitting the key.
export const llmFilterSchema = z.strictObject({
  age: z.strictObject({ gt: bound, gte: bound, lt: bound, lte: bound }).nullable(),
  city: z.string().nullable(),
});

export type LlmFilter = z.infer<typeof llmFilterSchema>;

/** The JSON schema sent to the model as its output format. */
export const llmFilterJsonSchema = z.toJSONSchema(llmFilterSchema) as Record<string, unknown>;

/** Drops the nulls so the result can be validated by the domain's `userFilterSchema`. */
export function stripNulls(filter: LlmFilter): Partial<UserFilter> {
  const bounds = filter.age
    ? Object.fromEntries(Object.entries(filter.age).filter(([, value]) => value !== null))
    : {};
  return {
    ...(Object.keys(bounds).length > 0 && { age: bounds }),
    ...(filter.city !== null && { city: filter.city }),
  };
}
