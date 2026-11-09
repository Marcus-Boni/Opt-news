// An action that waits before it happens: pressing it starts a short window, the time left drains around the button's
// own edge, and pressing again takes it back. The decision is sent only when the window closes (the caller's onCommit).
// For actions that reach many people at once (publishing to the whole company), where a dialog would slow the daily
// queue and a toast would sit far from the row. Under reduced motion the ring is static and the seconds still count.
import { Undo2 } from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { holdUnload } from "@/undo";

export const UNDO_SECONDS = 6;

export function UndoButton({
  pending,
  onStart,
  onUndo,
  onCommit,
  children,
  label,
  disabled,
}: {
  pending: boolean;
  onStart: () => void;
  onUndo: () => void;
  /** Runs once when the window closes without an undo. */
  onCommit: () => void;
  children: ReactNode;
  /** Accessible name suffix for the undo state ("Desfazer publicação de …"). */
  label: string;
  disabled?: boolean;
}) {
  const [left, setLeft] = useState(UNDO_SECONDS);
  const commit = useRef(onCommit);
  commit.current = onCommit;

  useEffect(() => {
    if (!pending) return;
    setLeft(UNDO_SECONDS);
    const release = holdUnload();
    const started = Date.now();
    const tick = window.setInterval(() => {
      const remaining = UNDO_SECONDS - Math.floor((Date.now() - started) / 1000);
      setLeft(Math.max(remaining, 0));
    }, 250);
    const done = window.setTimeout(() => {
      release();
      commit.current();
    }, UNDO_SECONDS * 1000);
    return () => {
      window.clearInterval(tick);
      window.clearTimeout(done);
      release();
    };
  }, [pending]);

  if (!pending)
    return (
      <Button size="sm" variant="secondary" disabled={disabled} onClick={onStart}>
        {children}
      </Button>
    );
  return (
    <Button
      size="sm"
      variant="outline"
      onClick={onUndo}
      className="tabular relative overflow-visible"
      aria-label={`Desfazer ${label}`}
    >
      {/* The time left, drained around the edge (pathLength makes the dash independent of the button's size). */}
      <svg aria-hidden="true" className="pointer-events-none absolute -inset-px size-[calc(100%+2px)] overflow-visible">
        <rect
          x="0.75"
          y="0.75"
          rx="8"
          pathLength={100}
          className="undo-drain fill-none stroke-brand"
          strokeWidth="1.5"
          style={{ width: "calc(100% - 1.5px)", height: "calc(100% - 1.5px)", animationDuration: `${UNDO_SECONDS}s` }}
        />
      </svg>
      <Undo2 data-icon="inline-start" />
      Desfazer
      <span aria-hidden="true" className="min-w-4 text-muted-foreground">
        {left}s
      </span>
    </Button>
  );
}
