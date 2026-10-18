import type { ErrorRequestHandler } from "express";
import { ZodError } from "zod";
import type { Logger } from "../../application/ports/Logger.js";
import { InvalidQueryError, LlmError, UpstreamError } from "../../application/errors.js";

type HttpError = { status: number; code: string; message: string };

const isMalformedJson = (error: unknown): boolean =>
  error instanceof SyntaxError && (error as { type?: string }).type === "entity.parse.failed";

function toHttpError(error: unknown): HttpError {
  if (error instanceof InvalidQueryError) return { status: 422, code: error.code, message: error.message };
  if (error instanceof UpstreamError) return { status: 502, code: error.code, message: error.message };
  if (error instanceof LlmError) return { status: 502, code: error.code, message: error.message };
  if (error instanceof ZodError) {
    const message = error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ");
    return { status: 400, code: "BAD_REQUEST", message };
  }
  if (isMalformedJson(error)) return { status: 400, code: "BAD_REQUEST", message: "Malformed JSON body" };
  return { status: 500, code: "INTERNAL_ERROR", message: "Internal server error" };
}

const MAX_CAUSE_DEPTH = 5;

/** Name + message of each `.cause`, bounded so circular chains terminate. */
function causeChain(error: unknown): Array<{ name: string; message: string }> {
  const chain: Array<{ name: string; message: string }> = [];
  let current = error instanceof Error ? error.cause : undefined;
  while (current !== undefined && chain.length < MAX_CAUSE_DEPTH) {
    if (current instanceof Error) {
      chain.push({ name: current.name, message: current.message });
      current = current.cause;
    } else {
      chain.push({ name: typeof current, message: String(current) });
      break;
    }
  }
  return chain;
}

// Express recognizes error middleware by its 4-argument signature, so `next` must stay.
// Only method, path (no query string), error details and causes are logged: never headers or bodies.
// 4xx responses are not logged: they are caller mistakes, and logging them adds noise and user-controlled text.
export const makeErrorHandler =
  (logger: Logger): ErrorRequestHandler =>
  (error, req, res, _next) => {
    const { status, code, message } = toHttpError(error);
    if (status >= 500) {
      const unexpected = status === 500 && error instanceof Error;
      logger.error("http.error", {
        status,
        code,
        // The response hides unexpected errors; the log keeps the real message.
        error: unexpected ? error.message : message,
        method: req.method,
        path: req.path,
        causes: causeChain(error),
        ...(unexpected && { stack: error.stack }),
      });
    }
    res.status(status).json({ error: { code, message } });
  };
