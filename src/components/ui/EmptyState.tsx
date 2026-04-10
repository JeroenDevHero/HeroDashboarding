import type { ReactNode } from "react";

interface EmptyStateProps {
  icon: string;
  title: string;
  description: string;
  action?: ReactNode;
}

export default function EmptyState({
  icon,
  title,
  description,
  action,
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
      <div className="w-12 h-12 rounded-full bg-hero-blue-hairline flex items-center justify-center mb-4">
        <span className="material-symbols-rounded text-[24px] text-hero-blue-medium">
          {icon}
        </span>
      </div>
      <h3 className="text-sm font-semibold text-hero-grey-black mb-1">
        {title}
      </h3>
      <p className="text-xs text-hero-grey-regular max-w-xs mb-4">
        {description}
      </p>
      {action && <div>{action}</div>}
    </div>
  );
}
