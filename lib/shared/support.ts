/**
 * Pure rules of the admin Support inbox (S8-02): the state of a contact message, what each filter keeps, the search, and the reply link.
 * No I/O, so they are tested on their own and shared by the server and the screen.
 */
export type MessageFilter = "all" | "unread" | "open" | "resolved";
export const MESSAGE_FILTERS: readonly MessageFilter[] = ["all", "unread", "open", "resolved"];
export type MessageState = "unread" | "read" | "resolved";

export type MessageFields = { read?: unknown; status?: unknown; name?: unknown; email?: unknown; subject?: unknown; message?: unknown; note?: unknown };

/** Resolved beats everything; otherwise read or unread. Older messages have neither field: they are unread, like when they arrived. */
export function messageState(d: MessageFields): MessageState {
  if (d.status === "resolved") return "resolved";
  return d.read === true ? "read" : "unread";
}

/** `open` is everything not resolved (what still needs an answer); `unread` is the part of it nobody has opened yet. */
export function matchesMessageFilter(filter: MessageFilter, d: MessageFields): boolean {
  const s = messageState(d);
  switch (filter) {
    case "all": return true;
    case "unread": return s === "unread";
    case "open": return s !== "resolved";
    case "resolved": return s === "resolved";
  }
}

const text = (v: unknown) => (typeof v === "string" ? v.toLowerCase() : "");

/** Every word of the search must appear somewhere in the sender, e-mail, subject, message or note (case does not matter). */
export function matchesMessageSearch(d: MessageFields, q: string): boolean {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const hay = [d.name, d.email, d.subject, d.message, d.note].map(text).join("\n");
  return words.every((w) => hay.includes(w));
}

/** A reply link that opens the administrator's own mail program, addressed to the sender, with "Re:" added once. */
export function replyMailto(m: { email: string; subject: string }): string {
  const subject = /^re:\s/i.test(m.subject) ? m.subject : `Re: ${m.subject}`;
  return `mailto:${encodeURIComponent(m.email).replace(/%40/g, "@")}?subject=${encodeURIComponent(subject)}`;
}

export const STATE_LABEL: Record<MessageState, string> = { unread: "Unread", read: "Read", resolved: "Resolved" };
