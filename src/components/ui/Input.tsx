"use client";

import { forwardRef, type InputHTMLAttributes } from "react";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, className = "", id, ...rest }, ref) => {
    const inputId = id || (label ? label.toLowerCase().replace(/\s+/g, "-") : undefined);

    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label
            htmlFor={inputId}
            className="text-xs font-medium text-hero-grey-black"
          >
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          className={`
            h-9 px-3 text-sm text-hero-grey-black
            bg-white border rounded-[var(--radius-input)]
            placeholder:text-hero-grey-regular
            focus:outline-none focus:ring-2 focus:ring-hero-blue-medium/30 focus:border-hero-blue-medium
            disabled:opacity-50 disabled:cursor-not-allowed
            transition-colors
            ${error ? "border-red-400" : "border-hero-grey-light"}
            ${className}
          `}
          {...rest}
        />
        {error && <p className="text-[11px] text-red-500">{error}</p>}
      </div>
    );
  },
);

Input.displayName = "Input";

export default Input;
