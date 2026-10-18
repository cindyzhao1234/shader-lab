/**
 * The Game Look Lab mark: a sphere split down its terminator, one half
 * smoothly lit and the other in a single flat band — the same object, two
 * Looks.
 */
export function LogoMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" focusable="false" className="logo-mark">
      <defs>
        <radialGradient id="logo-lit" cx="0.36" cy="0.32" r="0.75">
          <stop offset="0" stopColor="#fff8ef" />
          <stop offset="0.6" stopColor="#f3dcc9" />
          <stop offset="1" stopColor="#d9b49a" />
        </radialGradient>
      </defs>
      <rect x="0" y="0" width="32" height="32" rx="9" fill="var(--accent)" />
      <circle cx="16" cy="16" r="9" fill="url(#logo-lit)" />
      <path d="M16 7a9 9 0 0 1 0 18z" fill="#e7b48f" />
      <path d="M16 7a9 9 0 0 1 0 18" fill="none" stroke="#3a2a20" strokeWidth="1.3" />
      <path d="M16 7v18" stroke="#3a2a20" strokeWidth="0.9" strokeDasharray="1.4 1.6" />
    </svg>
  );
}
