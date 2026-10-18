import { describe, expect, it, vi } from "vitest";
import { History, valueCommand, type Command } from "./history";

/** A controllable clock so coalescing can be tested without real timers. */
function clock(start = 0) {
  let value = start;
  return {
    now: () => value,
    advance: (ms: number) => {
      value += ms;
    },
  };
}

function setter(initial: number) {
  const box = { value: initial };
  return {
    box,
    command: (before: number, after: number, mergeKey?: string): Command =>
      valueCommand({
        label: "Roughness",
        mergeKey,
        before,
        after,
        write: (next) => {
          box.value = next;
        },
      }),
  };
}

describe("History", () => {
  it("applies on push and restores on undo", () => {
    const { box, command } = setter(0);
    const history = new History();

    history.push(command(0, 5));
    expect(box.value).toBe(5);

    expect(history.undo()).toBe(true);
    expect(box.value).toBe(0);

    expect(history.redo()).toBe(true);
    expect(box.value).toBe(5);
  });

  it("reports what undo and redo would do", () => {
    const { command } = setter(0);
    const history = new History();

    expect(history.canUndo).toBe(false);
    expect(history.undoLabel).toBeUndefined();

    history.push(command(0, 1));
    expect(history.canUndo).toBe(true);
    expect(history.undoLabel).toBe("Roughness");

    history.undo();
    expect(history.canRedo).toBe(true);
    expect(history.redoLabel).toBe("Roughness");
  });

  it("returns false rather than throwing at the ends of the stack", () => {
    const history = new History();
    expect(history.undo()).toBe(false);
    expect(history.redo()).toBe(false);
  });

  it("discards the redo branch once a new command is pushed", () => {
    const { box, command } = setter(0);
    const history = new History();

    history.push(command(0, 1));
    history.undo();
    history.push(command(0, 7));

    expect(history.canRedo).toBe(false);
    expect(box.value).toBe(7);
  });

  it("coalesces a drag into one undo entry that returns to the start", () => {
    const time = clock();
    const { box, command } = setter(0);
    const history = new History({ coalesceMs: 400, now: time.now });

    // A slider drag: many writes, all under the same merge key.
    history.push(command(0, 1, "roughness"));
    time.advance(16);
    history.push(command(1, 2, "roughness"));
    time.advance(16);
    history.push(command(2, 9, "roughness"));

    expect(box.value).toBe(9);
    expect(history.entries).toHaveLength(1);

    history.undo();
    expect(box.value).toBe(0);
  });

  it("starts a new entry once the coalesce window lapses", () => {
    const time = clock();
    const { command } = setter(0);
    const history = new History({ coalesceMs: 400, now: time.now });

    history.push(command(0, 1, "roughness"));
    time.advance(900);
    history.push(command(1, 2, "roughness"));

    expect(history.entries).toHaveLength(2);
  });

  it("does not coalesce commands with different merge keys", () => {
    const time = clock();
    const { command } = setter(0);
    const history = new History({ coalesceMs: 400, now: time.now });

    history.push(command(0, 1, "roughness"));
    history.push(command(0, 1, "metalness"));

    expect(history.entries).toHaveLength(2);
  });

  it("never coalesces commands without a merge key", () => {
    const { command } = setter(0);
    const history = new History({ coalesceMs: 400 });

    history.push(command(0, 1));
    history.push(command(1, 2));

    expect(history.entries).toHaveLength(2);
  });

  it("breakCoalescing ends the window immediately, as pointer-up should", () => {
    const time = clock();
    const { command } = setter(0);
    const history = new History({ coalesceMs: 400, now: time.now });

    history.push(command(0, 1, "roughness"));
    history.breakCoalescing();
    history.push(command(1, 2, "roughness"));

    expect(history.entries).toHaveLength(2);
  });

  it("discards the oldest entry beyond the limit", () => {
    const { command } = setter(0);
    const history = new History({ limit: 3 });

    for (let index = 0; index < 5; index += 1) {
      history.push(command(index, index + 1));
    }

    expect(history.entries).toHaveLength(3);
  });

  it("notifies subscribers and stops after unsubscribe", () => {
    const { command } = setter(0);
    const history = new History();
    const listener = vi.fn();
    const unsubscribe = history.subscribe(listener);

    history.push(command(0, 1));
    history.undo();
    expect(listener).toHaveBeenCalledTimes(2);

    unsubscribe();
    history.redo();
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("clears both stacks", () => {
    const { command } = setter(0);
    const history = new History();

    history.push(command(0, 1));
    history.undo();
    history.clear();

    expect(history.canUndo).toBe(false);
    expect(history.canRedo).toBe(false);
  });
});
