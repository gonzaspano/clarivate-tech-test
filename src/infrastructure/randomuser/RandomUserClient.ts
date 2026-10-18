import { z } from "zod";
import { UpstreamError } from "../../application/errors.js";
import type { UserProvider } from "../../application/ports/UserProvider.js";
import { userSchema, type User } from "../../domain/user.js";
import { isTimeoutError } from "../isTimeoutError.js";

type Options = {
  baseUrl: string;
  timeoutMs: number;
  fetch?: typeof globalThis.fetch;
};

const responseSchema = z.object({ results: z.array(userSchema) });

export function makeRandomUserClient({ baseUrl, timeoutMs, fetch = globalThis.fetch }: Options): UserProvider {
  /** The single HTTP call: timeout, status check and error mapping. Returns the body text. */
  async function requestBody(count: number): Promise<string> {
    let response: Response;
    try {
      response = await fetch(`${baseUrl}/?results=${count}`, { signal: AbortSignal.timeout(timeoutMs) });
    } catch (cause) {
      const reason = isTimeoutError(cause) ? `timed out after ${timeoutMs}ms` : "request failed";
      throw new UpstreamError(`randomuser.me ${reason}`, { cause });
    }
    if (!response.ok) throw new UpstreamError(`randomuser.me responded with status ${response.status}`);
    return response.text();
  }

  async function fetchRawUsers(count: number): Promise<string> {
    const body = await requestBody(count);
    assertNoUpstreamError(parseJson(body)); // parsed only to inspect it; the original text is returned
    return body;
  }

  async function fetchUsers(count: number): Promise<User[]> {
    const json = parseJson(await requestBody(count));
    assertNoUpstreamError(json);
    const parsed = responseSchema.safeParse(json);
    if (!parsed.success) {
      throw new UpstreamError("randomuser.me returned users in an unexpected shape", { cause: parsed.error });
    }
    return parsed.data.results;
  }

  return { fetchRawUsers, fetchUsers };
}

function parseJson(body: string): unknown {
  try {
    return JSON.parse(body);
  } catch (cause) {
    throw new UpstreamError("randomuser.me returned a body that is not JSON", { cause });
  }
}

/** randomuser.me sometimes answers 200 with `{ "error": "..." }` instead of results. */
function assertNoUpstreamError(json: unknown): void {
  if (typeof json === "object" && json !== null && "error" in json) {
    throw new UpstreamError(`randomuser.me reported an error: ${String(json.error)}`);
  }
}
