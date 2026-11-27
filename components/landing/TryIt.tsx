"use client";

import { ArrowRight } from "lucide-react";
import { useLanguage } from "@/lib/i18n";
import { useDemoCreate } from "@/components/demo/useDemoCreate";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Pill } from "@/components/ui/Pill";
import { cn, focusRing } from "@/lib/ui/cn";

/**
 * "Try it now": paste a Google Drive folder link and open a 10-minute demo gallery (the existing demo flow, restyled to Concept B).
 * Not in the Figma file; designed in code from its tokens (D14). The hero's "View live demo" button scrolls here when no demo gallery
 * URL is configured.
 */
export function TryIt() {
  const { t } = useLanguage();
  const d = t.demo;
  const { driveUrl, setDriveUrl, loading, error, submit } = useDemoCreate();
  return (
    <section id="try-it" aria-labelledby="try-it-title" className="scroll-mt-4">
      <div className="mx-auto max-w-[1440px] px-4 pb-20 sm:px-8 lg:pb-[120px] xl:px-20">
        <Card tone="raised" className="mx-auto flex max-w-[860px] flex-col items-center gap-5 rounded-panel p-7 text-center sm:p-12">
          <Pill>{d.label}</Pill>
          <h2 id="try-it-title" className="text-h2-compact max-w-[18ch] font-extrabold text-fg text-balance">{d.title}</h2>
          <p className="text-lead max-w-[34rem] text-fg-muted">{d.subtitle}</p>
          <form onSubmit={submit} className="mt-2 flex w-full max-w-[640px] flex-col gap-3 sm:flex-row" noValidate={false}>
            <label className="sr-only" htmlFor="try-it-url">{t.landing.tryIt.fieldLabel}</label>
            <input
              id="try-it-url" type="text" required value={driveUrl} onChange={(e) => setDriveUrl(e.target.value)}
              placeholder="https://drive.google.com/drive/folders/…" autoComplete="off" inputMode="url"
              aria-invalid={error ? true : undefined} aria-describedby={error ? "try-it-error" : "try-it-hint"}
              className={cn("h-14 min-w-0 flex-1 rounded-pill border bg-canvas px-6 text-[15px] text-fg placeholder:text-fg-muted", error ? "border-danger" : "border-line focus-visible:border-accent", focusRing)}
            />
            <Button type="submit" size="lg" loading={loading} iconRight={<ArrowRight aria-hidden className="size-5" />} className="h-14 sm:shrink-0">
              {loading ? d.loading : d.cta.replace(/\s*→\s*$/, "")}
            </Button>
          </form>
          {error
            ? <p id="try-it-error" role="alert" className="text-sm text-danger">{error}</p>
            : <p id="try-it-hint" className="text-sm text-fg-muted">{d.hint}</p>}
        </Card>
      </div>
    </section>
  );
}
