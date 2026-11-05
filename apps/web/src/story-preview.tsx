// A story link that previews itself: resting the pointer (or keyboard focus) on it shows the headline's source, score
// and summary without leaving the page. The detail is fetched only when the card opens, and cached like any read.
// Touch has no hover, so on a phone the link simply opens the story.
import type { ReactNode } from "react";
import { useState } from "react";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { useApi } from "./api.ts";
import { ScoreMark } from "./story-card.tsx";
import { AiTag, Dot, Skeleton } from "./ui.tsx";
import { relativeTime } from "./format.ts";

function Preview({ id }: { id: string }) {
  const story = useApi("getStory", { params: { id } });
  const s = story.data;
  if (story.error) return <p className="text-xs text-muted-foreground">Prévia indisponível. Abra a notícia.</p>;
  if (!s) return <Skeleton lines={4} />;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-start justify-between gap-3">
        <p className="flex min-w-0 flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
          <span className="font-medium text-foreground/85">{s.source.name}</span>
          <Dot />
          <span>{relativeTime(s.originalPublishedAt ?? s.firstSeenAt)}</span>
        </p>
        <ScoreMark score={s.editorialScore} />
      </div>
      <p className="text-[0.9375rem] leading-snug font-semibold tracking-[-0.015em] text-balance">{s.headline}</p>
      {s.summary && (
        <>
          {s.aiGenerated && <AiTag>Resumo</AiTag>}
          <p className="line-clamp-3 text-xs leading-relaxed text-muted-foreground">{s.summary}</p>
        </>
      )}
    </div>
  );
}

export function StoryPreview({ id, children }: { id: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <HoverCard openDelay={350} closeDelay={120} open={open} onOpenChange={setOpen}>
      <HoverCardTrigger asChild>{children}</HoverCardTrigger>
      <HoverCardContent side="top" align="start" className="w-80 rounded-xl p-4 shadow-elev-2">
        {open && <Preview id={id} />}
      </HoverCardContent>
    </HoverCard>
  );
}
