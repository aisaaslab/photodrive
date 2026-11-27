"use client";

import { useEffect, useRef, useState } from "react";
import {
  UNZOOMED, clampPan, isDoubleTap, pinchedTo, swipeAction, toggledZoom, zoomedBy,
  type Zoom, type ZoomValue,
} from "@/lib/gallery/lightbox-math";

/**
 * Zoom and gestures for the lightbox (S5-10; the rules are in lib/gallery/lightbox-math.ts). Pinch (two fingers), double-tap /
 * double-click, Ctrl/⌘ + wheel, the top-bar button and the + / - / 0 keys all drive one zoom state, keyed by photo id so moving to
 * another photo starts at 1x without an effect. When not zoomed, a one-finger swipe navigates: left/right = prev/next, down = close.
 * When zoomed, one finger (or the mouse) pans instead.
 */
export function useLightboxZoom({
  pid, isVideo, onNext, onPrev, onClose,
}: {
  pid: string;
  isVideo: boolean;
  onNext: () => void;
  onPrev: () => void;
  onClose: () => void;
}) {
  const [zoomState, setZoomState] = useState<Zoom>({ id: "", ...UNZOOMED });
  const zoom: Zoom = zoomState.id === pid ? zoomState : { id: pid, ...UNZOOMED };
  const zoomRef = useRef(zoom);
  const imgRef = useRef<HTMLImageElement>(null);
  const areaRef = useRef<HTMLDivElement>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{
    kind: "swipe" | "pan" | "pinch";
    sx: number; sy: number;
    startPan: { x: number; y: number };
    startDist: number; startScale: number;
    moved: boolean;
  } | null>(null);
  const lastTap = useRef<{ t: number; x: number; y: number } | null>(null);
  const suppressClick = useRef(false);
  const [gesturing, setGesturing] = useState(false);

  const size = () => [imgRef.current?.offsetWidth ?? 0, imgRef.current?.offsetHeight ?? 0] as const;

  function setZoomTo(next: ZoomValue) {
    const v = { id: pid, ...next };
    zoomRef.current = v;
    setZoomState(v);
  }

  function zoomStep(factor: number) {
    const [w, h] = size();
    setZoomTo(zoomedBy(zoomRef.current, factor, w, h));
  }

  function toggleZoom() {
    setZoomTo(toggledZoom(zoomRef.current));
  }

  // Latest-closure refs for the document-level key / wheel listeners.
  const zoomStepRef = useRef(zoomStep);
  const isVideoRef = useRef(isVideo);
  useEffect(() => {
    zoomRef.current = zoom;
    zoomStepRef.current = zoomStep;
    isVideoRef.current = isVideo;
  });

  // Ctrl/⌘ + wheel (also what a trackpad pinch emits) zooms. Native listener
  // because React's onWheel is passive and can't preventDefault the page zoom.
  useEffect(() => {
    const el = areaRef.current;
    if (!el) return;
    function onWheel(e: WheelEvent) {
      if (!(e.ctrlKey || e.metaKey) || isVideoRef.current) return;
      e.preventDefault();
      zoomStepRef.current(Math.exp(-e.deltaY * 0.01));
    }
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  function onPointerDown(e: React.PointerEvent) {
    if (isVideo) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const z = zoomRef.current;
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      gesture.current = {
        kind: "pinch", sx: 0, sy: 0, startPan: { x: z.x, y: z.y },
        startDist: Math.hypot(a.x - b.x, a.y - b.y) || 1, startScale: z.s, moved: true,
      };
      setGesturing(true);
    } else if (pointers.current.size === 1) {
      gesture.current = {
        kind: z.s > 1 ? "pan" : "swipe", sx: e.clientX, sy: e.clientY,
        startPan: { x: z.x, y: z.y }, startDist: 0, startScale: z.s, moved: false,
      };
      if (z.s > 1) setGesturing(true);
    }
  }

  function onPointerMove(e: React.PointerEvent) {
    const g0 = gesture.current;
    if (!g0 || !pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const [w, h] = size();
    if (g0.kind === "pinch" && pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()];
      setZoomTo(pinchedTo(g0.startScale, g0.startDist, Math.hypot(a.x - b.x, a.y - b.y), g0.startPan, w, h));
      return;
    }
    const dx = e.clientX - g0.sx;
    const dy = e.clientY - g0.sy;
    if (Math.hypot(dx, dy) > 8) g0.moved = true;
    if (g0.kind === "pan") {
      const s = zoomRef.current.s;
      setZoomTo({ s, ...clampPan(s, g0.startPan.x + dx, g0.startPan.y + dy, w, h) });
    }
  }

  function onPointerUp(e: React.PointerEvent) {
    const g0 = gesture.current;
    if (!pointers.current.delete(e.pointerId) || !g0) return;

    // A drag/pinch must not also count as a backdrop click (which would close).
    if (g0.moved) {
      suppressClick.current = true;
      setTimeout(() => { suppressClick.current = false; }, 60);
    }

    if (g0.kind === "pinch") {
      if (pointers.current.size === 0) {
        gesture.current = null;
        setGesturing(false);
        if (zoomRef.current.s < 1.05) setZoomTo(UNZOOMED);
      } else {
        // One finger still down: carry on as a pan from where it is.
        const [p] = [...pointers.current.values()];
        const z = zoomRef.current;
        gesture.current = { kind: "pan", sx: p.x, sy: p.y, startPan: { x: z.x, y: z.y }, startDist: 0, startScale: z.s, moved: true };
      }
      return;
    }

    gesture.current = null;
    setGesturing(false);
    const dx = e.clientX - g0.sx;
    const dy = e.clientY - g0.sy;

    // Swipe navigation (touch / pen, only while not zoomed).
    if (g0.kind === "swipe") {
      const action = swipeAction(dx, dy, e.pointerType);
      if (action) {
        if (action === "next") onNext();
        else if (action === "prev") onPrev();
        else onClose();
        return;
      }
    }

    // Double-tap / double-click on the photo toggles zoom.
    if (!g0.moved && (e.target as HTMLElement).tagName === "IMG") {
      const now = Date.now();
      if (isDoubleTap(lastTap.current, now, e.clientX, e.clientY)) {
        lastTap.current = null;
        toggleZoom();
      } else {
        lastTap.current = { t: now, x: e.clientX, y: e.clientY };
      }
    }
  }

  function onPointerCancel(e: React.PointerEvent) {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size === 0) {
      gesture.current = null;
      setGesturing(false);
    }
  }

  return {
    zoom, gesturing, imgRef, areaRef, suppressClick, toggleZoom, zoomStepRef, isVideoRef,
    pointerHandlers: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel },
  };
}
