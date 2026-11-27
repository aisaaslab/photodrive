import "server-only";
import { NextResponse } from "next/server";
import type { z } from "zod";
import { requestLogger } from "@/lib/server/log";

/** The one 400 body every validated route returns: a short message plus which fields were wrong (never the values sent). */
export type BadRequestBody = { error: string; issues?: { path: string; message: string }[] };

export function badRequest(error = "Invalid request", issues?: BadRequestBody["issues"]): NextResponse<BadRequestBody> {
  return NextResponse.json(issues?.length ? { error, issues } : { error }, { status: 400 });
}

export type ParseResult<T> = { ok: true; data: T } | { ok: false; response: NextResponse<BadRequestBody> };

const MAX_ISSUES = 5;

function issuesOf(error: z.ZodError): NonNullable<BadRequestBody["issues"]> {
  return error.issues.slice(0, MAX_ISSUES).map((i) => ({ path: i.path.join("."), message: i.message }));
}

/**
 * Reads a request body as JSON and validates it against a schema. Never throws: a body that is missing, is not JSON, or does
 * not match answers the same 400 payload, so no route can crash (500) on bad input from a visitor.
 *
 *   const body = await parseJson(req, BodySchema);
 *   if (!body.ok) return body.response;
 *   body.data   // typed
 *
 * `message` replaces the generic "Invalid request" text for routes that already tell their visitors something more useful.
 */
export async function parseJson<S extends z.ZodType>(
  req: Request,
  schema: S,
  opts: { message?: string } = {},
): Promise<ParseResult<z.output<S>>> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return { ok: false, response: badRequest(opts.message) };
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) return { ok: false, response: badRequest(opts.message, issuesOf(parsed.error)) };
  return { ok: true, data: parsed.data };
}

/**
 * Wraps a route handler so an unexpected error is logged (with a request id) and answered as a plain 500, never as a stack trace or
 * an unhandled rejection (S5-04). The error is also reported to monitoring (S0-06), through the logger. Expected outcomes (401, 400, 404 ...)
 * are returned by the handler as before; this only catches what it did not expect.
 *
 *   export const GET = route("user.subscription", async (req) => { ... });
 */
export function route<R extends Request, A extends unknown[]>(scope: string, handler: (req: R, ...rest: A) => Promise<Response>) {
  return async (req: R, ...rest: A): Promise<Response> => {
    try {
      return await handler(req, ...rest);
    } catch (err) {
      requestLogger(req, scope).error("unhandled error", { err });
      return NextResponse.json({ error: "Internal error" }, { status: 500 });
    }
  };
}
