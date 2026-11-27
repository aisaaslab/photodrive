import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/server/auth";
import { route } from "@/lib/server/http";
import { MESSAGE_FILTERS, decodeCursor, listMessagesPage } from "@/lib/server/repos/admin-messages";
import type { MessageFilter } from "@/lib/shared/support";

/**
 * Admin-only: one page of contact-form messages, newest first (S8-02), for the Support inbox. `?filter=` is all | unread | open | resolved,
 * `?q=` searches the sender, e-mail, subject, message and note (every word must match), `?cursor=` continues a page, `?limit=` is 1 to 50
 * (default 25). Each message carries the customer account that has the sender's e-mail address, if any, and `counts` for the filter chips.
 */
export const GET = route("admin.messages.list", async (req: NextRequest) => {
  const admin = await requireAdmin(req);
  if (!admin.ok) return admin.response;

  const params = req.nextUrl.searchParams;
  const filter = (params.get("filter") ?? "all") as MessageFilter;
  if (!MESSAGE_FILTERS.includes(filter)) return NextResponse.json({ error: "Unknown filter" }, { status: 400 });
  if (params.get("cursor") && !decodeCursor(params.get("cursor"))) return NextResponse.json({ error: "Invalid cursor" }, { status: 400 });
  const limit = Number(params.get("limit") ?? 25);

  return NextResponse.json(await listMessagesPage({ q: (params.get("q") ?? "").slice(0, 200), filter, cursor: params.get("cursor"), limit: Number.isFinite(limit) ? limit : 25 }));
});
