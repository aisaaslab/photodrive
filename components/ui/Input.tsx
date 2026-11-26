import { useId } from "react";
import { cn, focusRing } from "@/lib/ui/cn";

type Props = Omit<React.InputHTMLAttributes<HTMLInputElement>, "size"> & { label?: string; hint?: string; error?: string };

/** A labelled text field. The label, hint and error are wired with `htmlFor` / `aria-describedby`; an error also sets `aria-invalid`. */
export function Input({ label, hint, error, className, id, ...rest }: Props) {
  const auto = useId();
  const fieldId = id ?? auto;
  const noteId = `${fieldId}-note`;
  return (
    <div className="flex flex-col gap-1.5">
      {label && <label htmlFor={fieldId} className="text-sm font-semibold text-fg">{label}</label>}
      <input
        id={fieldId}
        aria-invalid={error ? true : undefined}
        aria-describedby={error || hint ? noteId : undefined}
        className={cn(
          "h-12 w-full rounded-tile border bg-surface-2 px-4 text-[15px] text-fg placeholder:text-fg-muted transition-colors",
          "disabled:opacity-50 disabled:cursor-not-allowed",
          error ? "border-danger" : "border-line hover:border-fg-muted/50 focus-visible:border-accent",
          focusRing, className,
        )}
        {...rest}
      />
      {(error || hint) && <p id={noteId} className={cn("text-sm", error ? "text-danger" : "text-fg-muted")}>{error ?? hint}</p>}
    </div>
  );
}
