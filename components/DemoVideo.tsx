"use client";

import { useRef, useState } from "react";
import { useLanguage } from "@/lib/i18n";

const VIDEO_LABELS: Record<string, { play: string; replay: string }> = {
  el: { play: "Δοκίμασε το", replay: "Δες το ξανά" },
  en: { play: "Watch the demo", replay: "Watch again" },
  nl: { play: "Bekijk de demo", replay: "Opnieuw bekijken" },
  de: { play: "Demo ansehen", replay: "Erneut ansehen" },
  es: { play: "Ver la demo", replay: "Ver de nuevo" },
  it: { play: "Guarda la demo", replay: "Guarda di nuovo" },
};

export function DemoVideo({ webm = "/tutorial-v2.webm", mp4 = "/tutorial-v2.mp4", label, title }: { webm?: string; mp4?: string; label?: string; title?: string }) {
  const { lang } = useLanguage();
  const L = VIDEO_LABELS[lang] ?? VIDEO_LABELS.en;
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [ended, setEnded] = useState(false);

  function handlePlay() {
    const v = videoRef.current;
    if (!v) return;
    if (ended) {
      v.currentTime = 0;
      setEnded(false);
    }
    v.play();
    setPlaying(true);
  }

  function handleEnded() {
    setPlaying(false);
    setEnded(true);
  }

  return (
    <section className="py-12 px-6">
      <div className="max-w-4xl mx-auto">
        {(label || title) && (
          <div className="text-center mb-10">
            {label && <p className="text-base font-semibold tracking-[0.2em] uppercase text-white mb-5">{label}</p>}
            {title && <h2 className="text-3xl sm:text-4xl font-bold text-white" style={{ fontFamily: "var(--font-brand), sans-serif" }}>{title}</h2>}
          </div>
        )}
        <div className="relative group rounded-2xl overflow-hidden shadow-2xl shadow-black/60 border border-white/[0.06]">
          <video
            ref={videoRef}
            playsInline
            controls
            preload="metadata"
            onEnded={handleEnded}
            className="w-full block"
          >
            <source src={webm} type="video/webm" />
            <source src={mp4} type="video/mp4" />
          </video>

          {/* Overlay — shows when not playing */}
          {!playing && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/40 backdrop-blur-[2px]">
              <button
                onClick={handlePlay}
                className="flex items-center justify-center w-20 h-20 rounded-full bg-white/10 border border-white/20 hover:bg-white/20 transition-all duration-200 backdrop-blur-sm"
              >
                {ended ? (
                  /* Replay icon */
                  <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
                  </svg>
                ) : (
                  /* Play icon */
                  <svg className="w-8 h-8 text-white translate-x-0.5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                )}
              </button>
              <span className="mt-4 text-sm text-white/70">
                {ended ? L.replay : L.play}
              </span>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
