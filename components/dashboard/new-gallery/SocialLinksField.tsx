"use client";

import { SOCIALS } from "./socials";
import type { useNewGalleryForm } from "./useNewGalleryForm";

type Form = ReturnType<typeof useNewGalleryForm>;

/** Optional website / Instagram / Facebook links: a row is switched on to show its field. */
export function SocialLinksField({ form }: { form: Form }) {
  const { f, setSocial, setSocialOn } = form;
  const { social, socialOn } = form.values;
  return (
    <>
      {/* Social links (optional) */}
      <div className="bg-[#1a1a1a] border border-white/10 rounded-xl p-4 space-y-2.5">
        <div className="text-xs font-medium text-white/80">
          {f.linksLabel} <span className="text-white/40">{f.passwordOptional}</span>
        </div>
        {SOCIALS.map((soc) => (
          <div key={soc.key}>
            <button
              type="button"
              onClick={() => setSocialOn((s) => ({ ...s, [soc.key]: !s[soc.key] } as typeof s))}
              className="flex items-center gap-2.5 text-sm text-white w-full"
            >
              <span className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors ${socialOn[soc.key] ? "bg-[#17509e] border-[#17509e]" : "border-white/25"}`}>
                {socialOn[soc.key] && (
                  <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                  </svg>
                )}
              </span>
              <span className="text-white/70 shrink-0">{soc.icon}</span>
              {soc.label}
            </button>
            {socialOn[soc.key] && (
              <input
                type="url"
                value={social[soc.key]}
                onChange={(e) => setSocial((s) => ({ ...s, [soc.key]: e.target.value } as typeof s))}
                placeholder={soc.placeholder}
                className="mt-2 w-full bg-[#1a1a1a] border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-stone-600 outline-none focus:border-white/25 transition-all"
              />
            )}
          </div>
        ))}
      </div>
    </>
  );
}
