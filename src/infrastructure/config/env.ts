import { z } from "zod";

const envSchema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  RANDOMUSER_BASE_URL: z.url().default("https://randomuser.me/api"),
  RANDOMUSER_TIMEOUT_MS: z.coerce.number().int().positive().default(10_000),
  OLLAMA_BASE_URL: z.url().default("http://localhost:11434"),
  OLLAMA_MODEL: z.string().min(1).default("qwen2.5:7b"),
  // Caps generated tokens (sent as num_predict); the JSON filter output is ~40 tokens.
  OLLAMA_MAX_TOKENS: z.coerce.number().int().positive().default(256),
  LLM_TIMEOUT_MS: z.coerce.number().int().positive().default(60_000),
  LLM_PROVIDER: z.enum(["ollama", "gemini"]).default("ollama"),
  // Empty string (e.g. `GEMINI_API_KEY=` from compose or .env) counts as unset.
  GEMINI_API_KEY: z.string().transform((value) => value || undefined).optional(),
  GEMINI_MODEL: z.string().min(1).default("gemini-3.8-flash"),
}).refine((env) => env.LLM_PROVIDER !== "gemini" || env.GEMINI_API_KEY, {
  path: ["GEMINI_API_KEY"],
  message: "GEMINI_API_KEY is required when LLM_PROVIDER=gemini",
});

export type Env = z.infer<typeof envSchema>;

/** Throws a ZodError on invalid values so the process fails fast at startup. */
export const loadEnv = (source: Record<string, string | undefined> = process.env): Env =>
  envSchema.parse(source);
