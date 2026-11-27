import Image from "next/image";

/**
 * An icon exactly as exported from the approved design (public/landing/icons/<name>.svg; the file name carries its colour and size,
 * e.g. `check-accent-16`). Decorative: hidden from screen readers. SVG files are served as they are (no image optimisation).
 */
export function Icon({ name, size, className }: { name: string; size: number; className?: string }) {
  return <Image src={`/landing/icons/${name}.svg`} alt="" width={size} height={size} unoptimized aria-hidden className={className} />;
}
