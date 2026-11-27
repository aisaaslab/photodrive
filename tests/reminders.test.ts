import { describe, expect, it } from "vitest";
import { DAY_MS, LIFETIME_SENTINEL } from "@/lib/shared/billing-access";
import { dueReminder, dueWindow, reminderKey, reminderKindFor } from "@/lib/shared/reminders";

const NOW = Date.UTC(2026, 10, 27, 9, 0);
const ends = (days: number) => NOW + days * DAY_MS;

describe("reminderKindFor: the timeline of one plan period", () => {
  it("nothing more than 14 days out", () => {
    expect(reminderKindFor(ends(14) + 1, NOW)).toBeNull();
    expect(reminderKindFor(ends(60), NOW)).toBeNull();
  });
  it("the first reminder from 14 days out", () => {
    expect(reminderKindFor(ends(14), NOW)).toBe("expiring14");
    expect(reminderKindFor(ends(10), NOW)).toBe("expiring14");
    expect(reminderKindFor(ends(3) + 1, NOW)).toBe("expiring14");
  });
  it("the final reminder from 3 days out, until the plan ends", () => {
    expect(reminderKindFor(ends(3), NOW)).toBe("expiring3");
    expect(reminderKindFor(ends(1), NOW)).toBe("expiring3");
    expect(reminderKindFor(NOW + 1, NOW)).toBe("expiring3");
  });
  it("a notice for 3 days after it ended, and never a chase after that", () => {
    expect(reminderKindFor(NOW, NOW)).toBe("lapsed");
    expect(reminderKindFor(ends(-3), NOW)).toBe("lapsed");
    expect(reminderKindFor(ends(-3) - 1, NOW)).toBeNull();
    expect(reminderKindFor(ends(-400), NOW)).toBeNull();
  });
});

describe("dueReminder", () => {
  const user = (days: number, extra: object = {}) => ({ subscriptionExpiresAt: ends(days), ...extra });

  it("a test account on a simulated timeline gets all three, one at a time, each once", () => {
    const exp = ends(20);
    const sent: Record<string, number> = {};
    const log: string[] = [];
    for (let day = 0; day <= 26; day++) {
      const now = NOW + day * DAY_MS;
      for (let run = 0; run < 2; run++) { // the job runs twice a day: the second run must send nothing
        const kind = dueReminder({ subscriptionExpiresAt: exp, remindersSent: sent }, now);
        if (kind) { sent[reminderKey(kind, exp)] = now; log.push(`${kind}@day${day}`); }
      }
    }
    expect(log).toEqual(["expiring14@day6", "expiring3@day17", "lapsed@day20"]);
  });

  it("running twice sends once", () => {
    const u = user(2);
    const first = dueReminder(u, NOW);
    expect(first).toBe("expiring3");
    const after = { ...u, remindersSent: { [reminderKey(first!, u.subscriptionExpiresAt)]: NOW } };
    expect(dueReminder(after, NOW)).toBeNull();
    expect(dueReminder(after, NOW + DAY_MS)).toBeNull();
  });

  it("a missed run sends only the most urgent message, never two", () => {
    expect(dueReminder(user(2), NOW)).toBe("expiring3"); // the 14-day one was never sent; it is not sent late
  });

  it("renewing starts afresh: a new expiry date has its own keys", () => {
    const old = ends(2);
    const sent = { [reminderKey("expiring3", old)]: NOW };
    expect(dueReminder({ subscriptionExpiresAt: old, remindersSent: sent }, NOW)).toBeNull();
    expect(dueReminder({ subscriptionExpiresAt: ends(365), remindersSent: sent }, NOW)).toBeNull(); // not due yet
    expect(dueReminder({ subscriptionExpiresAt: ends(365), remindersSent: sent }, ends(365) - 2 * DAY_MS)).toBe("expiring3");
  });

  it("excludes lifetime, comped and unknown accounts", () => {
    expect(dueReminder({ subscriptionExpiresAt: LIFETIME_SENTINEL }, NOW)).toBeNull();
    expect(dueReminder(user(2, { compGranted: true }), NOW)).toBeNull();
    for (const v of [undefined, null, 0, -5, Number.NaN, "soon"]) expect(dueReminder({ subscriptionExpiresAt: v }, NOW)).toBeNull();
  });

  it("a plan that ended long ago is not mailed when the job is first switched on", () => {
    expect(dueReminder(user(-30), NOW)).toBeNull();
    expect(dueReminder(user(-1), NOW)).toBe("lapsed");
  });

  it("the database window covers exactly what can be due", () => {
    const w = dueWindow(NOW);
    expect(w.from).toBe(ends(-3));
    expect(w.to).toBe(ends(14));
    for (const d of [-3, -1, 0.5, 3, 10, 14]) expect(reminderKindFor(ends(d), NOW)).not.toBeNull();
  });
});
