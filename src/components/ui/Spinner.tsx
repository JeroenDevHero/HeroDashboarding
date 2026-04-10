interface SpinnerProps {
  size?: "sm" | "md" | "lg";
}

const sizeMap: Record<string, string> = {
  sm: "w-4 h-4 border-[2px]",
  md: "w-6 h-6 border-[2.5px]",
  lg: "w-8 h-8 border-[3px]",
};

export default function Spinner({ size = "md" }: SpinnerProps) {
  return (
    <div
      className={`${sizeMap[size]} rounded-full border-hero-blue-soft border-t-hero-blue animate-spin`}
      role="status"
      aria-label="Loading"
    />
  );
}
