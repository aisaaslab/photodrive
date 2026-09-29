import { redirect } from "next/navigation";

// Legacy success URL (still in the browser history / old Stripe sessions).
// The Thank You page at /thank-you is the canonical post-payment page.
export default async function LegacySuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ session_id?: string }>;
}) {
  const { session_id } = await searchParams;
  redirect(session_id ? `/thank-you?session_id=${encodeURIComponent(session_id)}` : "/thank-you");
}
