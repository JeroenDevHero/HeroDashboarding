import type { ReactNode } from "react";

interface CardProps {
  children: ReactNode;
  className?: string;
  title?: string;
  subtitle?: string;
  headerAction?: ReactNode;
}

export default function Card({
  children,
  className = "",
  title,
  subtitle,
  headerAction,
}: CardProps) {
  const hasHeader = title || subtitle || headerAction;

  return (
    <div
      className={`bg-white rounded-[var(--radius-card)] shadow-[0_1px_3px_rgba(7,56,137,0.08)] ${className}`}
    >
      {hasHeader && (
        <div className="flex items-start justify-between px-5 pt-5 pb-0">
          <div className="min-w-0">
            {title && (
              <h3 className="text-sm font-semibold text-hero-grey-black truncate">
                {title}
              </h3>
            )}
            {subtitle && (
              <p className="text-xs text-hero-grey-regular mt-0.5">
                {subtitle}
              </p>
            )}
          </div>
          {headerAction && <div className="ml-3 shrink-0">{headerAction}</div>}
        </div>
      )}
      <div className="p-5">{children}</div>
    </div>
  );
}
