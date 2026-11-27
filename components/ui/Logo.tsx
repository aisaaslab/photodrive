import Image from "next/image";
import { APP_NAME } from "@/lib/branding";
import { cn } from "@/lib/ui/cn";

/** The original PhotoDrive logo (folder, camera lens, wordmark), in the version made for dark backgrounds. */
export function Logo({ className, priority }: { className?: string; priority?: boolean }) {
  return <Image src="/logo-light.png" alt={APP_NAME} width={735} height={200} priority={priority} className={cn("h-10 w-auto sm:h-11", className)} />;
}
