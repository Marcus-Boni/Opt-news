// ⌘K / Ctrl+K: jump to any area, start a frequent task, or send what was typed to the unified search.
import { CornerDownLeft, Search } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from "@/components/ui/command";
import { Kbd } from "@/components/ui/kbd";
import { Icon, type IconName } from "@/ui";

export interface NavEntry {
  to: string;
  label: string;
  icon: IconName;
}

/** A task the palette can start: open a page in a given state, or act in place (the theme). */
export interface CommandAction {
  label: string;
  icon: ReactNode;
  to?: string;
  run?: () => void;
}

export function CommandMenu({ entries, actions = [] }: { entries: NavEntry[]; actions?: CommandAction[] }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const go = (to: string) => {
    setOpen(false);
    setQuery("");
    navigate(to);
  };
  const q = query.trim();

  return (
    <>
      <Button
        variant="outline"
        className="h-9 min-w-0 max-w-sm flex-1 shrink justify-start gap-2 text-muted-foreground sm:w-72 sm:flex-none"
        onClick={() => setOpen(true)}
      >
        <Search data-icon="inline-start" />
        <span className="truncate">Buscar notícias, insights, meetups…</span>
        <Kbd className="ml-auto hidden sm:inline-flex">Ctrl K</Kbd>
      </Button>
      <CommandDialog
        open={open}
        onOpenChange={setOpen}
        title="Busca rápida"
        description="Vá para uma área ou pesquise em todo o Opt News"
      >
        <Command>
          <CommandInput placeholder="Digite um termo ou uma área…" value={query} onValueChange={setQuery} />
          <CommandList>
            <CommandEmpty>Nada encontrado.</CommandEmpty>
            {q.length >= 2 && (
              <CommandGroup heading="Pesquisar">
                <CommandItem value={`buscar ${q}`} onSelect={() => go(`/busca?q=${encodeURIComponent(q)}`)}>
                  <Search />
                  Buscar “{q}” em notícias, insights e meetups
                  <CommandShortcut>
                    <CornerDownLeft className="size-3.5" />
                  </CommandShortcut>
                </CommandItem>
              </CommandGroup>
            )}
            {actions.length > 0 && (
              <CommandGroup heading="Ações">
                {actions.map((a) => (
                  <CommandItem
                    key={a.label}
                    value={a.label}
                    onSelect={() => {
                      if (a.to) go(a.to);
                      else {
                        setOpen(false);
                        a.run?.();
                      }
                    }}
                  >
                    {a.icon}
                    {a.label}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            <CommandGroup heading="Ir para">
              {entries.map((e) => (
                <CommandItem key={e.to} value={e.label} onSelect={() => go(e.to)}>
                  <Icon name={e.icon} />
                  {e.label}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </CommandDialog>
    </>
  );
}
