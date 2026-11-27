import { beforeEach, describe, expect, it, vi } from "vitest";

const captureException = vi.fn();
const tags: Record<string, string> = {};
let hasClient = false;
vi.mock("@sentry/nextjs", () => ({
  getClient: () => (hasClient ? {} : undefined),
  withScope: (fn: (s: { setTag: (k: string, v: string) => void }) => void) => fn({ setTag: (k, v) => { tags[k] = v; } }),
  captureException: (e: unknown) => captureException(e),
}));
vi.mock("server-only", () => ({}));

const { captureServerError } = await import("@/lib/server/monitor");
const { createLogger } = await import("@/lib/server/log");

beforeEach(() => {
  captureException.mockClear();
  for (const k of Object.keys(tags)) delete tags[k];
  hasClient = false;
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("captureServerError (S0-06)", () => {
  it("does nothing while monitoring is off (no client)", () => {
    captureServerError(new Error("x"), { scope: "a" });
    expect(captureException).not.toHaveBeenCalled();
  });

  it("reports the error with its scope and request id as labels when monitoring is on", () => {
    hasClient = true;
    const err = new Error("boom");
    captureServerError(err, { scope: "stripe.webhook", requestId: "r1", route: "POST" });
    expect(captureException).toHaveBeenCalledWith(err);
    expect(tags).toEqual({ scope: "stripe.webhook", request_id: "r1", route: "POST" });
  });

  it("wraps a thrown string or object in an Error and never throws itself", () => {
    hasClient = true;
    captureServerError("just text", { scope: "s" });
    expect((captureException.mock.calls[0][0] as Error).message).toBe("just text");
    captureException.mockImplementationOnce(() => { throw new Error("sentry down"); });
    expect(() => captureServerError({ a: 1 }, { scope: "s" })).not.toThrow();
  });
});

describe("the logger reports errors that carry an error object", () => {
  it("logger.error with err reaches monitoring; one without err, and warnings, do not", () => {
    hasClient = true;
    const log = createLogger({ scope: "cron.reminders", requestId: "r9" });
    log.error("failed", { err: new Error("db down") });
    expect(captureException).toHaveBeenCalledTimes(1);
    expect(tags).toMatchObject({ scope: "cron.reminders", request_id: "r9" });
    log.error("failed without an error object", { orderId: 1 });
    log.warn("careful", { err: new Error("minor") });
    expect(captureException).toHaveBeenCalledTimes(1);
  });
});
