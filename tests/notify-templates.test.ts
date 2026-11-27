import { describe, expect, it } from "vitest";
import { NOTICE_KINDS, renderNotice, type NoticeData, type NoticeKind } from "@/lib/server/notify/templates";
import { LANGUAGES } from "@/lib/i18n/languages";

const base: NoticeData = {
  name: "Anna",
  appName: "PhotoDrive",
  amount: "$99.00",
  refunded: "$20.00",
  accessEnds: "6 December 2026",
  supportEmail: "support@example.com",
  url: "https://app.example.com/subscribe",
};

describe("every message in every language", () => {
  for (const lang of LANGUAGES) {
    for (const kind of NOTICE_KINDS) {
      it(`${kind} / ${lang}: complete, filled in, and states what happened`, () => {
        const m = renderNotice(kind, lang, base);
        expect(m.subject.length, "subject").toBeGreaterThan(5);
        expect(m.text).toContain("Anna");
        expect(m.text).toContain("$99.00"); // the payment amount
        expect(m.text).toContain("support@example.com"); // how to get help
        expect(m.text).toContain("PhotoDrive"); // sign-off
        expect(m.text + m.subject + m.html, "no placeholder left over").not.toMatch(/\{\w+\}/);
        expect(m.text + m.subject, "no undefined").not.toContain("undefined");
        expect(m.html).toContain("<p>");
        if (kind === "refund_partial") expect(m.text).toContain("$20.00");
        if (kind === "payment_failed" || kind === "dispute_lost") expect(m.text).toContain("https://app.example.com/subscribe");
        if (kind !== "payment_failed") expect(m.text, "the access end date is given").toContain("6 December 2026");
      });
    }
  }

  it("each kind has a different subject within a language, and each language its own wording", () => {
    for (const lang of LANGUAGES) {
      const subjects = NOTICE_KINDS.map((k) => renderNotice(k, lang, base).subject);
      expect(new Set(subjects).size, lang).toBe(NOTICE_KINDS.length);
    }
    for (const kind of NOTICE_KINDS) {
      const subjects = LANGUAGES.map((l) => renderNotice(kind, l, base).subject);
      expect(new Set(subjects).size, kind).toBe(LANGUAGES.length);
    }
  });

  it("uses the customer's language", () => {
    expect(renderNotice("refund_full", "en", base).subject).toBe("Your refund has been processed");
    expect(renderNotice("refund_full", "el", base).subject).toMatch(/[Α-Ωα-ω]/);
    expect(renderNotice("refund_full", "de", base).subject).toContain("Rückerstattung");
    expect(renderNotice("refund_full", "nl", base).subject).toContain("terugbetaling");
    expect(renderNotice("refund_full", "es", base).subject).toContain("reembolso");
    expect(renderNotice("refund_full", "it", base).subject).toContain("rimborso");
  });
});

describe("what it says about access", () => {
  const noAccess: NoticeData = { ...base, accessEnds: null };

  it("with access it gives the end date; without it says access has ended", () => {
    expect(renderNotice("refund_full", "en", base).text).toContain("runs until 6 December 2026");
    const ended = renderNotice("refund_full", "en", noAccess).text;
    expect(ended).toContain("access has ended");
    expect(ended).not.toContain("December");
  });

  it("a partial refund leaves access as it is", () => {
    expect(renderNotice("refund_partial", "en", noAccess).text).toContain("Your access is unchanged.");
  });

  it("a dispute without access says it is paused; a lost dispute says it has ended", () => {
    expect(renderNotice("dispute_opened", "en", noAccess).text).toContain("paused until the dispute is resolved");
    expect(renderNotice("dispute_lost", "en", noAccess).text).toContain("access has ended");
  });

  it("a payment that did not go through says nothing about the end date", () => {
    const t = renderNotice("payment_failed", "en", base).text;
    expect(t).toContain("no access was added");
    expect(t).not.toContain("December");
  });

  it("lifetime access is never described as ended", () => {
    for (const kind of ["refund_full", "refund_partial", "dispute_opened", "dispute_lost"] as NoticeKind[]) {
      const t = renderNotice(kind, "en", { ...base, accessEnds: null, lifetime: true }).text;
      expect(t, kind).toContain("Your access is unchanged.");
      expect(t, kind).not.toContain("has ended");
    }
  });
});

describe("formatting", () => {
  it("greets by name, or plainly without one, with no stray spaces", () => {
    expect(renderNotice("refund_full", "en", base).text.startsWith("Hi Anna,\n")).toBe(true);
    const plain = renderNotice("refund_full", "en", { ...base, name: "" }).text;
    expect(plain.startsWith("Hello,\n")).toBe(true);
    expect(plain).not.toMatch(/ {2}/);
  });

  it("escapes HTML in the customer's name and links the URL", () => {
    const m = renderNotice("payment_failed", "en", { ...base, name: '<img src=x onerror=alert(1)>"' });
    expect(m.html).not.toContain("<img");
    expect(m.html).toContain("&lt;img");
    expect(m.html).toContain('<a href="https://app.example.com/subscribe">');
    expect(m.text).toContain("<img src=x onerror=alert(1)>"); // the plain-text version is not HTML
  });

  it("never mentions card details, session ids or anything about other users", () => {
    for (const lang of LANGUAGES) {
      for (const kind of NOTICE_KINDS) {
        const t = renderNotice(kind, lang, base).text.toLowerCase();
        expect(t).not.toMatch(/cs_|pi_|ch_|card number|\b4242\b/);
      }
    }
  });
});
