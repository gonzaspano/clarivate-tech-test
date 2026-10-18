import express from "express";
import type { Logger } from "../../application/ports/Logger.js";
import { makeErrorHandler } from "./errorHandler.js";
import { usersRouter, type UserUseCases } from "./routes/users.js";

export function createApp(useCases: UserUseCases, logger: Logger) {
  const app = express();
  app.use(express.json());

  app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });
  app.use("/users", usersRouter(useCases));

  app.use((_req, res) => {
    res.status(404).json({ error: { code: "NOT_FOUND", message: "Route not found" } });
  });
  app.use(makeErrorHandler(logger));
  return app;
}
