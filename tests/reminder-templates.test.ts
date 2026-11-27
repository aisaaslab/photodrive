import { describe, expect, it } from "vitest";
import { LANGUAGES as LANGS } from "@/lib/i18n/languages";
import { REMINDER_KINDS } from "@/lib/shared/reminders";
import { renderReminder, type ReminderData } from "@/lib/server/notify/reminder-templates";

const data: ReminderData = {
  name: "Maria", appName: "PhotoDrive", date: "10 December 2026", graceEnd: "24 December 2026", graceDays: 14,
  lapseEnforced: true, supportEmail: "help@example.com", url: "https://photos.example.com/subscribe",
};

describe("renewal reminder e-mails", () => {
  it("every kind renders in every language with nothing left unfilled", () => {
    for (const lang of LANGS) {
      for (const kind of REMINDER_KINDS) {
        for (const enforced of [true, false]) {
          const r = renderReminder(kind, lang, { ...data, lapseEnforced: enforced });
          for (const part of [r.subject, r.text, r.html]) expect(part, `${lang}/${kind}`).not.toMatch(/\{\w+\}/);
          expect(r.subject.length).toBeGreaterThan(5);
          expect(r.text).toContain(data.url);
          expect(r.text).toContain("PhotoDrive");
          expect(r.html).toContain(`<a href="${data.url}">`);
        }
      }
    }
  });

  it("says the plan end date, and the grace only for the kinds that mention it", () => {
    const e14 = renderReminder("expiring14", "en", data);
    expect(e14.subject).toBe("Your PhotoDrive plan ends in 14 days");
    expect(e14.text).toContain("ends on 10 December 2026");
    expect(e14.text).toContain("stay online for another 14 days");
    const lapsed = renderReminder("lapsed", "en", data);
    expect(lapsed.text).toContain("stay online until 24 December 2026");
    expect(lapsed.text).toContain("Nothing is deleted");
  });

  it("never mentions galleries going offline while lapse enforcement is off", () => {
    for (const lang of LANGS) {
      for (const kind of REMINDER_KINDS) {
        const r = renderReminder(kind, lang, { ...data, lapseEnforced: false });
        expect(r.text, `${lang}/${kind}`).not.toContain(data.graceEnd);
      }
    }
    const off = renderReminder("expiring3", "en", { ...data, lapseEnforced: false });
    expect(off.text).not.toContain("stay online");
    expect(renderReminder("lapsed", "en", { ...data, lapseEnforced: false }).text).toContain("Nothing has been deleted");
  });

  it("greets by first name, or plainly without one, and escapes HTML in the name", () => {
    expect(renderReminder("expiring3", "en", data).text.startsWith("Hi Maria,")).toBe(true);
    expect(renderReminder("expiring3", "en", { ...data, name: "" }).text.startsWith("Hello,")).toBe(true);
    const hostile = renderReminder("expiring3", "en", { ...data, name: "<script>x</script>" });
    expect(hostile.html).not.toContain("<script>");
  });

  it("contains nothing about other users, payments or card details", () => {
    const r = renderReminder("expiring14", "en", data);
    expect(r.text.toLowerCase()).not.toMatch(/card|invoice|iban|password/);
  });
});
