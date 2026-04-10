import type { ReactNode } from "react";

interface BadgeProps {
  variant: "info" | "success" | "warning" | "error";
  children: ReactNode;
}

const variantStyles: Record<string, string> = {
  info: "bg-hero-blue-soft text-hero-blue",
  success: "bg-emerald-50 text-emerald-700",
  warning: "bg-amber-50 text-amber-700",
  error: "bg-red-50 text-red-600",
};

export default function Badge({ variant, children }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 text-[11px] font-medium rounded-full ${variantStyles[variant]}`}
    >
      {children}
    </span>
  );
}
