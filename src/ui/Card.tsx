import type { HTMLAttributes, ReactNode } from "react";

/**
 * A soft raised surface. Interactive cards are buttons so they are reachable
 * and operable from the keyboard; static cards are plain containers.
 */

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  tone?: "raised" | "sunken";
  children: ReactNode;
}

export function Card({ tone = "raised", className, children, ...rest }: CardProps) {
  return (
    <div className={["card", `card--${tone}`, className].filter(Boolean).join(" ")} {...rest}>
      {children}
    </div>
  );
}
