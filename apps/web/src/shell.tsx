// App frame on the shadcn Sidebar: warm-graphite navigation grouped by pillar, the Optsolv mark in orange, the
// active place marked in orange. Collapses to icons on desktop, becomes a sheet on phones. The top bar carries the
// quick search (⌘K). Focus moves to the content after each navigation for screen-reader users.
import { Check, ChevronsUpDown, LogOut, Monitor, Moon, Sun } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef } from "react";
import { Outlet, ScrollRestoration, useLocation } from "react-router";
import { Link, NavLink } from "@/link";
import { type CommandAction, CommandMenu, type NavEntry } from "@/components/command-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Kbd } from "@/components/ui/kbd";
import { Separator } from "@/components/ui/separator";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { useSmoothScroll } from "@/motion";
import { type ThemeChoice, useTheme } from "@/theme";
import { ROLE_LABEL } from "./format.ts";
import { useMe, useSession } from "./session.tsx";
import { Hint, Icon, Mark } from "./ui.tsx";

const GROUPS: { label: string; items: NavEntry[] }[] = [
  {
    label: "Notícias",
    items: [
      { to: "/", label: "Início", icon: "home" },
      { to: "/explorar", label: "Explorar", icon: "explore" },
      { to: "/busca", label: "Busca", icon: "search" },
    ],
  },
  {
    label: "Colaboração",
    items: [
      { to: "/comunidade", label: "Comunidade", icon: "community" },
      { to: "/meetups", label: "Meetups", icon: "meetups" },
      { to: "/conhecimento", label: "Conhecimento", icon: "knowledge" },
    ],
  },
];
const CURATION: NavEntry[] = [
  { to: "/curadoria", label: "Curadoria", icon: "curation" },
  { to: "/admin", label: "Administração", icon: "admin" },
];

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");

function NavGroup({ label, items }: { label: string; items: NavEntry[] }) {
  const { pathname } = useLocation();
  const { setOpenMobile } = useSidebar();
  return (
    <SidebarGroup>
      <SidebarGroupLabel>{label}</SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          {items.map((item) => {
            const active = item.to === "/" ? pathname === "/" : pathname.startsWith(item.to);
            return (
              <SidebarMenuItem key={item.to} className="relative">
                {active && (
                  <motion.span
                    layoutId="nav-active"
                    aria-hidden="true"
                    transition={{ type: "spring", stiffness: 520, damping: 40 }}
                    className="absolute top-1.5 bottom-1.5 -left-2 z-10 w-[3px] rounded-r-full bg-sidebar-primary group-data-[collapsible=icon]:hidden"
                  />
                )}
                <SidebarMenuButton
                  asChild
                  isActive={active}
                  tooltip={item.label}
                  className="data-[active=true]:font-semibold [&[data-active=true]>svg]:text-sidebar-primary"
                >
                  <NavLink to={item.to} end={item.to === "/"} onClick={() => setOpenMobile(false)}>
                    <Icon name={item.icon} />
                    <span>{item.label}</span>
                  </NavLink>
                </SidebarMenuButton>
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

const THEMES: { value: ThemeChoice; label: string; icon: typeof Sun }[] = [
  { value: "system", label: "Seguir o sistema", icon: Monitor },
  { value: "light", label: "Claro", icon: Sun },
  { value: "dark", label: "Escuro", icon: Moon },
];

function UserMenu() {
  const me = useMe();
  const { signOut } = useSession();
  const { choice, setChoice } = useTheme();
  const roles = me.roles.map((r) => ROLE_LABEL[r] ?? r).join(" · ");
  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton size="lg" className="data-[state=open]:bg-sidebar-accent">
              <Avatar className="size-8 rounded-lg">
                <AvatarFallback className="rounded-lg bg-sidebar-accent font-semibold text-sidebar-accent-foreground">
                  {initials(me.displayName)}
                </AvatarFallback>
              </Avatar>
              <span className="grid flex-1 text-left leading-tight">
                <span className="truncate text-sm font-semibold">{me.displayName}</span>
                <span className="truncate text-xs text-sidebar-foreground/70">{roles}</span>
              </span>
              <ChevronsUpDown className="ml-auto" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="top" align="start" className="w-(--radix-dropdown-menu-trigger-width) min-w-60">
            <DropdownMenuLabel className="font-normal">
              <span className="block text-sm font-semibold">{me.displayName}</span>
              <span className="block text-xs text-muted-foreground">{roles}</span>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuLabel className="text-xs text-muted-foreground">Aparência</DropdownMenuLabel>
              {THEMES.map((t) => (
                <DropdownMenuItem key={t.value} onSelect={() => setChoice(t.value)}>
                  <t.icon />
                  {t.label}
                  {choice === t.value && <Check className="ml-auto text-brand-text" />}
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem onSelect={signOut}>
                <LogOut />
                Sair
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}

/** Reading pages (a story, an event, a briefing, a meetup, an insight) are long: a thin brand rail under the header
 * says how much is left. CSS scroll-driven (index.css), so it is right from the first frame and never moves on its own. */
const READING = /^\/(noticias|acontecimentos|briefings|meetups|conhecimento)\/(?!novo$)[^/]+$/;

/** One click between light and dark from anywhere (the user menu keeps "follow the system"). The icon turns over to
 * the other one; the page itself changes with the chevron sweep. */
function ThemeToggle() {
  const { resolved, setChoice } = useTheme();
  const next = resolved === "dark" ? "light" : "dark";
  const label = next === "dark" ? "Usar tema escuro" : "Usar tema claro";
  return (
    <Hint label={label} side="bottom">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label={label}
        onClick={() => setChoice(next)}
        className="relative ml-auto overflow-hidden"
      >
        <AnimatePresence initial={false} mode="popLayout">
          <motion.span
            key={resolved}
            initial={{ rotate: -90, scale: 0.6, opacity: 0 }}
            animate={{ rotate: 0, scale: 1, opacity: 1 }}
            exit={{ rotate: 90, scale: 0.6, opacity: 0 }}
            transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
            className="grid place-items-center"
          >
            {resolved === "dark" ? <Moon aria-hidden="true" /> : <Sun aria-hidden="true" />}
          </motion.span>
        </AnimatePresence>
      </Button>
    </Hint>
  );
}

function ReadingProgress() {
  return <span aria-hidden="true" data-reading-progress className="absolute inset-x-0 -bottom-px h-0.5 bg-brand" />;
}

export function Shell() {
  const me = useMe();
  const location = useLocation();
  const main = useRef<HTMLElement>(null);
  const lastPath = useRef(location.pathname);
  useSmoothScroll();

  useEffect(() => {
    if (lastPath.current === location.pathname) return;
    lastPath.current = location.pathname;
    main.current?.focus({ preventScroll: true });
  }, [location.pathname]);

  const { resolved, setChoice } = useTheme();
  const actions: CommandAction[] = [
    ...(me.can.contribute
      ? [
          { label: "Nova pauta", icon: <Icon name="plus" />, to: "/meetups?aba=propostas&nova=1" },
          { label: "Registrar insight", icon: <Icon name="knowledge" />, to: "/conhecimento/novo" },
        ]
      : []),
    {
      label: resolved === "dark" ? "Usar tema claro" : "Usar tema escuro",
      icon: resolved === "dark" ? <Sun /> : <Moon />,
      run: () => setChoice(resolved === "dark" ? "light" : "dark"),
    },
  ];
  const groups = me.can.moderate ? [...GROUPS, { label: "Moderação", items: CURATION }] : GROUPS;

  return (
    <SidebarProvider>
      <a href="#conteudo" className="skip-link">
        Pular para o conteúdo
      </a>
      <Sidebar collapsible="icon" variant="sidebar">
        <SidebarHeader>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton size="lg" asChild tooltip="Opt News — início">
                <Link to="/">
                  <span className="grid size-8 shrink-0 place-items-center">
                    <Mark className="h-6 w-auto" />
                  </span>
                  <span className="grid leading-tight">
                    <span
                      translate="no"
                      className="text-[1.0625rem] font-bold tracking-[-0.03em] text-sidebar-accent-foreground"
                    >
                      Opt News
                    </span>
                    <span translate="no" className="text-[0.6875rem] text-sidebar-foreground/70">
                      Optsolv
                    </span>
                  </span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarHeader>
        <SidebarContent>
          <nav aria-label="Principal" className="flex flex-col gap-2">
            {groups.map((g) => (
              <NavGroup key={g.label} label={g.label} items={g.items} />
            ))}
          </nav>
        </SidebarContent>
        <SidebarFooter>
          <UserMenu />
        </SidebarFooter>
        <SidebarRail />
      </Sidebar>
      <SidebarInset>
        <header
          data-app-header
          className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-2 border-b bg-background px-3 sm:px-4"
        >
          <Hint
            label={
              <>
                Mostrar ou recolher navegação <Kbd className="ml-1">Ctrl B</Kbd>
              </>
            }
            side="bottom"
          >
            <SidebarTrigger className="-ml-1" aria-label="Mostrar ou recolher navegação" />
          </Hint>
          {/* On a phone the sidebar is hidden: the mark keeps the product in view and leads home. */}
          <Link to="/" aria-label="Opt News — início" className="grid size-9 shrink-0 place-items-center md:hidden">
            <Mark className="h-5 w-auto" />
          </Link>
          <Separator orientation="vertical" className="mr-1 data-[orientation=vertical]:h-5" />
          <CommandMenu entries={groups.flatMap((g) => g.items)} actions={actions} />
          <ThemeToggle />
          {READING.test(location.pathname) && <ReadingProgress />}
        </header>
        <main id="conteudo" ref={main} tabIndex={-1} className="flex-1 outline-none">
          <Outlet />
        </main>
      </SidebarInset>
      <ScrollRestoration />
    </SidebarProvider>
  );
}
