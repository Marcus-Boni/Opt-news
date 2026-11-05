// A meetup proposal with its vote: optimistic toggle, visible rollback when the API refuses it.
import type { Proposal } from "@optnews/contracts";
import { toast } from "sonner";
import { useState } from "react";
import { Link } from "@/link";
import { Button } from "@/components/ui/button";
import { RollingNumber } from "@/components/rolling-number";
import { api, useAction } from "./api.ts";
import { formatDateTime, PROPOSAL_STATUS, plural, relativeTime } from "./format.ts";
import { useMe } from "./session.tsx";
import { Dot, Icon, Pill, ProblemNote, Time } from "./ui.tsx";

const votingOpen = (p: Proposal) => p.status === "open" && Date.parse(p.votingClosesAt) > Date.now();

function VoteControl({ proposal: p, onChange }: { proposal: Proposal; onChange: (p: Proposal) => void }) {
  const me = useMe();
  const action = useAction();
  const [rolledBack, setRolledBack] = useState(false);
  const canVote = me.can.contribute && votingOpen(p);

  const toggle = async () => {
    const before = p;
    const vote = !p.myVote;
    setRolledBack(false);
    onChange({ ...p, myVote: vote, votes: p.votes + (vote ? 1 : -1) });
    const res = await action.run(() => api("vote", { params: { id: p.id }, body: { vote } }));
    onChange(res.ok ? { ...before, ...res.value } : before);
    setRolledBack(!res.ok);
  };

  return (
    <div className="flex flex-col items-start gap-2">
      <div className="flex items-center gap-3">
        {canVote ? (
          <Button
            type="button"
            size="sm"
            variant={p.myVote ? "default" : "outline"}
            aria-pressed={p.myVote}
            disabled={action.pending}
            onClick={toggle}
          >
            <Icon name="up" data-icon="inline-start" />
            {p.myVote ? "Você votou" : "Votar"}
          </Button>
        ) : null}
        <span className="text-sm text-muted-foreground" aria-live="polite">
          <RollingNumber value={p.votes} className="font-semibold text-brand-text" /> {p.votes === 1 ? "voto" : "votos"}
        </span>
      </div>
      {rolledBack && action.error && (
        <div className="flex w-full flex-col gap-1">
          <ProblemNote error={action.error} />
          <p className="text-xs text-muted-foreground">
            Seu voto foi desfeito na tela para refletir o que o servidor registrou.
          </p>
        </div>
      )}
    </div>
  );
}

export function ProposalItem({ proposal: p, onChange }: { proposal: Proposal; onChange: (p: Proposal) => void }) {
  const me = useMe();
  const decide = useAction();
  const [confirm, setConfirm] = useState<"selected" | "rejected" | null>(null);
  const open = votingOpen(p);
  const tone = p.status === "selected" ? "success" : p.status === "open" ? (open ? "accent" : "neutral") : "neutral";

  return (
    <article id={`pauta-${p.id}`} data-spotlight className="surface scroll-mt-20 rounded-2xl p-5 sm:p-6">
      <div className="flex flex-wrap items-center gap-2">
        <Pill tone={tone}>
          {p.status === "open" && !open ? "Votação encerrada" : (PROPOSAL_STATUS[p.status] ?? p.status)}
        </Pill>
        <span className="text-xs text-muted-foreground">
          {p.origin.type === "story" ? "A partir de uma notícia" : "Proposta manual"} · por {p.author.displayName},{" "}
          <Time iso={p.createdAt} />
        </span>
      </div>
      <h3 className="mt-2.5 text-lg leading-snug font-semibold tracking-[-0.015em] text-balance">{p.title}</h3>
      <p className="plain mt-1.5 max-w-[68ch] text-[0.9375rem] leading-relaxed text-muted-foreground">{p.rationale}</p>
      {p.origin.type === "story" && (
        <p className="mt-2 text-sm">
          <span className="text-muted-foreground">Notícia de origem: </span>
          <Link to={`/noticias/${p.origin.story.id}`} className="link">
            {p.origin.story.headline}
          </Link>
        </p>
      )}
      <p className="mt-2 text-xs text-muted-foreground">
        {open ? (
          <>
            Votação até <time dateTime={p.votingClosesAt}>{formatDateTime(p.votingClosesAt)}</time> (
            {relativeTime(p.votingClosesAt)})
          </>
        ) : (
          <>
            Votação encerrada em <time dateTime={p.votingClosesAt}>{formatDateTime(p.votingClosesAt)}</time>
          </>
        )}
      </p>

      <div className="mt-4 flex flex-wrap items-start gap-x-6 gap-y-3">
        <VoteControl proposal={p} onChange={onChange} />
        {p.sessionId && (
          <Button asChild size="sm" variant="ghost">
            <Link to={`/meetups/${p.sessionId}`}>Ver sessão agendada</Link>
          </Button>
        )}
        {me.can.organize && p.status === "selected" && !p.sessionId && (
          <Button asChild size="sm">
            <Link to={`/meetups?aba=agenda&pauta=${p.id}`}>Agendar sessão</Link>
          </Button>
        )}
        {me.can.organize && p.status === "open" && (
          <div className="flex flex-wrap items-center gap-2">
            {confirm ? (
              <>
                <span className="text-sm">
                  {confirm === "selected" ? "Selecionar esta pauta para a agenda?" : "Rejeitar esta pauta?"}
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant={confirm === "selected" ? "default" : "destructive"}
                  disabled={decide.pending}
                  onClick={async () => {
                    const res = await decide.run(() =>
                      api("decideProposal", { params: { id: p.id }, body: { status: confirm } }),
                    );
                    if (res.ok) {
                      onChange(res.value);
                      toast.success(confirm === "selected" ? "Pauta selecionada para virar sessão" : "Pauta rejeitada");
                    }
                    setConfirm(null);
                  }}
                >
                  Confirmar
                </Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => setConfirm(null)}>
                  Voltar
                </Button>
              </>
            ) : (
              <>
                <span className="text-xs text-muted-foreground">Organização:</span>
                <Button type="button" size="sm" variant="secondary" onClick={() => setConfirm("selected")}>
                  Selecionar
                </Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => setConfirm("rejected")}>
                  Rejeitar
                </Button>
              </>
            )}
          </div>
        )}
      </div>
      {decide.error && (
        <div className="mt-3">
          <ProblemNote error={decide.error} />
        </div>
      )}
    </article>
  );
}

/** Compact line for side panels: title, votes, deadline. */
export function ProposalLine({ proposal: p }: { proposal: Proposal }) {
  return (
    <li className="border-t py-3 first:border-t-0 first:pt-0">
      <Link
        to={`/meetups?aba=propostas#pauta-${p.id}`}
        className="text-[0.9375rem] leading-snug font-semibold transition-colors hover:text-brand-text"
      >
        {p.title}
      </Link>
      <p className="mt-0.5 flex flex-wrap gap-x-2 text-xs text-muted-foreground">
        <span className="tabular font-medium text-brand-text">{plural(p.votes, "voto", "votos")}</span>
        <Dot />
        <span>encerra {relativeTime(p.votingClosesAt)}</span>
      </p>
    </li>
  );
}
