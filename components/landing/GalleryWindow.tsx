import Image from "next/image";
import type { Translations } from "@/lib/i18n";
import { cn } from "@/lib/ui/cn";
import { FloatingChip } from "./FloatingChip";
import { Icon } from "./Icon";

const PHOTOS = [1, 2, 3, 4, 5, 6, 7, 8];

/**
 * The product preview of the hero: a browser-style window showing a sample gallery (title bar, header, filters, photo grid) with three
 * floating chips. Static: it only illustrates what a client sees. The sample names and counts are translated; the photos are the design's.
 */
export function GalleryWindow({ t }: { t: Translations }) {
  const w = t.landing.window;
  return (
    <div className="relative mx-auto mt-14 w-full max-w-[1120px] px-4 sm:px-8 lg:mt-16 xl:px-0">
      <div className="h-[430px] overflow-hidden rounded-t-card border border-b-0 border-line bg-surface shadow-window sm:h-[480px] lg:h-[560px]">
        <div className="flex h-12 items-center justify-between bg-surface-2 px-5">
          <Icon name="window-dots" size={56} className="h-[10px] w-14" />
          <div className="flex items-center gap-2 rounded-pill bg-canvas px-[18px] py-1.5">
            <Icon name="lock-muted-13" size={13} />
            <span className="whitespace-nowrap text-[13px] font-medium text-fg-muted">{w.address}</span>
          </div>
          <span aria-hidden className="w-14" />
        </div>
        <div className="flex flex-col gap-5 p-4 sm:p-6 lg:gap-[26px] lg:p-8">
          <div className="flex items-center justify-between gap-4">
            <div className="flex min-w-0 flex-col gap-1">
              <p className="truncate text-[22px] font-extrabold tracking-[-0.01em] text-fg lg:text-[28px]">{w.name}</p>
              <p className="truncate text-sm text-fg-muted">{w.meta}</p>
            </div>
            <div className="hidden shrink-0 items-center gap-2.5 sm:flex">
              <span className="rounded-pill bg-accent px-[18px] py-2.5 text-sm font-bold text-canvas">{w.all}</span>
              <span className="inline-flex items-center gap-[7px] rounded-pill bg-surface-2 px-[18px] py-2.5 text-sm font-semibold text-fg"><Icon name="heart-accent-14" size={14} />{w.favorites}</span>
              <span className="hidden items-center gap-[7px] rounded-pill bg-surface-2 px-[18px] py-2.5 text-sm font-semibold text-fg md:inline-flex"><Icon name="download-muted-14" size={14} />{w.downloadAll}</span>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:gap-4">
            {PHOTOS.map((n) => (
              <div key={n} className={cn("relative h-[150px] overflow-hidden rounded-[14px] sm:h-[200px] lg:h-[300px]", n > 4 && "hidden sm:block")}>
                <Image src={`/landing/gallery-${n}.jpg`} alt="" fill sizes="(min-width: 1024px) 270px, (min-width: 640px) 22vw, 45vw" className="object-cover" />
              </div>
            ))}
          </div>
        </div>
      </div>
      <FloatingChip icon="heart-accent-18" title={w.chipFavTitle} sub={w.chipFavSub} className="left-6 top-[266px] hidden md:flex min-[1440px]:-left-[120px]" />
      <FloatingChip icon="download-accent-18" title={w.chipFullTitle} sub={w.chipFullSub} className="right-6 top-[186px] hidden md:flex min-[1440px]:-right-[94px]" />
      <FloatingChip icon="lock-accent-18" title={w.chipLockTitle} sub={w.chipLockSub} className="right-6 top-[356px] hidden md:flex min-[1440px]:-right-[118px]" />
    </div>
  );
}
