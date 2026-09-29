/* Pure HTML/CSS product mockups (no screenshots needed). Decorative, so the
   inner images have empty alt text. */
import Image from "next/image";
import { DriveLogo, Folder } from "./icons";

const GALLERY = ["/lp/gallery-hero.webp", "/lp/couple-smiling.webp", "/lp/couple-baby.webp", "/lp/bride.webp"];

function GalleryScreen({ compact = false }: { compact?: boolean }) {
  return (
    <div className="bg-white p-3 sm:p-4">
      <div className="mb-2 text-center">
        <p className={`font-semibold text-stone-800 ${compact ? "text-[9px]" : "text-xs sm:text-sm"}`}>The Johnson Family</p>
        <p className={`text-stone-400 ${compact ? "text-[7px]" : "text-[9px]"}`}>Delivered by your photographer</p>
      </div>
      <div className="grid grid-cols-3 gap-1.5">
        {[...GALLERY, "/lp/couple-wide.webp", "/lp/gallery-hero.webp"].map((src, i) => (
          <div key={i} className="relative aspect-[4/3] overflow-hidden rounded-sm">
            <Image src={src} alt="" fill sizes="200px" className="object-cover" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function DeviceHero() {
  return (
    <div className="relative mx-auto w-full max-w-[560px]">
      {/* Drive folder card */}
      <div className="absolute -top-6 right-0 z-20 hidden w-44 rounded-xl border border-stone-200 bg-white p-3 text-xs shadow-xl sm:block">
        <div className="mb-2 flex items-center gap-2 font-semibold text-stone-800">
          <DriveLogo className="h-4 w-4" /> Google Drive
        </div>
        <ul className="space-y-1.5 text-stone-600">
          {["Wedding Photos", "Family Session", "Events", "Portraits"].map((f) => (
            <li key={f} className="flex items-center gap-2"><Folder />{f}</li>
          ))}
        </ul>
      </div>
      {/* Laptop */}
      <div className="relative z-10 mx-auto w-[88%] overflow-hidden rounded-t-xl border-[6px] border-b-0 border-stone-800 bg-stone-800 shadow-2xl">
        <GalleryScreen />
      </div>
      <div className="mx-auto h-2.5 w-full rounded-b-xl bg-gradient-to-b from-stone-300 to-stone-400 shadow-lg" />
      {/* Phone */}
      <div className="absolute -bottom-4 right-1 z-20 w-[26%] overflow-hidden rounded-2xl border-[4px] border-stone-900 bg-stone-900 shadow-2xl">
        <div className="grid grid-cols-2 gap-0.5 bg-white p-1.5">
          {GALLERY.map((src, i) => (
            <div key={i} className="relative aspect-square overflow-hidden rounded-sm">
              <Image src={src} alt="" fill sizes="80px" className="object-cover" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const FILES = ["IMG_4801.jpg", "IMG_4802.jpg", "IMG_4803.jpg", "IMG_4804.jpg"];

export function BeforeAfter() {
  return (
    <div className="mx-auto w-full max-w-md space-y-3">
      <p className="text-sm font-semibold text-stone-800">From this…</p>
      <div className="overflow-hidden rounded-xl border border-stone-200 bg-white shadow-md">
        <div className="flex items-center gap-2 border-b border-stone-100 px-4 py-2.5 text-xs font-semibold text-stone-700">
          <DriveLogo className="h-4 w-4" /> Google Drive
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
