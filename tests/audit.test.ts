import { describe, expect, it, vi } from "vitest";

const set = vi.hoisted(() => vi.fn());
vi.mock("@/lib/server/repos/collections", () => ({ auditLogCol: () => ({ doc: () => ({ id: "a1", set }) }) }));

const { auditSafe, writeAudit } = await import("@/lib/server/audit");

describe("auditSafe (S7-03)", () => {
  it("replaces anything that looks like a secret, at any depth, and keeps the rest", () => {
    expect(auditSafe({ name: "G", passwordHash: "x", password: "p", nested: { apiToken: "t", ok: 1 }, list: [{ secret: "s", a: 1 }] })).toEqual({
      name: "G", passwordHash: "[redacted]", password: "[redacted]", nested: { apiToken: "[redacted]", ok: 1 }, list: [{ secret: "[redacted]", a: 1 }],
    });
  });
  it("drops undefined (Firestore rejects it) and turns odd values into strings", () => {
    expect(auditSafe({ a: undefined, b: 1, c: new Date(0) })).toMatchObject({ b: 1 });
    expect(Object.keys(auditSafe({ a: undefined, b: 1 }) as object)).toEqual(["b"]);
    expect(auditSafe(() => 1)).toEqual(expect.any(String));
  });
});

describe("writeAudit (S7-03)", () => {
  it("writes who, what, which record, before and after, with a timestamp", async () => {
    set.mockReset().mockResolvedValue(undefined);
    const id = await writeAudit({ actorUid: "boss", action: "plan.update", targetType: "plan", targetId: "p1", before: { price: 1 }, after: { price: 2 }, note: "n" });
    expect(id).toBe("a1");
    expect(set).toHaveBeenCalledWith(expect.objectContaining({ actorUid: "boss", action: "plan.update", targetType: "plan", targetId: "p1", before: { price: 1 }, after: { price: 2 }, note: "n", at: expect.any(Number) }));
  });
  it("leaves out before/after/note when they are not given", async () => {
    set.mockReset().mockResolvedValue(undefined);
    await writeAudit({ actorUid: "boss", action: "message.delete", targetType: "message", targetId: "m1" });
    const written = set.mock.calls[0][0];
    expect(Object.keys(written).sort()).toEqual(["action", "actorUid", "at", "targetId", "targetType"]);
  });
  it("never throws: an action that already happened is not undone because the record failed; it logs and returns null", async () => {
    set.mockReset().mockRejectedValue(new Error("firestore down"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await writeAudit({ actorUid: "boss", action: "x", targetType: "user", targetId: "u" })).toBeNull();
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
