import type { RequestHandler } from "express";
import type { Logger } from "../../application/ports/Logger.js";

// Docker polls /health every few seconds; logging it would drown out real traffic.
const SKIPPED_PATH = "/health";

// Logs one access line per finished request. Only method, path (no query string), status and duration
// are recorded: never headers or bodies. Registered first so 404s and parser errors are covered too.
export const makeRequestLogger =
  (logger: Logger): RequestHandler =>
  (req, res, next) => {
    const start = performance.now();
    res.on("finish", () => {
      const path = req.originalUrl.split("?")[0]!;
      if (path === SKIPPED_PATH) return;
      logger.info("http.request", {
        method: req.method,
        path,
        status: res.statusCode,
        durationMs: Math.round(performance.now() - start),
      });
    });
    next();
  };
