import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Joins class names and lets the last Tailwind utility win (`cn("px-4", cond && "px-6")` gives `px-6`). */
export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs));

/** The focus ring every interactive primitive shares: visible on the dark canvas, only for keyboard users. */
export const focusRing = "outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-canvas";
