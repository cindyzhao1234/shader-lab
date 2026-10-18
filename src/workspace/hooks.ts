import { useCallback, useEffect, useState } from "react";
import { parseLayout, serialiseLayout, type LayoutPreferences } from "./layout";

const LAYOUT_KEY = "game-look-lab:layout:v1";

export function useWindowWidth(): number {
  const [width, setWidth] = useState(() => window.innerWidth);

  useEffect(() => {
    const onResize = () => setWidth(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  return width;
}

/**
 * Panel sizes and one-off flags, remembered between visits. Storage can be
 * unavailable (private browsing, blocked cookies); the app then simply
 * forgets, rather than failing.
 */
export function useLayoutPreferences(): [LayoutPreferences, (patch: Partial<LayoutPreferences>) => void] {
  const [preferences, setPreferences] = useState<LayoutPreferences>(() => {
    try {
      return parseLayout(window.localStorage.getItem(LAYOUT_KEY));
    } catch {
      return parseLayout(null);
    }
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(LAYOUT_KEY, serialiseLayout(preferences));
    } catch {
      // Not persisting is acceptable; losing the session is not.
    }
  }, [preferences]);

  const update = useCallback((patch: Partial<LayoutPreferences>) => {
    setPreferences((current) => ({ ...current, ...patch }));
  }, []);

  return [preferences, update];
}
