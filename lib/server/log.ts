/**
 * Structured JSON logger for server code (S0-07).
 *
 * One JSON object per line so Vercel/Sentry can filter on fields. Never pass
 * secrets, signatures, request bodies or full e-mail addresses: use
 * `maskEmail` and log ids instead.
 */
type Level = "debug" | "info" | "warn" | "error";
const ORDER: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

function threshold(): number {
  const raw = (process.env.LOG_LEVEL ?? "").toLowerCase() as Level;
  return ORDER[raw] ?? ORDER.info;
}

/** `jane.doe@example.com` → `j***@example.com`. */
export function maskEmail(email: string | null | undefined): string | null {
  if (!email) return null;
  const at = email.indexOf("@");
  if (at < 1) return "***";
  return `${email[0]}***${email.slice(at)}`;
}

function serialiseError(err: unknown): Record<string, unknown> | string {
  if (err instanceof Error) return { name: err.name, message: err.message, stack: err.stack };
  return typeof err === "string" ? err : String(err);
}

export type Logger = {
  debug(msg: string, fields?: Record<string, unknown>): void;
  info(msg: string, fields?: Record<string, unknown>): void;
  warn(msg: string, fields?: Record<string, unknown>): void;
  error(msg: string, fields?: Record<string, unknown>): void;
  child(bindings: Record<string, unknown>): Logger;
};

export function createLogger(bindings: Record<string, unknown> = {}): Logger {
  const emit = (level: Level, msg: string, fields: Record<string, unknown> = {}) => {
    if (ORDER[level] < threshold()) return;
    const { err, ...rest } = fields;
    const line = JSON.stringify({
      level,
      time: new Date().toISOString(),
      msg,
      ...bindings,
      ...rest,
      ...(err !== undefined ? { err: serialiseError(err) } : {}),
    });
    (level === "error" ? console.error : level === "warn" ? console.warn : console.log)(line);
  };
  return {
    debug: (m, f) => emit("debug", m, f),
    info: (m, f) => emit("info", m, f),
    warn: (m, f) => emit("warn", m, f),
    error: (m, f) => emit("error", m, f),
    child: (b) => createLogger({ ...bindings, ...b }),
  };
}

/** Logger bound to a request id (honours `x-vercel-id` / `x-request-id`). */
export function requestLogger(req: Request, scope: string): Logger {
  const requestId =
    req.headers.get("x-request-id") ?? req.headers.get("x-vercel-id") ?? crypto.randomUUID();
  return createLogger({ scope, requestId });
}
