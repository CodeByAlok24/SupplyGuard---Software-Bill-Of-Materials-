import Image from "next/image";

type LogoProps = {
  className?: string;
  markClassName?: string;
  textClassName?: string;
  gapClassName?: string;
  variant?: "full" | "icon";
};

export function Logo({
  className = "",
  markClassName = "h-[30px] w-auto",
  variant = "full",
}: LogoProps) {
  if (variant === "icon") {
    return (
      <Image
        src="/logo-icon.png"
        alt="SupplyGuard"
        width={44}
        height={43}
        className={`${markClassName} logo-dark-flip shrink-0 object-contain ${className}`}
      />
    );
  }

  return (
    <Image
      src="/logo.png"
      alt="SupplyGuard"
      width={160}
      height={42}
      className={`${markClassName} logo-dark-flip shrink-0 object-contain ${className}`}
      priority
    />
  );
}
