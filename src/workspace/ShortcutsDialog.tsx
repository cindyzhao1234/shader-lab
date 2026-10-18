import { Dialog } from "../ui/Dialog";
import { IS_MAC } from "./context";
import { SHORTCUTS, displayKeys } from "./shortcuts";

const POINTER_CONTROLS: Array<{ action: string; how: string }> = [
  { action: "Orbit", how: "Drag, or one-finger drag" },
  { action: "Zoom", how: "Scroll, or pinch" },
  { action: "Pan", how: "Right-drag, or two-finger drag" },
  { action: "Fly to an object", how: "Double-click it in the scene panel" },
];

export function ShortcutsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onClose={onClose} title="Keyboard shortcuts" description="Shortcuts pause while you're typing.">
      <div className="shortcuts">
        <h3 className="subhead">Keyboard</h3>
        <dl className="shortcut-list">
          {SHORTCUTS.map((shortcut) => (
            <div key={shortcut.id} className="shortcut-list__row">
              <dt>{shortcut.description}</dt>
              <dd>
                {displayKeys(shortcut.keys, IS_MAC).map((key) => (
                  <kbd key={key}>{key}</kbd>
                ))}
              </dd>
            </div>
          ))}
        </dl>

        <h3 className="subhead">Mouse and touch</h3>
        <dl className="shortcut-list">
          {POINTER_CONTROLS.map((control) => (
            <div key={control.action} className="shortcut-list__row">
              <dt>{control.action}</dt>
              <dd className="shortcut-list__how">{control.how}</dd>
            </div>
          ))}
        </dl>
      </div>
    </Dialog>
  );
}
