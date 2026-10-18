/** `examples` are few-shot turns, sent as chat history between the system and the final user message. */
export type Prompt = {
  system: string;
  examples?: Array<{ user: string; assistant: string }>;
  user: string;
};

export type LlmProvider = {
  generateText(prompt: Prompt): Promise<string>;
  /** Returns parsed JSON constrained by `jsonSchema`; the caller still validates it. */
  generateJson(prompt: Prompt, jsonSchema: Record<string, unknown>): Promise<unknown>;
};
