import { useState } from "preact/hooks";
import type { ComponentChildren } from "preact";
import { ChevronDown, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";

interface AdvancedSectionProps {
  title?: string;
  description?: string;
  storageKey: string;
  defaultOpen?: boolean;
  children: ComponentChildren;
}

export function AdvancedSection({
  title = "Advanced options",
  description,
  storageKey,
  defaultOpen = false,
  children,
}: AdvancedSectionProps) {
  const [isOpen, setIsOpen] = useState(() => {
    try {
      return localStorage.getItem(storageKey) === "open" ? true : defaultOpen;
    } catch {
      return defaultOpen;
    }
  });

  const toggle = () => {
    setIsOpen((prev: boolean) => {
      const next = !prev;
      try {
        localStorage.setItem(storageKey, next ? "open" : "closed");
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  const regionId = `${storageKey}-region`;

  return (
    <div className="mt-4 border rounded-lg bg-muted/20">
      <Button
        type="button"
        variant="ghost"
        onClick={toggle}
        aria-expanded={isOpen}
        aria-controls={regionId}
        className="w-full min-h-[44px] h-auto justify-between px-4 py-3 font-medium"
      >
        <span className="flex items-center gap-2">
          <SlidersHorizontal className="w-4 h-4" aria-hidden="true" />
          {title}
        </span>
        <ChevronDown
          className={`w-4 h-4 shrink-0 transition-transform duration-200 motion-reduce:transition-none ${isOpen ? "rotate-180" : ""}`}
          aria-hidden="true"
        />
      </Button>
      {description && !isOpen && (
        <p className="px-4 pb-3 -mt-1 text-sm text-muted-foreground">{description}</p>
      )}
      {isOpen && (
        <div id={regionId} role="region" aria-label={title} className="px-4 pb-4 pt-1 space-y-6">
          {children}
        </div>
      )}
    </div>
  );
}
