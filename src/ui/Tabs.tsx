import { useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";

/**
 * A tab list following the WAI-ARIA tabs pattern: one tab in the tab order,
 * arrow keys move between tabs and activate them.
 *
 * The caller renders the active panel itself and spreads `tabPanelProps`
 * onto it so the two are linked for assistive technology.
 */

export interface TabItem<T extends string> {
  id: T;
  label: string;
  count?: number;
}

interface TabsProps<T extends string> {
  idBase: string;
  label: string;
  items: readonly TabItem<T>[];
  value: T;
  onChange: (value: T) => void;
}

export function tabPanelProps(idBase: string, id: string) {
  return {
    role: "tabpanel" as const,
    id: `${idBase}-panel-${id}`,
    "aria-labelledby": `${idBase}-tab-${id}`,
    tabIndex: 0,
  };
}

export function Tabs<T extends string>({ idBase, label, items, value, onChange }: TabsProps<T>) {
  const listRef = useRef<HTMLDivElement | null>(null);
  const [indicator, setIndicator] = useState<{ left: number; width: number } | null>(null);

  // The indicator slides between tabs, so it is positioned from the selected
  // tab's measured box rather than drawn by each tab.
  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return;

    const measure = () => {
      const tab = list.querySelector<HTMLElement>('[aria-selected="true"]');
      if (tab) setIndicator({ left: tab.offsetLeft + 10, width: Math.max(tab.offsetWidth - 20, 12) });
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(list);
    return () => observer.disconnect();
  }, [value, items]);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const index = items.findIndex((item) => item.id === value);
    let next = index;

    if (event.key === "ArrowRight") next = (index + 1) % items.length;
    else if (event.key === "ArrowLeft") next = (index - 1 + items.length) % items.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = items.length - 1;
    else return;

    event.preventDefault();
    const item = items[next];

    if (item) {
      onChange(item.id);
      listRef.current?.querySelector<HTMLButtonElement>(`#${CSS.escape(`${idBase}-tab-${item.id}`)}`)?.focus();
    }
  };

  return (
    <div ref={listRef} className="tabs" role="tablist" aria-label={label} onKeyDown={onKeyDown}>
      {items.map((item) => {
        const selected = item.id === value;
        return (
          <button
            key={item.id}
            id={`${idBase}-tab-${item.id}`}
            type="button"
            role="tab"
            className={selected ? "tabs__tab is-selected" : "tabs__tab"}
            aria-selected={selected}
            aria-controls={`${idBase}-panel-${item.id}`}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(item.id)}
          >
            {item.label}
            {item.count !== undefined && <span className="tabs__count">{item.count}</span>}
          </button>
        );
      })}
      {indicator && (
        <span
          className="tabs__indicator"
          aria-hidden="true"
          style={{ width: indicator.width, transform: `translateX(${indicator.left}px)` }}
        />
      )}
    </div>
  );
}
