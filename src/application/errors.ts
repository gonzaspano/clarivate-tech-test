export class UpstreamError extends Error {
  readonly code = "UPSTREAM_ERROR";
}

export class LlmError extends Error {
  readonly code = "LLM_ERROR";
}

export class InvalidQueryError extends Error {
  readonly code = "INVALID_QUERY";
}
