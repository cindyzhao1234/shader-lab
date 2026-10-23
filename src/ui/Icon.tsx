import type { ReactNode, SVGProps } from "react";

/**
 * A small, consistent icon set drawn on a 24px grid with a 1.6px rounded
 * stroke. Inline SVG rather than an icon library: the app needs a couple of
 * dozen glyphs, and these inherit text colour so they theme for free.
 */

const PATHS = {
  cube: (
    <>
      <path d="M12 3.2 19.8 7.6v8.8L12 20.8l-7.8-4.4V7.6z" />
      <path d="M4.2 7.6 12 12l7.8-4.4M12 12v8.8" />
    </>
  ),
  group: <path d="M3.5 7.5A2 2 0 0 1 5.5 5.5h3.8l2 2h7.2a2 2 0 0 1 2 2v7.5a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z" />,
  sun: (
    <>
      <circle cx="12" cy="12" r="3.8" />
      <path d="M12 2.8v2.1M12 19.1v2.1M2.8 12h2.1M19.1 12h2.1M5.5 5.5 7 7M17 17l1.5 1.5M5.5 18.5 7 17M17 7l1.5-1.5" />
    </>
  ),
  bulb: (
    <>
      <path d="M9.2 17.5h5.6M10.2 20.5h3.6" />
      <path d="M12 3.5a5.8 5.8 0 0 0-3.4 10.5c.6.5 1 1.2 1 2v.5h4.8V16c0-.8.4-1.5 1-2A5.8 5.8 0 0 0 12 3.5z" />
    </>
  ),
  spot: (
    <>
      <path d="M9.3 3.5h5.4l-.9 5h-3.6z" />
      <path d="M10.2 8.5 5.5 19.5h13l-4.7-11" strokeDasharray="2 2.2" />
    </>
  ),
  eye: (
    <>
      <path d="M2.8 12S6.2 5.8 12 5.8 21.2 12 21.2 12 17.8 18.2 12 18.2 2.8 12 2.8 12z" />
      <circle cx="12" cy="12" r="2.7" />
    </>
  ),
  eyeOff: (
    <>
      <path d="M9.9 6.1A9 9 0 0 1 12 5.8c5.8 0 9.2 6.2 9.2 6.2a15 15 0 0 1-2.4 3.1M6.4 7.6A15 15 0 0 0 2.8 12s3.4 6.2 9.2 6.2a8.6 8.6 0 0 0 4.6-1.3" />
      <path d="M10.1 10.1a2.7 2.7 0 0 0 3.8 3.8M4 4l16 16" />
    </>
  ),
  undo: (
    <>
      <path d="M8.5 6.5 4.5 10.5l4 4" />
      <path d="M4.5 10.5h9.8a5 5 0 0 1 0 10H11" />
    </>
  ),
  redo: (
    <>
      <path d="m15.5 6.5 4 4-4 4" />
      <path d="M19.5 10.5H9.7a5 5 0 0 0 0 10H13" />
    </>
  ),
  panelLeft: (
    <>
      <rect x="3.5" y="4.5" width="17" height="15" rx="2.5" />
      <path d="M9.5 4.5v15" />
    </>
  ),
  panelRight: (
    <>
      <rect x="3.5" y="4.5" width="17" height="15" rx="2.5" />
      <path d="M14.5 4.5v15" />
    </>
  ),
  focus: (
    <>
      <path d="M4 9V6a2 2 0 0 1 2-2h3M15 4h3a2 2 0 0 1 2 2v3M20 15v3a2 2 0 0 1-2 2h-3M9 20H6a2 2 0 0 1-2-2v-3" />
      <circle cx="12" cy="12" r="2.6" />
    </>
  ),
  reset: (
    <>
      <path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3L4.5 8.9" />
      <path d="M4.5 4.5v4.4h4.4" />
    </>
  ),
  camera: (
    <>
      <path d="M4 8.5a1.5 1.5 0 0 1 1.5-1.5h2.2l1.5-2h5.6l1.5 2h2.2A1.5 1.5 0 0 1 20 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 17.5z" />
      <circle cx="12" cy="12.8" r="3.2" />
    </>
  ),
  gauge: (
    <>
      <path d="M4.2 17.5a8.5 8.5 0 1 1 15.6 0" />
      <path d="m12 14 3.6-4.2" />
      <circle cx="12" cy="14" r="1.2" />
    </>
  ),
  sparkles: (
    <>
      <path d="M11 3.5c.6 4.4 1.9 5.7 6.3 6.3-4.4.6-5.7 1.9-6.3 6.3-.6-4.4-1.9-5.7-6.3-6.3 4.4-.6 5.7-1.9 6.3-6.3z" />
      <path d="M18 14.5c.3 1.9 1 2.6 2.8 2.8-1.9.3-2.5 1-2.8 2.8-.3-1.9-1-2.5-2.8-2.8 1.9-.3 2.5-1 2.8-2.8z" />
    </>
  ),
  import: (
    <>
      <path d="M12 3.8v10.7M7.8 10.3 12 14.5l4.2-4.2" />
      <path d="M4.5 15v3a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-3" />
    </>
  ),
  save: (
    <>
      <path d="M5.5 4h10.2L20 8.3v10.2a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18.5v-13A1.5 1.5 0 0 1 5.5 4z" />
      <path d="M8 4v4.5h7V4M8 20v-5.5h8V20" />
    </>
  ),
  export: (
    <>
      <path d="M12 14.5V3.8M7.8 8 12 3.8 16.2 8" />
      <path d="M4.5 15v3a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-3" />
    </>
  ),
  help: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M9.6 9.6a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1.1.9-1.1 1.6v.4" />
      <path d="M12 16.9h.01" strokeWidth="2.2" />
    </>
  ),
  keyboard: (
    <>
      <rect x="3" y="6" width="18" height="12" rx="2.2" />
      <path d="M7 10h.01M10.3 10h.01M13.7 10h.01M17 10h.01M7.5 14h9" strokeWidth="1.9" />
    </>
  ),
  close: <path d="M6.5 6.5l11 11M17.5 6.5l-11 11" />,
  check: <path d="m5.5 12.5 4 4 9-9" />,
  chevronDown: <path d="m7 10 5 5 5-5" />,
  chevronRight: <path d="m10 7 5 5-5 5" />,
  pencil: <path d="M14.8 5.2 18.8 9.2M4.5 19.5l1-4.2L15.6 5.2a2 2 0 0 1 2.8 0l.4.4a2 2 0 0 1 0 2.8L8.7 18.5z" />,
  clock: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </>
  ),
  orbit: (
    <>
      <circle cx="12" cy="12" r="2.6" />
      <path d="M20.5 12c0 2.3-3.8 4.2-8.5 4.2S3.5 14.3 3.5 12 7.3 7.8 12 7.8c2 0 3.9.4 5.3 1" />
      <path d="m16 6.8 1.5 2-2.3.8" />
    </>
  ),
  layers: (
    <>
      <path d="m12 4 8.5 4.5L12 13 3.5 8.5z" />
      <path d="m3.5 12.5 8.5 4.5 8.5-4.5M3.5 16.2l8.5 4.3 8.5-4.3" />
    </>
  ),
  lock: (
    <>
      <rect x="5.5" y="10.5" width="13" height="9.5" rx="2" />
      <path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 11v5.2" />
      <path d="M12 7.8h.01" strokeWidth="2.2" />
    </>
  ),
  trash: (
    <>
      <path d="M4.5 7h15M9.5 7V5.2c0-.7.5-1.2 1.2-1.2h2.6c.7 0 1.2.5 1.2 1.2V7" />
      <path d="M6.8 7l.8 11.5c.1.8.7 1.5 1.5 1.5h5.8c.8 0 1.4-.7 1.5-1.5L17.2 7" />
    </>
  ),
} satisfies Record<string, ReactNode>;

export type IconName = keyof typeof PATHS;

interface IconProps extends Omit<SVGProps<SVGSVGElement>, "name"> {
  name: IconName;
  size?: number;
}

export function Icon({ name, size = 18, className, ...rest }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className ? `icon ${className}` : "icon"}
      {...rest}
    >
      {PATHS[name]}
    </svg>
  );
}
