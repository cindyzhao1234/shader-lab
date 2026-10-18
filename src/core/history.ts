/**
 * Undo/redo for every user edit.
 *
 * This exists from the first stage rather than being retrofitted, because the
 * cost of routing edits through a command store later — once panels, importers
 * and the Look editor all mutate state directly — is far higher than the cost
 * of doing it now.
 */

export interface Command {
  readonly label: string;
  /**
   * Commands sharing a merge key that arrive inside the coalesce window
   * collapse into a single undo entry. Dragging a slider should be one undo,
   * not two hundred.
   */
  readonly mergeKey?: string;
  apply(): void;
  revert(): void;
  /** Fold a newer command of the same kind into this one. */
  absorb?(next: Command): void;
}

interface ValueCommand<T> extends Command {
  readonly kind: "value";
  after: T;
}

function isValueCommand(command: Command): command is ValueCommand<unknown> {
  return (command as Partial<ValueCommand<unknown>>).kind === "value";
}

/**
 * The common case: a single property moving from one value to another. Repeated
 * writes under the same merge key keep the original `before`, so undoing a drag
 * returns to where it started rather than to the previous frame.
 */
export function valueCommand<T>(options: {
  label: string;
  mergeKey?: string;
  before: T;
  after: T;
  write: (value: T) => void;
}): Command {
  const command: ValueCommand<T> = {
    kind: "value",
    label: options.label,
    mergeKey: options.mergeKey,
    after: options.after,
    apply: () => options.write(command.after),
    revert: () => options.write(options.before),
    absorb: (next) => {
      if (isValueCommand(next)) {
        command.after = next.after as T;
        command.apply();
      }
    },
  };

  return command;
}

export interface HistoryOptions {
  /** Entries kept before the oldest is discarded. */
  limit?: number;
  /** Window in which same-key commands coalesce. */
  coalesceMs?: number;
  /** Injectable for tests. */
  now?: () => number;
}

export class History {
  private readonly undoStack: Command[] = [];
  private readonly redoStack: Command[] = [];
  private readonly listeners = new Set<() => void>();
  private lastPushedAt = Number.NEGATIVE_INFINITY;

  private readonly limit: number;
  private readonly coalesceMs: number;
  private readonly now: () => number;

  constructor(options: HistoryOptions = {}) {
    this.limit = options.limit ?? 200;
    this.coalesceMs = options.coalesceMs ?? 400;
    this.now = options.now ?? (() => Date.now());
  }

  /** Applies the command and records it. Any redo branch is discarded. */
  push(command: Command): void {
    const at = this.now();
    const top = this.undoStack.at(-1);
    const mergeable =
      top !== undefined &&
      top.mergeKey !== undefined &&
      top.mergeKey === command.mergeKey &&
      top.absorb !== undefined &&
      at - this.lastPushedAt <= this.coalesceMs;

    if (mergeable) {
      top.absorb?.(command);
      this.lastPushedAt = at;
      this.redoStack.length = 0;
      this.emit();
      return;
    }

    command.apply();
    this.undoStack.push(command);
    this.redoStack.length = 0;
    this.lastPushedAt = at;

    if (this.undoStack.length > this.limit) {
      this.undoStack.shift();
    }

    this.emit();
  }

  undo(): boolean {
    const command = this.undoStack.pop();

    if (!command) {
      return false;
    }

    command.revert();
    this.redoStack.push(command);
    this.breakCoalescing();
    this.emit();
    return true;
  }

  redo(): boolean {
    const command = this.redoStack.pop();

    if (!command) {
      return false;
    }

    command.apply();
    this.undoStack.push(command);
    this.breakCoalescing();
    this.emit();
    return true;
  }

  /**
   * Ends the current coalescing window. Call on pointer-up so the next drag
   * starts a fresh undo entry even if it begins immediately.
   */
  breakCoalescing(): void {
    this.lastPushedAt = Number.NEGATIVE_INFINITY;
  }

  clear(): void {
    this.undoStack.length = 0;
    this.redoStack.length = 0;
    this.breakCoalescing();
    this.emit();
  }

  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  get undoLabel(): string | undefined {
    return this.undoStack.at(-1)?.label;
  }

  get redoLabel(): string | undefined {
    return this.redoStack.at(-1)?.label;
  }

  /** Newest last. Drives the history panel in a later stage. */
  get entries(): readonly Command[] {
    return this.undoStack;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }
}
