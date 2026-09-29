/* Pure HTML/CSS product mockups (no screenshots needed). Decorative, so the
   inner images have empty alt text. */
import Image from "next/image";
import { GoogleDriveIcon } from "./icons";

const GALLERY = ["/lp/gallery-hero.webp", "/lp/couple-smiling.webp", "/lp/couple-baby.webp", "/lp/bride.webp"];

const FILES = ["IMG_4801.jpg", "IMG_4802.jpg", "IMG_4803.jpg", "IMG_4804.jpg"];

export function BeforeAfter() {
  return (
    <div className="mx-auto w-full max-w-md space-y-3">
      <p className="text-sm font-semibold text-stone-800">From this…</p>
      <div className="overflow-hidden rounded-xl border border-stone-200 bg-white shadow-md">
        <div className="flex items-center gap-2 border-b border-stone-100 px-4 py-2.5 text-xs font-semibold text-stone-700">
          <GoogleDriveIcon className="h-4 w-4" /> Google Drive
        </div>
        <div className="flex justify-between px-4 py-1.5 text-[10px] font-medium text-stone-400"><span>Name</span><span>Last modified</span></div>
        {FILES.map((f, i) => (
          <div key={f} className="flex items-center justify-between border-t border-stone-100 px-4 py-2 text-xs text-stone-600">
            <span className="flex items-center gap-2">
              <span className="relative h-6 w-6 overflow-hidden rounded-sm">
                <Image src={GALLERY[i]} alt="" fill sizes="24px" className="object-cover" />
              </span>
              {f}
            </span>
            <span className="text-stone-400">Apr 12, 2024</span>
          </div>
        ))}
      </div>
      <div className="flex justify-center text-blue-500" aria-hidden>
        <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 14l-7 7m0 0l-7-7m7 7V3" /></svg>
      </div>
      <p className="text-sm font-semibold text-stone-800">…to this</p>
      <div className="overflow-hidden rounded-xl border border-stone-200 shadow-md">
        <div className="relative aspect-[16/9]">
          <Image src="/lp/gallery-hero.webp" alt="A finished PhotoDrive client gallery" fill sizes="448px" className="object-cover" />
        </div>
        <div className="grid grid-cols-5 gap-1 bg-white p-1.5">
          {[...GALLERY, "/lp/couple-wide.webp"].map((src, i) => (
            <div key={i} className="relative aspect-[4/3] overflow-hidden rounded-sm">
              <Image src={src} alt="" fill sizes="90px" className="object-cover" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
