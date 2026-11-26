import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Kitchen } from "./Kitchen";

export const metadata: Metadata = { title: "UI kitchen sink", robots: { index: false, follow: false } };

/**
 * Every UI primitive with its variants and states (S5-03). Development and review only: in production the page does not exist
 * unless `SHOW_DEV_UI=1` is set (it never is on the live site), so it is not served to visitors or search engines.
 */
export default function DevUiPage() {
  if (process.env.NODE_ENV === "production" && process.env.SHOW_DEV_UI !== "1") notFound();
  return <Kitchen />;
}
