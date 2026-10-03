"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { Bell, Command as CommandIcon, Compass, LayoutDashboard, Lightbulb, ShieldCheck, Sparkles } from "lucide-react";
import { EXAMPLE_QUERIES, REPLAY_PRESETS } from "@repo/contracts";
import { useTheme } from "next-themes";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "~/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "~/components/ui/popover";
import { SourceHealth } from "~/components/terminal/live-panels";
import { useAlerts } from "~/lib/insights";
import { formatDateTime, humanize } from "~/lib/display";
import { cn } from "~/lib/utils";
import { DATA_SOURCE } from "~/lib/data-source";
import { trpc } from "~/trpc/client";
import { HEALTH_TONE } from "~/lib/tone";
import { Logo } from "./logo";
import { ThemeToggle } from "./theme-toggle";
import { startTour } from "./tour";
import { SEVERITY_DOT } from "./severity";

const NAV = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/analyze", label: "Analyze", icon: Sparkles },
  { href: "/alerts", label: "Alerts", icon: Bell },
  { href: "/ideas", label: "Ideas", icon: Lightbulb },
  { href: "/reliability", label: "Reliability", icon: ShieldCheck },
] as const;

function SourcesButton() {
  const status = trpc.system.status.useQuery(undefined, { refetchInterval: 30_000, enabled: DATA_SOURCE === "api" });
  const sources = status.data?.sources ?? [];
  if (sources.length === 0) return null;
  const healthy = sources.filter((s) => s.status === "ok").length;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="hidden h-8 cursor-pointer items-center gap-2 rounded-lg border px-2.5 text-[11px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none lg:flex"
          aria-label={`Data sources: ${healthy} of ${sources.length} healthy`}
        >
          <span className="flex gap-[3px]" aria-hidden>
            {sources.map((s) => (
              <span key={s.source} className={cn("size-1.5 rounded-full bg-current", HEALTH_TONE[s.status])} />
            ))}
          </span>
          {healthy}/{sources.length} live
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-2">
        <SourceHealth />
      </PopoverContent>
    </Popover>
  );
}

function AlertsBell() {
  const { alerts, preview } = useAlerts();
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button type="button" variant="ghost" size="icon" className="relative size-8" aria-label={`${alerts.length} alerts`} data-tour="alerts">
          <Bell className="size-4" />
          {alerts.length > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex size-4 items-center justify-center rounded-full bg-primary font-mono text-[9px] font-semibold text-primary-foreground">
              {alerts.length}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-96 p-0">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <span className="text-sm font-medium">Alerts</span>
          {preview && <Badge variant="outline" className="text-[10px] text-muted-foreground">preview</Badge>}
        </div>
        <ul className="max-h-96 divide-y overflow-y-auto">
          {alerts.map((a) => (
            <li key={a.id}>
              <Link href={`/alerts#${a.id}`} className="block px-3 py-2.5 transition-colors hover:bg-accent">
                <span className="flex items-center gap-2">
                  <span className={cn("size-2 shrink-0 rounded-full", SEVERITY_DOT[a.severity])} aria-hidden />
                  <span className="truncate text-[13px] font-medium">{a.title}</span>
                </span>
                <span className="mt-1 flex flex-wrap items-center gap-x-2 pl-4 text-[11px] text-muted-foreground">
                  <span>{humanize(a.eventType)}</span>
                  <span className="font-mono">{a.holdings.map((h) => h.symbol).join(" · ")}</span>
                  <span>{formatDateTime(a.raisedAt)}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
        <Link href="/alerts" className="block border-t px-3 py-2 text-center text-xs text-muted-foreground hover:text-foreground">
          All alerts
        </Link>
      </PopoverContent>
    </Popover>
  );
}

function CommandMenu() {
  const [open, setOpen] = useState(false);
  // The dialog's hidden title carries generated ids; rendering it only in the browser keeps hydration exact.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const router = useRouter();
  const { resolvedTheme, setTheme } = useTheme();
  const pathname = usePathname();

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

  const go = (href: string) => {
    setOpen(false);
    router.push(href);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="hidden h-8 cursor-pointer items-center gap-2 rounded-lg border px-2.5 text-[11px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none md:flex"
        aria-label="Open the command menu"
      >
        <CommandIcon className="size-3.5" aria-hidden />
        <span>Search</span>
        <kbd className="rounded border px-1 font-mono text-[10px]">⌘K</kbd>
      </button>
      {mounted && (
      <CommandDialog open={open} onOpenChange={setOpen} title="Command menu" description="Go to a page, replay an event or ask an example question">
        <CommandInput placeholder="Go to, replay or ask…" />
        <CommandList>
          <CommandEmpty>Nothing matches.</CommandEmpty>
          <CommandGroup heading="Go to">
            {NAV.map((n) => (
              <CommandItem key={n.href} onSelect={() => go(n.href)}>
                <n.icon /> {n.label}
              </CommandItem>
            ))}
          </CommandGroup>
          <CommandGroup heading="Replay an event">
            {REPLAY_PRESETS.map((p) => (
              <CommandItem key={p.id} onSelect={() => go(`/analyze?mode=replay&preset=${p.id}`)}>
                {p.name} ({p.year})
              </CommandItem>
            ))}
          </CommandGroup>
          <CommandGroup heading="Ask">
            {EXAMPLE_QUERIES.map((q) => (
              <CommandItem key={q} onSelect={() => go(`/analyze?q=${encodeURIComponent(q)}`)}>
                {q}
              </CommandItem>
            ))}
          </CommandGroup>
          <CommandGroup heading="Settings">
            <CommandItem onSelect={() => (setTheme(resolvedTheme === "dark" ? "light" : "dark"), setOpen(false))}>
              Switch to {resolvedTheme === "dark" ? "light" : "dark"} mode
            </CommandItem>
            <CommandItem onSelect={() => (setOpen(false), setTimeout(() => startTour(pathname), 150))}>Take the tour</CommandItem>
          </CommandGroup>
        </CommandList>
      </CommandDialog>
      )}
    </>
  );
}

/** The bar on every page: the mark, the five places, data health, alerts, search, tour and theme. */
export function TopBar() {
  const pathname = usePathname();
  const active = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

  return (
    <header className="relative z-20 flex h-14 shrink-0 items-center gap-4 border-b bg-background/70 px-4 backdrop-blur-xl">
      <Link href="/" className="shrink-0 rounded-md focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none" aria-label="Tempest home">
        <Logo />
      </Link>

      <nav className="flex min-w-0 flex-1 items-center justify-center" aria-label="Main" data-tour="nav">
        <ul className="flex items-center gap-0.5 rounded-xl border bg-card/60 p-1">
          {NAV.map((n) => {
            const on = active(n.href);
            return (
              <li key={n.href} className="relative">
                {on && (
                  <motion.span
                    layoutId="nav-active"
                    className="absolute inset-0 rounded-lg bg-accent shadow-[inset_0_0_0_1px_var(--border)]"
                    transition={{ type: "tween", ease: [0.22, 1, 0.36, 1], duration: 0.3 }}
                    aria-hidden
                  />
                )}
                <Link
                  href={n.href}
                  aria-current={on ? "page" : undefined}
                  className={cn(
                    "relative flex h-8 items-center gap-1.5 rounded-lg px-3 text-[13px] transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                    on ? "text-foreground" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <n.icon className={cn("size-3.5", on && "text-primary")} aria-hidden />
                  <span className="hidden sm:inline">{n.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="flex shrink-0 items-center gap-1.5">
        {DATA_SOURCE === "fixture" && (
          <Badge variant="outline" className="border-warning/50 bg-warning/10 text-warning" title="Runs are recorded fixtures, not market data.">
            fixture data
          </Badge>
        )}
        <SourcesButton />
        <CommandMenu />
        <Button type="button" variant="ghost" size="sm" className="h-8 gap-1.5 px-2.5 text-[12px]" onClick={() => startTour(pathname)}>
          <Compass className="size-4" />
          <span className="hidden lg:inline">Tour</span>
        </Button>
        <AlertsBell />
        <ThemeToggle />
      </div>
    </header>
  );
}
