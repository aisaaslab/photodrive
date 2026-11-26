"use client";

import { useRef, useState } from "react";
import { Play, RotateCcw } from "lucide-react";
import { useLanguage } from "@/lib/i18n";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { cn, focusRing } from "@/lib/ui/cn";

/**
 * Tutorial video (not in the Figma file; designed from its tokens, D14). A play button over the first frame until it starts, a replay
 * button when it ends; the video keeps its native controls once playing. Only the video's metadata is loaded up front.
 */
export function Video({ webm = "/photodrive_homepage_video.webm", mp4 = "/photodrive_homepage_video.mp4" }: { webm?: string; mp4?: string }) {
  const { t } = useLanguage();
  const v = t.landing.video;
  const ref = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [ended, setEnded] = useState(false);

  function play() {
    const el = ref.current;
    if (!el) return;
    if (ended) { el.currentTime = 0; setEnded(false); }
    void el.play();
    setPlaying(true);
  }

  return (
    <section aria-labelledby="video-title" className="scroll-mt-4">
      <div className="mx-auto flex max-w-[1000px] flex-col items-center gap-10 px-4 pb-20 sm:px-8 lg:gap-12 lg:pb-[120px]">
        <SectionHeader eyebrow={v.label} title={<span id="video-title">{v.title}</span>} />
        <div className="relative w-full overflow-hidden rounded-[28px] border border-line bg-surface shadow-window">
          <video
            ref={ref} playsInline controls preload="metadata" aria-label={v.aria} className="block w-full"
            onEnded={() => { setPlaying(false); setEnded(true); }} onPause={(e) => { if (!e.currentTarget.ended) setPlaying(false); }} onPlay={() => setPlaying(true)}
          >
            <source src={webm} type="video/webm" />
            <source src={mp4} type="video/mp4" />
          </video>
          {!playing && (
            <div className="absolute inset-0 grid place-items-center bg-canvas/50 backdrop-blur-[2px]">
              <button
                type="button" onClick={play}
                className={cn("flex flex-col items-center gap-3 rounded-full text-fg", focusRing)}
              >
                <span className="grid size-20 place-items-center rounded-full border border-white/20 bg-glass backdrop-blur-sm transition-colors hover:bg-white/20">
                  {ended ? <RotateCcw aria-hidden className="size-8" /> : <Play aria-hidden className="size-8 translate-x-0.5 fill-current" />}
                </span>
                <span className="text-sm font-semibold text-fg-soft">{ended ? v.replay : v.play}</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
