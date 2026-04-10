"use client";

interface SelectOption {
  value: string;
  label: string;
}

interface SelectProps {
  label?: string;
  options: SelectOption[];
  value: string;
  onChange: (value: string) => void;
  error?: string;
  className?: string;
  disabled?: boolean;
  id?: string;
}

export default function Select({
  label,
  options,
  value,
  onChange,
  error,
  className = "",
  disabled,
  id,
}: SelectProps) {
  const selectId =
    id || (label ? label.toLowerCase().replace(/\s+/g, "-") : undefined);

  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label
          htmlFor={selectId}
          className="text-xs font-medium text-hero-grey-black"
        >
          {label}
        </label>
      )}
      <div className="relative">
        <select
          id={selectId}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          className={`
            appearance-none w-full h-9 px-3 pr-8 text-sm text-hero-grey-black
            bg-white border rounded-[var(--radius-input)]
            focus:outline-none focus:ring-2 focus:ring-hero-blue-medium/30 focus:border-hero-blue-medium
            disabled:opacity-50 disabled:cursor-not-allowed
            transition-colors cursor-pointer
            ${error ? "border-red-400" : "border-hero-grey-light"}
            ${className}
          `}
        >
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <span className="material-symbols-rounded text-[18px] text-hero-grey-regular absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none">
          expand_more
        </span>
      </div>
      {error && <p className="text-[11px] text-red-500">{error}</p>}
    </div>
  );
}
