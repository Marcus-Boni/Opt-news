// React's side of the stage: mounts it in a host element and hands the page a handle. Default export so the page
// can load it (and three.js with it) lazily; if WebGL is missing or the context is lost, the page keeps its static
// ground and nothing else changes.
import { type RefObject, useEffect, useRef } from "react";
import { SYMBOL } from "@/components/brand/optsolv";
import { createStage, type Position, type StageFrame, type StageHandle } from "./stage.ts";

export default function JourneyStage({
  position,
  still,
  handle,
  onFrame,
  onFail,
}: {
  position: RefObject<Position>;
  still: boolean;
  /** Filled while the stage is alive. */
  handle: RefObject<StageHandle | null>;
  onFrame: (frame: StageFrame) => void;
  onFail: () => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let stage: StageHandle;
    try {
      // The chain's step is the symbol's inner chevron (its second path).
      stage = createStage(
        el,
        { symbol: SYMBOL, chevron: SYMBOL[1] ?? "" },
        { position: position.current, still, onFrame, onLost: onFail },
      );
    } catch {
      onFail();
      return;
    }
    handle.current = stage;
    return () => {
      handle.current = null;
      stage.dispose();
    };
  }, [position, still, handle, onFrame, onFail]);
  return <div ref={host} className="absolute inset-0" />;
}
