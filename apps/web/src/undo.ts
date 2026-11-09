// Undo instead of "are you sure?": the screen shows the result at once, a toast offers "Desfazer", and the request is
// sent only when the window closes. Leaving the page while a change waits asks the browser to confirm, so a closed tab
// never silently drops (or silently sends) a decision.
import { toast } from "sonner";

const WINDOW_MS = 6000;
let waiting = 0;
const guard = (e: BeforeUnloadEvent) => {
  e.preventDefault();
};

/** Keeps the browser from leaving silently while a decision waits; call the returned function to let go. */
export function holdUnload(): () => void {
  if (waiting++ === 0) window.addEventListener("beforeunload", guard);
  let held = true;
  return () => {
    if (!held) return;
    held = false;
    if (--waiting === 0) window.removeEventListener("beforeunload", guard);
  };
}

export function withUndo({
  message,
  description,
  commit,
  revert,
}: {
  message: string;
  description?: string;
  /** Sends the change; resolves false when the server refused it (the caller shows why). */
  commit: () => Promise<boolean>;
  /** Puts the screen back as it was. */
  revert: () => void;
}) {
  let settled = false;
  const release = holdUnload();
  const timer = window.setTimeout(async () => {
    if (settled) return;
    settled = true;
    release();
    if (!(await commit())) revert();
  }, WINDOW_MS);
  toast(message, {
    description,
    duration: WINDOW_MS,
    action: {
      label: "Desfazer",
      onClick: () => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        release();
        revert();
      },
    },
  });
}
