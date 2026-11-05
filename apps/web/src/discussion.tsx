// One threaded discussion for any target (story, meetup, insight): visible authorship, author-only editing with
// revision control, curator moderation with a mandatory reason, placeholders that keep the thread readable.
import type { Comment } from "@optnews/contracts";
import { toast } from "sonner";
import { type FormEvent, useEffect, useId, useRef, useState } from "react";
import { Link } from "@/link";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { EASE_OUT, reducedMotion } from "@/motion";
import { api, useAction, usePaged } from "./api.ts";
import { hrefFor } from "./format.ts";
import { useMe } from "./session.tsx";
import { StoryPreview } from "./story-preview.tsx";
import { Empty, ErrorState, Loading, Pill, ProblemNote, Section, Time } from "./ui.tsx";

type TargetType = Comment["targetType"];

interface Ctx {
  targetType: TargetType;
  targetId: string;
  canWrite: boolean;
  /** The comment this reader just published: it arrives with motion. */
  fresh: string | null;
  upsert: (c: Comment) => void;
  reload: () => void;
  announce: (message: string) => void;
}

// Comment actions: quiet until hovered, 36px tall for touch.
const ACTION = "h-9 text-muted-foreground";

function initials(name: string) {
  const words = name.trim().split(/\s+/);
  const first = words[0]?.charAt(0) ?? "";
  const last = words.length > 1 ? (words.at(-1)?.charAt(0) ?? "") : "";
  return (first + last).toUpperCase();
}

/** Initials in a neutral disc; the name is always written next to it, so screen readers skip it. */
function AuthorAvatar({ name, size }: { name: string; size?: "sm" | "default" }) {
  return (
    <Avatar size={size} aria-hidden="true">
      <AvatarFallback className="text-xs font-semibold">{initials(name)}</AvatarFallback>
    </Avatar>
  );
}

function Composer({ ctx, parent, onDone }: { ctx: Ctx; parent?: Comment; onDone?: () => void }) {
  const id = useId();
  const [body, setBody] = useState("");
  const post = useAction();
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const res = await post.run(() =>
      api("createComment", {
        body: { targetType: ctx.targetType, targetId: ctx.targetId, parentId: parent?.id, body },
      }),
    );
    if (!res.ok) return;
    setBody("");
    ctx.upsert(res.value);
    ctx.announce(parent ? "Resposta publicada." : "Comentário publicado.");
    onDone?.();
  };
  const label = parent ? `Responder a ${parent.author.displayName}` : "Seu comentário";
  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <Field>
        {!parent && <FieldLabel htmlFor={id}>{label}</FieldLabel>}
        <Textarea
          id={id}
          aria-label={parent ? label : undefined}
          aria-describedby={`${id}-contagem`}
          className="min-h-24 leading-relaxed"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          maxLength={4000}
          required
          placeholder={
            parent
              ? `Responder a ${parent.author.displayName}…`
              : "Compartilhe contexto, uma dúvida ou como isso se aplica ao seu projeto…"
          }
        />
      </Field>
      <ProblemNote error={post.error} />
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" disabled={post.pending || body.trim().length === 0}>
          {post.pending ? "Publicando…" : parent ? "Responder" : "Publicar comentário"}
        </Button>
        {onDone && (
          <Button type="button" variant="ghost" onClick={onDone}>
            Cancelar
          </Button>
        )}
        <span id={`${id}-contagem`} className="tabular ml-auto text-xs text-muted-foreground">
          {body.length}/4000
        </span>
      </div>
    </form>
  );
}

function EditForm({ ctx, comment, onDone }: { ctx: Ctx; comment: Comment; onDone: () => void }) {
  const [body, setBody] = useState(comment.body ?? "");
  const save = useAction();
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const res = await save.run(() =>
      api("editComment", { params: { id: comment.id }, body: { body, revision: comment.revision } }),
    );
    if (!res.ok) return;
    ctx.upsert(res.value);
    ctx.announce("Comentário atualizado.");
    onDone();
  };
  return (
    <form onSubmit={submit} className="mt-2 flex flex-col gap-3">
      <Textarea
        aria-label="Editar comentário"
        placeholder="Corrija ou complemente o comentário…"
        className="min-h-24 leading-relaxed"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        maxLength={4000}
        required
      />
      <ProblemNote
        error={save.error}
        onReload={() => {
          ctx.reload();
          onDone();
        }}
      />
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" disabled={save.pending || body.trim().length === 0}>
          Salvar edição
        </Button>
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancelar
        </Button>
        <span className="tabular ml-auto text-xs text-muted-foreground">{body.length}/4000</span>
      </div>
    </form>
  );
}

/** Curator moderation: hiding or restoring always asks for a reason, which goes to the audit log. */
function ModerateDialog({ ctx, comment }: { ctx: Ctx; comment: Comment }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const moderate = useAction();
  const hide = comment.status !== "hidden";
  const toggle = (next: boolean) => {
    setOpen(next);
    if (!next) {
      setReason("");
      moderate.clear();
    }
  };
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const res = await moderate.run(() =>
      api("moderateComment", { params: { id: comment.id }, body: { action: hide ? "hide" : "restore", reason } }),
    );
    if (!res.ok) return;
    ctx.upsert(res.value);
    ctx.announce(hide ? "Comentário ocultado." : "Comentário restaurado.");
    toggle(false);
  };
  return (
    <Dialog open={open} onOpenChange={toggle}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className={ACTION}>
          {hide ? "Ocultar" : "Restaurar"}
        </Button>
      </DialogTrigger>
      <DialogContent showCloseButton={false} className="sm:max-w-md">
        <form onSubmit={submit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>{hide ? "Ocultar comentário" : "Restaurar comentário"}</DialogTitle>
            <DialogDescription>Comentário de {comment.author.displayName}.</DialogDescription>
          </DialogHeader>
          <Field>
            <FieldLabel htmlFor={id}>{hide ? "Motivo para ocultar" : "Motivo para restaurar"}</FieldLabel>
            <Textarea
              id={id}
              aria-describedby={`${id}-ajuda`}
              placeholder={
                hide ? "Ex.: dado pessoal exposto, fora do tema…" : "Ex.: revisado com o autor, sem problemas…"
              }
              className="min-h-20"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              minLength={3}
              maxLength={500}
              required
            />
            <FieldDescription id={`${id}-ajuda`}>
              Fica registrado na auditoria. Mínimo de 3 caracteres.
            </FieldDescription>
          </Field>
          <ProblemNote error={moderate.error} />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => toggle(false)}>
              Cancelar
            </Button>
            <Button
              type="submit"
              variant={hide ? "destructive" : "default"}
              disabled={moderate.pending || reason.trim().length < 3}
            >
              {hide ? "Ocultar comentário" : "Restaurar comentário"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function CommentNode({
  ctx,
  comment: c,
  replies,
  depth,
}: {
  ctx: Ctx;
  comment: Comment;
  replies: Map<string, Comment[]>;
  depth: number;
}) {
  const me = useMe();
  const [mode, setMode] = useState<"view" | "reply" | "edit">("view");
  const kids = replies.get(c.id) ?? [];
  const done = () => setMode("view");
  const ref = useRef<HTMLElement>(null);
  const fresh = ctx.fresh === c.id;

  useEffect(() => {
    if (!fresh || !ref.current || reducedMotion()) return;
    const arrival = ref.current.animate(
      [
        { opacity: 0, translate: "0 12px" },
        { opacity: 1, translate: "0 0" },
      ],
      {
        duration: 600,
        easing: EASE_OUT,
      },
    );
    return () => arrival.cancel();
  }, [fresh]);

  return (
    <li className="pt-5">
      <article ref={ref} className="grid grid-cols-[2rem_minmax(0,1fr)] gap-x-3">
        <AuthorAvatar name={c.author.displayName} />
        <div className="min-w-0">
          <header className="flex min-h-8 flex-wrap items-center gap-x-2 gap-y-1 text-sm">
            <span className="font-semibold">{c.author.displayName}</span>
            <span className="text-xs text-muted-foreground">
              <Time iso={c.createdAt} />
              {c.editedAt && " · editado"}
            </span>
            {c.status === "hidden" && c.body !== null && <Pill tone="warning">Oculto para membros</Pill>}
          </header>
          {c.status === "deleted" ? (
            <p className="mt-1 rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground italic">
              Comentário excluído.
            </p>
          ) : c.body === null ? (
            <p className="mt-1 rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground italic">
              Comentário oculto pela moderação{c.moderationReason ? `. Motivo: ${c.moderationReason}` : "."}
            </p>
          ) : mode === "edit" ? (
            <EditForm ctx={ctx} comment={c} onDone={done} />
          ) : (
            <>
              <p
                className={cn(
                  "plain max-w-[68ch] text-[0.9375rem] leading-relaxed",
                  c.status === "hidden" && "text-muted-foreground",
                )}
              >
                {c.body}
              </p>
              {c.status === "hidden" && c.moderationReason && (
                <p className="mt-1 text-xs text-muted-foreground italic">Motivo da moderação: {c.moderationReason}</p>
              )}
            </>
          )}
          {mode === "view" && c.status !== "deleted" && (
            <div className="mt-0.5 -ml-3 flex flex-wrap">
              {ctx.canWrite && c.status === "visible" && (
                <Button variant="ghost" size="sm" className={ACTION} onClick={() => setMode("reply")}>
                  Responder
                </Button>
              )}
              {c.author.id === me.id && c.status === "visible" && (
                <Button variant="ghost" size="sm" className={ACTION} onClick={() => setMode("edit")}>
                  Editar
                </Button>
              )}
              {me.can.moderate && <ModerateDialog ctx={ctx} comment={c} />}
            </div>
          )}
          {mode === "reply" && (
            <div className="mt-2">
              <Composer ctx={ctx} parent={c} onDone={done} />
            </div>
          )}
        </div>
      </article>
      {kids.length > 0 && (
        // Replies hang from the author's avatar: a 1px neutral gutter, two levels deep, then flat.
        <ol className={depth < 2 ? "mt-1 ml-4 border-l pl-4 sm:pl-6" : undefined}>
          {kids.map((k) => (
            <CommentNode key={k.id} ctx={ctx} comment={k} replies={replies} depth={depth + 1} />
          ))}
        </ol>
      )}
    </li>
  );
}

export function Discussion({
  targetType,
  targetId,
  writable = true,
  closedNote = "Esta discussão não aceita novos comentários.",
}: {
  targetType: TargetType;
  targetId: string;
  writable?: boolean;
  closedNote?: string;
}) {
  const me = useMe();
  const thread = usePaged("listComments", { query: { targetType, targetId, limit: 50 } });
  const [fresh, setFresh] = useState<string | null>(null);
  const ctx: Ctx = {
    targetType,
    targetId,
    canWrite: me.can.contribute && writable,
    fresh,
    upsert: (c) => {
      if (!thread.items?.some((x) => x.id === c.id)) setFresh(c.id);
      thread.update((list) =>
        list.some((x) => x.id === c.id) ? list.map((x) => (x.id === c.id ? c : x)) : [...list, c],
      );
    },
    reload: thread.reload,
    announce: (m: string) => toast.success(m),
  };

  const items = thread.items;
  const ids = new Set(items?.map((c) => c.id));
  const replies = new Map<string, Comment[]>();
  const roots: Comment[] = [];
  for (const c of items ?? []) {
    // A reply whose parent is not loaded is shown at the top level rather than dropped.
    if (c.parentId && ids.has(c.parentId)) replies.set(c.parentId, [...(replies.get(c.parentId) ?? []), c]);
    else roots.push(c);
  }
  const count = items?.filter((c) => c.status === "visible").length;

  return (
    <Section
      id="discussao"
      title={count === undefined ? "Discussão" : `Discussão (${count}${thread.hasMore ? "+" : ""})`}
    >
      {ctx.canWrite ? (
        <Composer ctx={ctx} />
      ) : (
        <p className="text-sm text-muted-foreground">
          {me.can.contribute
            ? closedNote
            : "Seu perfil é somente leitura: você acompanha a discussão, mas não comenta."}
        </p>
      )}
      <div className="mt-2">
        {items === undefined ? (
          thread.error ? (
            <ErrorState error={thread.error} what="a discussão" onRetry={thread.reload} />
          ) : (
            <Loading shape="comments" label="Carregando a discussão…" />
          )
        ) : items.length === 0 ? (
          <div className="mt-4">
            <Empty>Ninguém comentou ainda. Uma boa abertura: o que isso muda para o seu projeto?</Empty>
          </div>
        ) : (
          <ol className="divide-y *:pb-5">
            {roots.map((c) => (
              <CommentNode key={c.id} ctx={ctx} comment={c} replies={replies} depth={0} />
            ))}
          </ol>
        )}
        {items && thread.error && (
          <div className="mt-3">
            <ProblemNote error={thread.error} />
          </div>
        )}
        {thread.hasMore && (
          <Button variant="outline" className="mt-4" disabled={thread.pending} onClick={thread.loadMore}>
            {thread.pending ? "Carregando…" : "Carregar mais comentários"}
          </Button>
        )}
      </div>
    </Section>
  );
}

type DiscussionEntry = { comment: Comment; target: { type: TargetType; id: string; title: string } };

const WHERE: Record<TargetType, string> = { story: "na notícia", meetup: "no meetup", insight: "no insight" };

/** One line of "Debates recentes": who said what, where. */
export function DiscussionLine({ entry: { comment, target } }: { entry: DiscussionEntry }) {
  return (
    <li className="grid grid-cols-[1.5rem_minmax(0,1fr)] gap-x-3 border-t py-3.5 first:border-t-0 first:pt-0">
      <AuthorAvatar name={comment.author.displayName} size="sm" />
      <div className="min-w-0">
        <p className="text-xs leading-6 text-muted-foreground">
          <span className="text-sm font-semibold text-foreground">{comment.author.displayName}</span> ·{" "}
          <Time iso={comment.createdAt} />
        </p>
        <p className="plain mt-0.5 line-clamp-3 text-sm leading-relaxed">{comment.body}</p>
        <p className="mt-1.5 text-xs text-muted-foreground">
          {WHERE[target.type]}{" "}
          {target.type === "story" ? (
            <StoryPreview id={target.id}>
              <Link to={`${hrefFor(target.type, target.id)}#discussao`} className="link">
                {target.title}
              </Link>
            </StoryPreview>
          ) : (
            <Link to={`${hrefFor(target.type, target.id)}#discussao`} className="link">
              {target.title}
            </Link>
          )}
        </p>
      </div>
    </li>
  );
}
