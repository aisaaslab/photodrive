import { describe, expect, it } from "vitest";
import { matchesMessageFilter, matchesMessageSearch, messageState, replyMailto } from "@/lib/shared/support";

describe("messageState", () => {
  it("resolved beats read; a message with no flags is unread", () => {
    expect(messageState({})).toBe("unread");
    expect(messageState({ read: false })).toBe("unread");
    expect(messageState({ read: true })).toBe("read");
    expect(messageState({ read: true, status: "resolved" })).toBe("resolved");
    expect(messageState({ read: false, status: "resolved" })).toBe("resolved");
    expect(messageState({ status: "open" })).toBe("unread");
  });
});

describe("matchesMessageFilter", () => {
  const unread = {}, read = { read: true }, done = { read: true, status: "resolved" };
  it("each filter keeps what it says; open is everything not resolved", () => {
    expect([unread, read, done].map((d) => matchesMessageFilter("all", d))).toEqual([true, true, true]);
    expect([unread, read, done].map((d) => matchesMessageFilter("unread", d))).toEqual([true, false, false]);
    expect([unread, read, done].map((d) => matchesMessageFilter("open", d))).toEqual([true, true, false]);
    expect([unread, read, done].map((d) => matchesMessageFilter("resolved", d))).toEqual([false, false, true]);
  });
});

describe("matchesMessageSearch", () => {
  const m = { name: "Maria Papadopoulou", email: "maria@example.com", subject: "Invoice question", message: "I was charged twice for the yearly plan", note: "asked support to refund" };
  it("finds words anywhere, in any case, and needs every word", () => {
    expect(matchesMessageSearch(m, "")).toBe(true);
    expect(matchesMessageSearch(m, "MARIA")).toBe(true);
    expect(matchesMessageSearch(m, "charged twice")).toBe(true);
    expect(matchesMessageSearch(m, "invoice yearly")).toBe(true);
    expect(matchesMessageSearch(m, "refund")).toBe(true); // the internal note counts
    expect(matchesMessageSearch(m, "invoice monthly")).toBe(false);
    expect(matchesMessageSearch(m, "nobody")).toBe(false);
  });
  it("copes with messages that lack fields", () => expect(matchesMessageSearch({}, "x")).toBe(false));
});

describe("replyMailto", () => {
  it("addresses the sender, adds Re: once, and encodes the subject", () => {
    expect(replyMailto({ email: "maria@example.com", subject: "Invoice question" })).toBe("mailto:maria@example.com?subject=Re%3A%20Invoice%20question");
    expect(replyMailto({ email: "a@b.co", subject: "Re: hello" })).toBe("mailto:a@b.co?subject=Re%3A%20hello");
    expect(replyMailto({ email: "a+tag@b.co", subject: "Q&A #1" })).toContain("subject=Re%3A%20Q%26A%20%231");
  });
});
