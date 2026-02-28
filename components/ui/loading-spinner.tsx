"use client";

import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface LoadingSpinnerProps {
  /** Optional label shown next to the spinner (e.g. "Signing in", "Loading issues") */
  label?: string;
  /** Size of the spinner icon */
  size?: "sm" | "default" | "lg";
  /** Use for full-page or block-level loading (centered, vertical layout) */
  block?: boolean;
  className?: string;
}

const sizeClasses = {
  sm: "h-3 w-3",
  default: "h-4 w-4",
  lg: "h-6 w-6",
};

export function LoadingSpinner({
  label,
  size = "default",
  block = false,
  className,
}: LoadingSpinnerProps) {
  const iconSize = sizeClasses[size];
  const blockIconSize = size === "lg" ? "h-10 w-10" : "h-8 w-8";

  if (block) {
    return (
      <div
        className={cn(
          "flex flex-col items-center justify-center gap-2 py-8 text-muted-foreground",
          className
        )}
        role="status"
        aria-label={label || "Loading"}
      >
        <Loader2 className={cn(blockIconSize, "w-auto animate-spin")} />
        {label && <span className="text-sm">{label}</span>}
      </div>
    );
  }

  return (
    <span
      className={cn("inline-flex items-center justify-center", className)}
      role="status"
      aria-label={label || "Loading"}
    >
      <Loader2
        className={cn(iconSize, "w-auto shrink-0 animate-spin", !label && "text-current")}
        aria-hidden
      />
      {label && <span className="ml-2 truncate">{label}</span>}
    </span>
  );
}
