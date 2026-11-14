import type { ReactNode } from "react";

type ContainerProps = {
  children: ReactNode;
  className?: string;
};

export function Container({ children, className = "" }: ContainerProps) {
  return (
    <div
      className={`mx-auto w-[min(1200px,calc(100%_-_56px))] max-[700px]:w-[calc(100%_-_36px)] ${className}`}
    >
      {children}
    </div>
  );
}
