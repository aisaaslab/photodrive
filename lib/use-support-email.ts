"use client";

import { useEffect, useState } from "react";
import { SUPPORT_EMAIL as PLACEHOLDER_EMAIL } from "./branding";

/**
 * Live support email, sourced from the admin back office
 * (Firestore `settings/site` via GET /api/site-settings).
 *
 * Returns the placeholder until the runtime value loads. Never reads env —
 * the support email is admin-managed only.
 */
export function useSupportEmail(): string {
  const [email, setEmail] = useState(PLACEHOLDER_EMAIL);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/site-settings")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && typeof data?.supportEmail === "string" && data.supportEmail) {
          setEmail(data.supportEmail);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  return email;
}
