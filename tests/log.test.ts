import { afterEach, describe, expect, it, vi } from "vitest";
import { createLogger, maskEmail } from "@/lib/server/log";

afterEach(() => vi.restoreAllMocks());

describe("logger", () => {
  it("emits one JSON line with bindings and a serialised error", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    createLogger({ scope: "t" }).error("boom", { uid: "u1", err: new Error("x") });
    const line = JSON.parse(spy.mock.calls[0][0] as string);
    expect(line).toMatchObject({ level: "error", msg: "boom", scope: "t", uid: "u1" });
    expect(line.err.message).toBe("x");
  });

  it("respects LOG_LEVEL", () => {
    vi.stubEnv("LOG_LEVEL", "error");
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    createLogger().info("quiet");
    expect(spy).not.toHaveBeenCalled();
    vi.unstubAllEnvs();
  });

  it("masks e-mail addresses", () => {
    expect(maskEmail("jane.doe@example.com")).toBe("j***@example.com");
    expect(maskEmail(null)).toBeNull();
  });
});
