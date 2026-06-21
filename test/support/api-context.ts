// Synthetic APIContext factory for direct-invocation handler tests.
//
// The `/api/generate` and `/api/cards` POST handlers read only a thin slice of the Astro context:
//   - context.locals.user                          (the auth gate)
//   - context.request.headers.get("content-length") (the 413 cap)
//   - context.request.json()                        (the body)
//   - context.cookies                               (cards only, passed straight into createClient)
//
// We build `request` as a plain object — NOT a real `Request` — because undici recomputes the
// `content-length` header from the actual body on a real Request, which would defeat the 413 test
// that needs to assert an arbitrary oversized content-length without buffering a huge body.
import type { APIContext } from "astro";

interface ApiContextOptions {
  /** context.locals.user — pass null to exercise the 401 gate. Defaults to a valid user. */
  user?: { id: string } | null;
  /** Resolved value of context.request.json(). Ignored when jsonThrows is true. */
  body?: unknown;
  /** When true, request.json() rejects — exercises the invalid-JSON 400 path. */
  jsonThrows?: boolean;
  /** Extra request headers. */
  headers?: Record<string, string>;
  /** Sets the content-length header (number or string). Omit to leave it absent. */
  contentLength?: number | string;
}

export function makeApiContext(opts: ApiContextOptions = {}): APIContext {
  const { user = { id: "user-1" }, body, jsonThrows = false, headers = {}, contentLength } = opts;

  const requestHeaders = new Headers(headers);
  if (contentLength !== undefined) {
    requestHeaders.set("content-length", String(contentLength));
  }

  const request = {
    headers: requestHeaders,
    json: (): Promise<unknown> =>
      jsonThrows ? Promise.reject(new SyntaxError("Unexpected token in JSON")) : Promise.resolve(body),
  };

  const cookies = {
    get: () => undefined,
    getAll: () => [],
    set: () => undefined,
    delete: () => undefined,
    has: () => false,
    merge: () => undefined,
    headers: () => new Headers(),
  };

  return {
    locals: { user },
    request,
    cookies,
  } as unknown as APIContext;
}
