import type { ComponentProps, ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

type DisclosureProps = Omit<ComponentProps<"details">, "title"> & {
  title: ReactNode;
  density?: "default" | "compact";
  contentClassName?: string;
};

// Native disclosure keeps static pages usable before hydration. Its visual
// contract is shared with the Radix Accordion in globals.css.
export function Disclosure({
  title,
  density = "default",
  className,
  contentClassName,
  children,
  ...props
}: DisclosureProps) {
  return (
    <details className={cn("disclosure", className)} data-density={density} {...props}>
      <summary className="ghost-control disclosure-trigger">
        <span className="disclosure-label">{title}</span>
        <ChevronDown className="disclosure-icon" aria-hidden="true" />
      </summary>
      <div className={cn("disclosure-body", contentClassName)}>{children}</div>
    </details>
  );
}
