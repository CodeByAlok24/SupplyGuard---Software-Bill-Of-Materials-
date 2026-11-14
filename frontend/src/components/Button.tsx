import type { ReactNode } from "react";

type Variant = "primary" | "ghost";
type Size = "md" | "sm" | "cta";

const variantClasses: Record<Variant, string> = {
  primary:
    "border-[#6c1be4] bg-gradient-to-b from-[#8b3df6] to-[#7222ea] text-white [box-shadow:0_10px_22px_-10px_rgba(110,32,230,0.75),inset_0_1px_0_rgba(255,255,255,0.18)] hover:-translate-y-px hover:[box-shadow:0_14px_26px_-10px_rgba(110,32,230,0.85),inset_0_1px_0_rgba(255,255,255,0.18)]",
  ghost:
    "border-[#d6c1fb] bg-surface text-ink [box-shadow:0_1px_2px_rgba(25,21,36,0.03)] hover:border-brand hover:bg-brand-tint",
};

const sizeClasses: Record<Size, string> = {
  md: "rounded-[9px] px-6 py-3.5 text-[14.5px]",
  sm: "rounded-[7px] px-[17px] py-2.5 text-[13.5px]",
  cta: "rounded-[9px] px-[22px] py-[13px] text-sm",
};

type ButtonProps = {
  href: string;
  children: ReactNode;
  variant?: Variant;
  size?: Size;
  className?: string;
};

export function Button({
  href,
  children,
  variant = "primary",
  size = "md",
  className = "",
}: ButtonProps) {
  return (
    <a
      href={href}
      className={`inline-flex items-center justify-center gap-[9px] whitespace-nowrap border-[1.5px] font-bold leading-none transition-[transform,box-shadow,background-color,border-color] duration-200 ${variantClasses[variant]} ${sizeClasses[size]} ${className}`}
    >
      {children}
    </a>
  );
}
