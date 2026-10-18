import { Router } from "express";
import { z } from "zod";
import type { User } from "../../../domain/user.js";

export type UserUseCases = {
  getUsers: () => Promise<string>;
  summarizeUsers: () => Promise<{ summary: string }>;
  searchUsers: (query: string) => Promise<{ users: User[] }>;
};

const searchBodySchema = z.object({ query: z.string().trim().min(1).max(500) });

// Express 5 forwards rejected promises from async handlers to the error handler.
export function usersRouter({ getUsers, summarizeUsers, searchUsers }: UserUseCases): Router {
  const router = Router();

  router.get("/", async (_req, res) => {
    // Raw upstream text, sent as-is: parsing and re-serializing could alter the response.
    res.type("application/json").send(await getUsers());
  });

  router.get("/summary", async (_req, res) => {
    res.json(await summarizeUsers());
  });

  router.post("/search", async (req, res) => {
    const { query } = searchBodySchema.parse(req.body);
    res.json(await searchUsers(query));
  });

  return router;
}
