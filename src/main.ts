import { makeGetUsers } from "./application/use-cases/getUsers.js";
import { makeSearchUsers } from "./application/use-cases/searchUsers.js";
import { makeSummarizeUsers } from "./application/use-cases/summarizeUsers.js";
import { loadEnv } from "./infrastructure/config/env.js";
import { createApp } from "./infrastructure/http/app.js";
import { makeConsoleLogger } from "./infrastructure/logging/ConsoleLogger.js";
import { makeGeminiClient } from "./infrastructure/llm/GeminiClient.js";
import { makeOllamaClient } from "./infrastructure/llm/OllamaClient.js";
import { makeRandomUserClient } from "./infrastructure/randomuser/RandomUserClient.js";

const env = loadEnv();
const logger = makeConsoleLogger();

const RandomUserClient = makeRandomUserClient({
  baseUrl: env.RANDOMUSER_BASE_URL,
  timeoutMs: env.RANDOMUSER_TIMEOUT_MS,
});
// The provider is the only thing that changes: use cases depend on the LlmProvider port.
const llm =
  env.LLM_PROVIDER === "gemini"
    ? makeGeminiClient({
        apiKey: env.GEMINI_API_KEY!,
        model: env.GEMINI_MODEL,
        timeoutMs: env.LLM_TIMEOUT_MS,
      })
    : makeOllamaClient({
        baseUrl: env.OLLAMA_BASE_URL,
        model: env.OLLAMA_MODEL,
        maxTokens: env.OLLAMA_MAX_TOKENS,
        timeoutMs: env.LLM_TIMEOUT_MS,
      });
console.log(
  `LLM provider: ${env.LLM_PROVIDER} (model: ${env.LLM_PROVIDER === "gemini" ? env.GEMINI_MODEL : env.OLLAMA_MODEL})`,
);

const app = createApp(
  {
    getUsers: makeGetUsers({ userProvider: RandomUserClient }),
    summarizeUsers: makeSummarizeUsers({
      userProvider: RandomUserClient,
      llm,
    }),
    searchUsers: makeSearchUsers({
      userProvider: RandomUserClient,
      llm,
      logger,
    }),
  },
  logger,
);

app.listen(env.PORT, () => {
  console.log(`Server listening on http://localhost:${env.PORT}`);
});
