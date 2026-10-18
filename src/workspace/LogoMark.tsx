import { useId } from "react";

/**
 * The Game Look Lab mark: a sphere split down its terminator on a butter
 * tile, one half smoothly lit and the other a single flat strawberry band —
 * the same object, two Looks. A small star marks the "lab".
 */
export function LogoMark({ size = 30 }: { size?: number }) {
  const gradientId = useId();

  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" focusable="false" className="logo-mark">
      <defs>
        <radialGradient id={gradientId} cx="0.34" cy="0.3" r="0.8">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="0.55" stopColor="#dff0fb" />
          <stop offset="1" stopColor="#a9d9f5" />
        </radialGradient>
      </defs>
      <rect x="1.75" y="1.75" width="28.5" height="28.5" rx="8" fill="#f8d978" stroke="#171d35" strokeWidth="1.5" />
      <circle cx="15" cy="17" r="8.6" fill={`url(#${gradientId})`} />
      <path d="M15 8.4a8.6 8.6 0 0 1 0 17.2z" fill="#f2a7c3" />
      <circle cx="15" cy="17" r="8.6" fill="none" stroke="#171d35" strokeWidth="1.5" />
      <path d="M15 8.4v17.2" stroke="#171d35" strokeWidth="1.1" strokeDasharray="1.5 1.7" />
      <path
        d="M25 4.6c.35 2 1.1 2.75 3.1 3.1-2 .35-2.75 1.1-3.1 3.1-.35-2-1.1-2.75-3.1-3.1 2-.35 2.75-1.1 3.1-3.1z"
        fill="#171d35"
      />
    </svg>
  );
}

/**
 * The wordmark as a die-cut sticker: "Game Look" on strawberry with a butter
 * "Lab" tag stuck over its corner.
 */
export function Wordmark({ size = "sm" }: { size?: "sm" | "lg" }) {
  return (
    <span className={`wordmark wordmark--${size}`}>
      <span className="visually-hidden">Game Look Lab</span>
      <span className="wordmark__art" aria-hidden="true">
        <span className="wordmark__main">Game Look</span>
        <span className="wordmark__tag">Lab</span>
      </span>
    </span>
  );
}
