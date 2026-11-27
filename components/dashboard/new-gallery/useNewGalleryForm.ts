"use client";

import type { GalleryDoc } from "@/lib/firestore/types";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { useLanguage } from "@/lib/i18n";
import type { Visibility } from "@/lib/gallery/visibility";
import {
  createGalleryBody, initialValues, isValidDriveUrl, pendingGalleryOf,
  type NewGalleryInitial, type NewGalleryValues, type SocialKey,
} from "@/lib/gallery/new-gallery";
import type { DriveCheckResult } from "@/lib/drive/check-message";
import { usePaymentPlans } from "./usePaymentPlans";

/**
 * The "new gallery" form's state and its flow (S5-09): the fields, the create request, and the subscription gate in front of it.
 * Creating answers 402 for a visitor without an active subscription; the payment step is then shown, the form is kept in the
 * browser while they pay, and after payment the dashboard restores it with `autoSubmit` so the gallery is created without another
 * click. The rules about what is sent are pure functions in lib/gallery/new-gallery.ts.
 */
export function useNewGalleryForm({
  onCreated, initialData, autoSubmit,
}: {
  onCreated: (gallery: GalleryDoc) => void;
  initialData?: NewGalleryInitial;
  /** After payment, auto-submit the restored form once the subscription is active. */
  autoSubmit?: boolean;
}) {
  const { user } = useAuth();
  const { t } = useLanguage();
  const f = t.newGalleryForm;
  const start = initialValues(initialData);
  const [name, setName] = useState(start.name);
  const [driveUrl, setDriveUrl] = useState(start.driveUrl);
  const [password, setPassword] = useState(start.password);
  // Public (link opens it) or private (password required), D18.
  const [visibility, setVisibility] = useState<Visibility>(start.visibility);
  const [social, setSocial] = useState<Record<SocialKey, string>>(start.social);
  const [socialOn, setSocialOn] = useState<Record<SocialKey, boolean>>(start.socialOn);
  // Optional gallery metadata: subtitle, event date, location.
  const [description, setDescription] = useState(start.description);
  const [eventDate, setEventDate] = useState(start.eventDate);
  const [location, setLocation] = useState(start.location);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showPayment, setShowPayment] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const payment = usePaymentPlans(showPayment);

  const values: NewGalleryValues = { name, driveUrl, password, visibility, social, socialOn, description, eventDate, location };
  const driveValid = driveUrl.length > 0 && isValidDriveUrl(driveUrl);
  const driveInvalid = driveUrl.length > 0 && !isValidDriveUrl(driveUrl);
  const submittingRef = useRef(false);

  // Live check of the Drive folder (S10-03): once the link looks right and typing pauses, ask the server whether the folder can be read
  // and what is in it. The answer is stored with the link it is for, so a stale answer is never shown for a newer link. It only informs:
  // creating the gallery is never blocked by it.
  const [checked, setChecked] = useState<{ url: string; result: DriveCheckResult } | null>(null);
  useEffect(() => {
    if (!driveValid || !user) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const token = await user.getIdToken();
        const res = await fetch("/api/drive/check", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ driveUrl }),
        });
        const result: DriveCheckResult = res.ok ? await res.json() : { status: "unavailable" };
        if (!cancelled) setChecked({ url: driveUrl, result });
      } catch {
        if (!cancelled) setChecked({ url: driveUrl, result: { status: "unavailable" } });
      }
    }, 600);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [driveUrl, driveValid, user]);
  const driveCheck: DriveCheckResult | "checking" | null = !driveValid ? null : checked?.url === driveUrl ? checked.result : "checking";

  async function isSubscriptionActive(): Promise<boolean> {
    if (!user) return false;
    try {
      const token = await user.getIdToken();
      const subRes = await fetch("/api/user/subscription", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const subData = await subRes.json();
      return !!subData.isActive;
    } catch {
      return false;
    }
  }

  // When a 402 comes back from gallery creation, the subscription may have
  // JUST been activated (webhook/verify landing moments after our check).
  // Poll briefly before showing the payment card so a paid user is never
  // asked to pay twice.
  async function waitForActivation(tries = 6, delayMs = 1500): Promise<boolean> {
    for (let i = 0; i < tries; i++) {
      if (i > 0) await new Promise((r) => setTimeout(r, delayMs));
      if (await isSubscriptionActive()) return true;
    }
    return false;
  }

  async function createGallery(): Promise<boolean> {
    if (!user) return false;
    const token = await user.getIdToken();
    const res = await fetch("/api/galleries", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(createGalleryBody(values)),
    });

    const data = await res.json();
    if (res.ok) {
      setName("");
      setDriveUrl("");
      setPassword("");
      setSocial({ website: "", instagram: "", facebook: "" });
      setSocialOn({ website: false, instagram: false, facebook: false });
      setDescription("");
      setEventDate("");
      setLocation("");
      onCreated(data as GalleryDoc);
      return true;
    }

    if (res.status === 402) {
      if (await waitForActivation()) {
        // Subscription became active in the meantime — retry once.
        return createGallery();
      }
      setShowPayment(true);
      return false;
    }

    setError(data.error ?? f.error);
    return false;
  }

  async function submitForm(opts?: { justPaid?: boolean; skipSubscriptionCheck?: boolean }): Promise<void> {
    if (!user || submittingRef.current) return;
    if (visibility === "private" && !password) {
      setError(f.passwordRequired);
      return;
    }
    submittingRef.current = true;
    setError("");
    setLoading(true);

    try {
      if (!opts?.skipSubscriptionCheck && !(await isSubscriptionActive())) {
        // justPaid: the user completed checkout moments ago — activation may
        // still be landing, so poll briefly before showing the payment card.
        // Otherwise (a fresh, unpaid visitor) show the card immediately.
        if (!opts?.justPaid || !(await waitForActivation())) {
          setShowPayment(true);
          return;
        }
      }

      await createGallery();
    } finally {
      setLoading(false);
      submittingRef.current = false;
    }
  }

  // Post-payment flow: the dashboard restores this form with autoSubmit so the
  // gallery the user paid for is created without another click.
  useEffect(() => {
    if (!autoSubmit || !user) return;
    let cancelled = false;
    (async () => {
      // justPaid lets submitForm tolerate an activation that is still landing
      // (slow webhook) instead of immediately showing the payment card.
      try {
        if (!cancelled) await submitForm({ justPaid: true });
      } catch {
        // Network/API failure — leave the form filled so the user can retry.
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoSubmit, user]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    await submitForm();
  }

  async function handleCheckout() {
    if (!user) return;
    setCheckoutLoading(true);
    localStorage.setItem("pending_gallery", JSON.stringify(pendingGalleryOf(values)));
    setError("");
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ planId: payment.selectedPlan?.id }),
      });
      const data = await res.json();
      if (data.alreadyPaid) {
        // A previous paid session was found — no new charge. The route just
        // activated the subscription server-side, so skip the pre-check and
        // create the gallery directly.
        setShowPayment(false);
        setCheckoutLoading(false);
        await submitForm({ skipSubscriptionCheck: true });
        return;
      }
      if (data.url) {
        window.location.href = data.url;
        return;
      }
      setError(f.error);
      setCheckoutLoading(false);
    } catch {
      setError(f.error);
      setCheckoutLoading(false);
    }
  }

  return {
    f, values, error, loading, showPayment, checkoutLoading, payment, driveValid, driveInvalid, driveCheck,
    setName, setDriveUrl, setPassword, setVisibility, setSocial, setSocialOn, setDescription, setEventDate, setLocation,
    setShowPayment, handleSubmit, handleCheckout,
  };
}
