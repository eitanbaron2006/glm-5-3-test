import { Graph } from './graph';

export type GraphSnapshot = ReturnType<Graph['serialize']>;

/** Snapshot-based undo/redo stack — GAEA-style graph history.
 *  Snapshots are stored as JSON strings so comparison and restoration are cheap
 *  and immune to later mutation of the live graph. */
export class History {
  private undoStack: string[] = [];
  private redoStack: string[] = [];
  private maxDepth = 60;

  /** Start fresh history with one snapshot (used on preset load / new / open). */
  reset(snapshot: GraphSnapshot) {
    this.undoStack = [JSON.stringify(snapshot)];
    this.redoStack = [];
  }

  /** Record a new state; identical consecutive states are collapsed. */
  push(snapshot: GraphSnapshot) {
    const s = JSON.stringify(snapshot);
    if (this.undoStack.length && this.undoStack[this.undoStack.length - 1] === s) return;
    this.undoStack.push(s);
    if (this.undoStack.length > this.maxDepth) this.undoStack.shift();
    this.redoStack = [];
  }

  get canUndo(): boolean { return this.undoStack.length > 1; }
  get canRedo(): boolean { return this.redoStack.length > 0; }

  /** Step back; returns the snapshot to restore, or null when at the beginning. */
  undo(): GraphSnapshot | null {
    if (this.undoStack.length <= 1) return null;
    this.redoStack.push(this.undoStack.pop()!);
    return JSON.parse(this.undoStack[this.undoStack.length - 1]);
  }

  /** Step forward; returns the snapshot to restore, or null when at the end. */
  redo(): GraphSnapshot | null {
    const s = this.redoStack.pop();
    if (!s) return null;
    this.undoStack.push(s);
    return JSON.parse(s);
  }
}
