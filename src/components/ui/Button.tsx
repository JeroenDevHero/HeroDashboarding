"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md";
  icon?: string;
  children?: ReactNode;
  loading?: boolean;
}

const variantStyles: Record<string, string> = {
  primary:
    "bg-hero-orange text-white hover:bg-hero-orange/90 active:bg-hero-orange/80",
  secondary:
    "bg-hero-blue-soft text-hero-blue hover:bg-hero-blue-soft/80 active:bg-hero-blue-soft/70",
  ghost:
    "text-hero-grey-regular hover:bg-hero-blue-hairline active:bg-hero-blue-soft/50",
  danger: "bg-red-500 text-white hover:bg-red-600 active:bg-red-700",
};

const sizeStyles: Record<string, string> = {
  sm: "h-8 px-3 text-xs gap-1.5",
  md: "h-9 px-4 text-sm gap-2",
};

export default function Button({
  variant = "primary",
  size = "md",
  icon,
  children,
  loading = false,
  disabled,
  className = "",
  ...rest
}: ButtonProps) {
  const isDisabled = disabled || loading;

  return (
    <button
      className={`
        inline-flex items-center justify-center font-medium
        rounded-[var(--radius-button)] transition-colors
        disabled:opacity-50 disabled:pointer-events-none
        cursor-pointer
        ${variantStyles[variant]}
        ${sizeStyles[size]}
        ${className}
      `}
      disabled={isDisabled}
      {...rest}
    >
      {loading ? (
        <span className="material-symbols-rounded text-[18px] animate-spin">
          progress_activity
        </span>
      ) : icon ? (
        <span
          className={`material-symbols-rounded ${size === "sm" ? "text-[16px]" : "text-[18px]"}`}
        >
          {icon}
        </span>
      ) : null}
      {children && <span>{children}</span>}
    </button>
  );
}
