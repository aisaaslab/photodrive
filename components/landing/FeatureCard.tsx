import { Card } from "@/components/ui/Card";
import { cn } from "@/lib/ui/cn";
import { Icon } from "./Icon";

/** One feature: icon tile, title, text. `large` is the 28px title used by the gallery card. */
export function FeatureCard({ icon, title, desc, children, className }: { icon: string; title: string; desc: string; children?: React.ReactNode; className?: string }) {
  return (
    <Card hoverable className={cn("flex flex-col gap-3.5 p-[30px]", className)}>
      <span aria-hidden className="grid size-12 place-items-center rounded-[14px] bg-accent-soft"><Icon name={icon} size={22} /></span>
      <h3 className="text-xl font-bold leading-[26px] text-fg">{title}</h3>
      <p className="text-[15px] leading-[23px] text-fg-muted">{desc}</p>
      {children}
    </Card>
  );
}
