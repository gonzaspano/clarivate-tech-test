/** `AbortSignal.timeout()` aborts with a DOMException named "TimeoutError". */
export const isTimeoutError = (error: unknown): boolean =>
  error instanceof Error && error.name === "TimeoutError";
