import { z } from "zod";

// Only the fields the app relies on are declared. `looseObject` keeps every other
// upstream field at runtime, so records pass through untouched. `login` is declared
// (as unknown) only so the application can strip it from public output.
export const userSchema = z.looseObject({
  gender: z.string(),
  dob: z.looseObject({ age: z.number() }),
  location: z.looseObject({ city: z.string(), country: z.string() }),
  login: z.unknown().optional(),
});

export type User = z.infer<typeof userSchema>;
