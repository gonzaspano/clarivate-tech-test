import { vi } from "vitest";

/** A fetch that answers with the given body, and records the calls. */
export const stubFetch = (body: string | object, init: ResponseInit = { status: 200 }) =>
  vi.fn<typeof fetch>(async () => new Response(typeof body === "string" ? body : JSON.stringify(body), init));

export const failingFetch = (error: unknown) =>
  vi.fn<typeof fetch>(async () => {
    throw error;
  });

/** A fetch that never answers on its own and rejects once the request signal aborts (like the real one). */
export const hangingFetch = () =>
  vi.fn<typeof fetch>(
    (_url, init) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(init.signal?.reason));
      }),
  );
