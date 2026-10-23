/**
 * The Game Look Lab mark: a sphere split down its terminator, one half in
 * wireframe outline and the other shaded in silver — strictly monochrome.
 */
export function LogoMark({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" focusable="false" className="logo-mark">
      <rect x="0.5" y="0.5" width="31" height="31" rx="6" fill="var(--elevated)" stroke="var(--silver)" strokeOpacity="0.22" />
      <path d="M16 7.5a8.5 8.5 0 0 1 0 17z" fill="var(--silver)" fillOpacity="0.88" />
      <circle cx="16" cy="16" r="8.5" fill="none" stroke="var(--text)" strokeWidth="1.5" />
    </svg>
  );
}

/** "Game Look Lab" in compact monochrome typography. */
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
