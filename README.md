# Users API

Express + TypeScript service over [randomuser.me](https://randomuser.me) with an LLM-powered summary and natural-language search. The LLM runs locally in Ollama by default (no API key needed); Google Gemini is the recommended opt-in provider for the best quality and speed (see [LLM providers](#llm-providers)).

## Quick start with Ollama

```bash
docker compose up --build
```

- The first run downloads the model (`qwen2.5:7b`, about 4.7 GB). It is cached in the `ollama` volume, so later runs start fast.
- Docker needs about 6 GB of memory available for Ollama with the 7b model (Docker Desktop: Settings > Resources). Short on RAM? Use the 3b fallback, see [LLM providers](#llm-providers).
- The API is ready when `api` reports healthy. Check: `curl localhost:3000/health`.
- Inference is CPU-only inside Docker, so LLM endpoints can take tens of seconds, and `/users/summary` more than a minute on the 7b model (`LLM_TIMEOUT_MS` is 120 s in the compose file). A client or proxy with a 60 s timeout will cut it off.

## Quick start with Gemini

To use Gemini: create a key in [Google AI Studio](https://aistudio.google.com/apikey), put `GEMINI_API_KEY=...` in a local `.env` (git-ignored; never in `.env.example`), then:

```bash
LLM_PROVIDER=gemini docker compose up --build --no-deps api   # Docker: starts only the API, no Ollama
LLM_PROVIDER=gemini npm run dev                               # no Docker (dev loads .env)
```


## Endpoints

| Endpoint | What it does |
|----------|--------------|
| `GET /users` | Exact passthrough of `randomuser.me/api/?results=50` |
| `GET /users/summary` | Fetches 100 users, returns an LLM summary of their statistics |
| `POST /users/search` | Fetches 300 users, an LLM turns the query into a filter, the backend applies it |
| `GET /health` | Liveness check |

```bash
curl localhost:3000/users

curl localhost:3000/users/summary
# {"summary":"The dataset has 100 users ..."}

curl -X POST localhost:3000/users/search \
  -H 'content-type: application/json' \
  -d '{"query":"People older than 40"}'
# {"users":[ ... ]}   (`login` is never included)
```

Errors share one shape, `{ "error": { "code", "message" } }`:

| Status | Meaning |
|--------|---------|
| 400 | Bad request (malformed JSON, missing or empty `query`) |
| 422 | Query understood but not supported (only age and city filters exist) |
| 502 | Something we depend on broke: randomuser.me, or the LLM (down, timeout, invalid output twice) |

## Run without Docker

```bash
ollama serve &                 # native Ollama
ollama pull qwen2.5:7b
npm ci
npm run dev                    # http://localhost:3000
# other model: OLLAMA_MODEL=llama3.2:3b npm run dev  (pull it first)
```

## LLM providers

Recommended: **Gemini** for the best quality and speed. Default: **Ollama `qwen2.5:7b`**, which needs no key.

| Provider / model | Quality on the brief's queries | Typical latency | RAM | Key needed | Limits |
|------------------|--------------------------------|-----------------|-----|------------|--------|
| Gemini (`gemini-3.8-flash`), **recommended** | Every extracted filter correct | Summary ~10 s, search ~3-4 s | none locally | `GEMINI_API_KEY` | Free tier is rate-limited (see below) |
| Ollama `qwen2.5:7b`, **default** | Every query correct, including "between" | Search 8-11 s warm, summary 68-89 s on CPU | ~4.9 GiB used, ~6 GB for Docker | no | CPU speed only |
| Ollama `qwen2.5:3b`, lighter fallback (`OLLAMA_MODEL=qwen2.5:3b`) | Reads "between A and B" as exclusive (`20 < age < 35`) | Summary ~38 s cold | ~2 GB | no | Known limitation on "between" |

Measured with the brief's example queries on a CPU-only Docker setup; your numbers will vary.

**Gemini free tier.** On our project the AI Studio rate-limit page shows 5 requests/minute and 20 requests/day. A `429` means you hit the quota, not a bug. Limits are per project and the daily reset is at midnight Pacific; check your own on the AI Studio rate-limit page. The default `GEMINI_MODEL` can be changed to a model with higher limits.

Switching providers was a one-adapter change: `GeminiClient` implements the same `LlmProvider` port as `OllamaClient`, and `main.ts` picks one. Use cases and domain are untouched.

## Configuration

Copy `.env.example` for reference. Defaults are used when a variable is unset; invalid values stop the process at startup.

| Variable | Default | Purpose |
|----------|---------|---------|
| `PORT` | `3000` | HTTP port |
| `RANDOMUSER_BASE_URL` | `https://randomuser.me/api` | Upstream user source |
| `RANDOMUSER_TIMEOUT_MS` | `10000` | Upstream request timeout |
| `OLLAMA_BASE_URL` | `http://localhost:11434` | Ollama server (compose sets `http://ollama:11434`) |
| `OLLAMA_MODEL` | `qwen2.5:7b` | Model used for both LLM endpoints (`qwen2.5:3b` is the lighter fallback) |
| `OLLAMA_MAX_TOKENS` | `256` | Cap on generated tokens per Ollama call (sent as `options.num_predict`); not applied to Gemini |
| `LLM_TIMEOUT_MS` | `60000` | LLM request timeout (compose sets `120000`) |
| `LLM_PROVIDER` | `ollama` | `ollama` or `gemini` |
| `GEMINI_API_KEY` | unset | Required when `LLM_PROVIDER=gemini` (startup fails without it); sent only in the `x-goog-api-key` header |
| `GEMINI_BASE_URL` | `https://generativelanguage.googleapis.com/v1beta` | Gemini API base URL (e.g. to route through a gateway or proxy) |
| `GEMINI_MODEL` | `gemini-3.8-flash` | Gemini model used for both LLM endpoints |

## Tests

```bash
npm test            # Vitest + Supertest, no network or Ollama needed
npm run typecheck
npm run build
```

All external calls (randomuser.me, Ollama) are replaced by fakes, so the suite is fast and deterministic.

## Architecture

```
infrastructure  (Express routes, RandomUserClient, OllamaClient, ConsoleLogger, env)
      |  implements ports / calls use cases
      v
application     (use cases, ports: UserProvider, LlmProvider, Logger)
      |
      v
domain          (User schema, UserFilter, user stats)
```

Dependency rule: imports point inward only. `domain` imports nothing (apart from `zod`), `application` imports only `domain`, `infrastructure` implements the ports. `src/main.ts` is the composition root where everything is wired.

## Key design decisions

| Decision | Why |
|----------|-----|
| `/users` is a raw passthrough | The brief demands exactly the upstream response. Parsing and re-serializing could change it, so the original text is sent as-is. |
| Summary sends only aggregated stats to the LLM | Stats are computed in code. The model only writes prose, so numbers are correct, the context window is not a limit, and no PII leaves the process. |
| Search: LLM output goes through a nullable schema, then nulls are stripped, then a strict domain schema, then a deterministic filter | Small models emit `null` for "not mentioned". The schema (built with `z.toJSONSchema`) constrains the model's output; the domain schema is the real gate; filtering is plain code, so results are testable and never hallucinated. |
| One retry on invalid LLM output | Cheap protection against an occasional malformed reply. After two failures: 502. |
| 502 vs 422 vs 400 | 502: a dependency broke. 422: the request was valid but is not a supported filter. 400: the request itself is bad. |
| LLM call and upstream fetch run concurrently in `/search` | They are independent, so latency is the slower of the two, not the sum. |
| Ollama by default, Gemini opt-in | Zero friction for reviewers (no key, no rate limits). Gemini is faster and more accurate but needs a key and has free-tier limits; select it with `LLM_PROVIDER=gemini`. |

### Adding another provider (OpenRouter, ...)

Same recipe as Gemini: implement `LlmProvider` in `src/infrastructure/llm/`, add its env variables to `env.ts` and `.env.example`, and extend the switch in `main.ts`.

### UserProvider port tradeoff

`fetchRawUsers` returns raw text because the passthrough is a requirement, so the port mixes "raw text" and "typed users". The alternative is two ports (for example `RawUserSource` and `UserProvider`), following interface segregation. One port was kept because both methods share one upstream and one adapter, and the adapter stays small.

### The 50 vs 100 inconsistency

The brief's example summary text says "50 users", but the endpoint is specified to fetch 100. The implementation fetches 100, and the summary reflects the real count.

## Logging

`/users/search` logs one JSON line per search (`search.filter_extracted`) with the query, the extracted filter and the matched count, plus `search.llm_retry` when the model had to be asked again. User records are never logged.

Every HTTP request also logs one `http.request` line when it finishes, with the method, path (query string stripped), status and duration in milliseconds. `/health` is skipped because the Docker healthcheck polls it constantly. Headers and bodies are never logged.

## Known limitations

- Every request is a new random sample. City queries such as "Charleston" usually return `[]` (roughly 1 in 5,000 generated users is from Charleston). The log shows the extracted filter, so you can confirm the query was understood.
- City matching is exact (case- and accent-insensitive). No fuzzy or partial match.
- Only age and city are supported. Other queries get a 422.
- Small local models can misread a query silently: the 3b model treats "between 20 and 35" as exclusive, with no error. Check the `search.filter_extracted` log line to see what was actually extracted.
- Local summaries can be clumsy. The numbers come from the provided statistics and the prompt forbids calling a group a "majority" unless it is more than half, but the prose is still model-written.

## Security note

- `GET /users` returns credentials and PII (password, salt, hashes) exactly as the brief requires. The data is synthetic. In production this would use a field allowlist or randomuser's `exc=login` parameter, plus authentication.
- `POST /users/search` strips `login` in the application layer (`toPublicUser`), so any delivery mechanism gets the same policy.
- No secrets are needed for the default Ollama setup. The optional Gemini key comes from the environment (`.env` is git-ignored), travels only in a request header, and is never logged or included in error messages.
