"use client";

import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Bell, Search, ChevronDown, Sun, CheckCheck, Users, Calendar, Stethoscope, X,
  User, CalendarClock, Receipt, PhoneCall,
} from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { DropdownMenu } from "@/components/ui/dropdown";
import { useAuth } from "@/lib/auth-context";
import { api } from "@/lib/api";
import { useMarkNotificationsRead } from "@/hooks/use-queries";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

interface SearchHit {
  kind: "patient" | "appointment" | "invoice" | "lead";
  id: string;
  title: string;
  subtitle?: string | null;
  href: string;
  meta?: string | null;
}

const KIND_STYLES: Record<SearchHit["kind"], { label: string; icon: React.ReactNode; color: string }> = {
  patient:     { label: "Patients",     icon: <User className="w-3.5 h-3.5" />,        color: "text-blue-500" },
  appointment: { label: "Appointments", icon: <CalendarClock className="w-3.5 h-3.5" />, color: "text-violet-500" },
  invoice:     { label: "Invoices",     icon: <Receipt className="w-3.5 h-3.5" />,     color: "text-emerald-500" },
  lead:        { label: "Leads",        icon: <PhoneCall className="w-3.5 h-3.5" />,   color: "text-amber-500" },
};

export function Topbar() {
  const router = useRouter();
  const [showNotifications, setShowNotifications] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [notifications, setNotifications] = useState<{ id: string; title: string; message: string; isRead: boolean }[]>([]);
  const { user, logout } = useAuth();
  const markRead = useMarkNotificationsRead();

  // Global search — fans out across patients, appointments, invoices, leads
  const searchEnabled = searchQuery.trim().length >= 2;
  const { data: searchData, isFetching: searchFetching } = useQuery({
    queryKey: ["global-search", searchQuery.trim()],
    enabled: searchEnabled,
    queryFn: async (): Promise<{ hits: SearchHit[] }> => {
      const r = await fetch(`/api/search?q=${encodeURIComponent(searchQuery.trim())}`);
      const j = await r.json();
      if (!j.success) throw new Error(j.error || "Search failed");
      return j.data;
    },
    staleTime: 30_000,
  });
  const allHits: SearchHit[] = searchEnabled ? (searchData?.hits ?? []) : [];
  const hitsByKind: Partial<Record<SearchHit["kind"], SearchHit[]>> = {};
  for (const h of allHits) {
    if (!hitsByKind[h.kind]) hitsByKind[h.kind] = [];
    hitsByKind[h.kind]!.push(h);
  }
  const flatHits = allHits;
  const [hitCursor, setHitCursor] = useState(0);

  // Reset cursor when query changes
  useEffect(() => { setHitCursor(0); }, [searchQuery]);

  // Keyboard shortcuts: ⌘K / Ctrl+K opens; "/" still works; Esc closes; arrows + Enter navigate hits
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Open shortcut: ⌘K or Ctrl+K — global, even from inputs (standard)
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setShowSearch(true);
        return;
      }
      if (!showSearch && e.key === "/" && document.activeElement?.tagName !== "INPUT" && document.activeElement?.tagName !== "TEXTAREA") {
        e.preventDefault();
        setShowSearch(true);
        return;
      }
      if (!showSearch) return;
      if (e.key === "Escape") { setShowSearch(false); return; }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setHitCursor((c) => Math.min(c + 1, Math.max(flatHits.length - 1, 0)));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setHitCursor((c) => Math.max(c - 1, 0));
      } else if (e.key === "Enter") {
        const hit = flatHits[hitCursor];
        if (hit) {
          e.preventDefault();
          router.push(hit.href);
          setShowSearch(false);
          setSearchQuery("");
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [showSearch, flatHits, hitCursor, router]);
  const unreadCount = notifications.filter((n) => !n.isRead).length;
  const displayName = user?.name?.split(" ")[1] || user?.name?.split(" ")[0] || "there";
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  useEffect(() => {
    api.notifications.list().then((res) => {
      const data = res.data as Record<string, unknown>;
      if (res.success && Array.isArray(data)) setNotifications(data as typeof notifications);
      else if (res.success && Array.isArray((data)?.notifications)) setNotifications((data).notifications as typeof notifications);
    }).catch(() => {});
  }, []);

  return (
    <header className="h-16 bg-[#EEF4FD]/85 backdrop-blur-md border-b border-blue-100/70 flex items-center justify-between px-4 sm:px-5 lg:px-6 sticky top-0 z-30">
      {/* Left — Greeting (hidden on mobile to save space) */}
      <div className="hidden sm:flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center shrink-0">
          <Sun className="w-4 h-4 text-amber-500" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium text-stone-800 truncate">{greeting}, <span className="text-blue-700">{displayName}</span></p>
          <p className="text-xs text-stone-400 hidden lg:block">Here&apos;s your clinic overview today</p>
        </div>
      </div>
      {/* Mobile: just brand */}
      <p className="sm:hidden text-sm font-semibold text-stone-800 pl-12">DentaCore</p>

      {/* Right */}
      <div className="flex items-center gap-1.5 sm:gap-2">
        {/* Search */}
        <button onClick={() => setShowSearch(true)} className="flex items-center gap-2 px-3 py-2 rounded-xl bg-stone-50 hover:bg-stone-100 text-stone-400 text-sm transition-colors cursor-pointer border border-stone-100">
          <Search className="w-4 h-4" />
          <span className="hidden md:inline">Search...</span>
          <kbd className="hidden lg:inline-flex h-5 items-center gap-1 rounded border border-stone-200 bg-white px-1.5 text-[10px] font-medium text-stone-400">⌘K</kbd>
        </button>

        {/* Notifications */}
        <div className="relative">
          <button onClick={() => setShowNotifications(!showNotifications)}
            className="w-10 h-10 rounded-xl bg-stone-50 hover:bg-stone-100 flex items-center justify-center text-stone-500 transition-colors relative cursor-pointer border border-stone-100"
            data-id="APP-NOTIFICATIONS"
          >
            <Bell className="w-[18px] h-[18px]" />
            {unreadCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 w-5 h-5 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center ring-2 ring-white">{unreadCount}</span>
            )}
          </button>
          {showNotifications && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setShowNotifications(false)} />
              <div className="absolute right-0 top-12 w-[min(320px,calc(100vw-32px))] bg-white rounded-2xl shadow-lg border border-stone-100 z-50 max-h-[70vh] overflow-hidden animate-fade-in">
                <div className="px-4 py-3 border-b border-stone-100 flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-stone-800">Notifications</h3>
                  <div className="flex items-center gap-2">
                    {unreadCount > 0 && (
                      <button
                        className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 cursor-pointer font-medium"
                        onClick={() => {
                          const unreadIds = notifications.filter((n) => !n.isRead).map((n) => n.id);
                          markRead.mutate(unreadIds, {
                            onSuccess: () => setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true }))),
                          });
                        }}
                      >
                        <CheckCheck className="w-3.5 h-3.5" />
                        Mark All Read
                      </button>
                    )}
                    <Badge variant="danger">{unreadCount} new</Badge>
                  </div>
                </div>
                <div className="overflow-y-auto max-h-[calc(70vh-52px)]">
                  {notifications.slice(0, 6).map((notif) => (
                    <div
                      key={notif.id}
                      className={`px-4 py-3 border-b border-stone-50 hover:bg-stone-50 cursor-pointer transition-colors ${!notif.isRead ? "bg-blue-50/30" : ""}`}
                      onClick={() => {
                        if (!notif.isRead) {
                          markRead.mutate([notif.id], {
                            onSuccess: () => setNotifications((prev) => prev.map((n) => n.id === notif.id ? { ...n, isRead: true } : n)),
                          });
                        }
                      }}
                    >
                      <div className="flex items-start gap-2.5">
                        {!notif.isRead && <span className="w-2 h-2 rounded-full bg-blue-500 mt-1.5 shrink-0" />}
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-stone-800 truncate">{notif.title}</p>
                          <p className="text-xs text-stone-500 mt-0.5 line-clamp-2">{notif.message}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>

        {/* User */}
        <DropdownMenu
          trigger={
            <div className="flex items-center gap-2 pl-1 sm:pl-2 cursor-pointer">
              <Avatar name={user?.name || "User"} size="md" />
              <div className="hidden lg:block text-left min-w-0">
                <p className="text-sm font-medium text-stone-800 truncate">{user?.name || "User"}</p>
                <p className="text-xs text-stone-400">{user?.role || ""}</p>
              </div>
              <ChevronDown className="w-4 h-4 text-stone-400 hidden lg:block" />
            </div>
          }
          items={[
            { label: "My Profile", onClick: () => {} },
            { label: "Preferences", onClick: () => {} },
            { divider: true, label: "" },
            { label: "Log Out", danger: true, onClick: () => { logout(); window.location.href = "/login"; } },
          ]}
        />
      </div>

      {/* Global Search Modal */}
      {showSearch && (
        <>
          <div className="fixed inset-0 z-50 bg-stone-900/30 backdrop-blur-sm" onClick={() => setShowSearch(false)} />
          <div className="fixed top-[12vh] left-1/2 -translate-x-1/2 z-50 w-[min(580px,calc(100vw-2rem))] bg-white rounded-2xl shadow-2xl border border-stone-200 overflow-hidden animate-fade-in">
            <div className="flex items-center gap-3 px-4 py-3 border-b border-stone-100">
              <Search className="w-5 h-5 text-stone-400 shrink-0" />
              <input
                autoFocus
                type="text"
                placeholder="Search patients, appointments, invoices, leads…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="flex-1 text-sm text-stone-900 bg-transparent outline-none placeholder:text-stone-400"
              />
              {searchFetching && searchEnabled && (
                <span className="w-3 h-3 rounded-full border-2 border-blue-300 border-t-transparent animate-spin shrink-0" />
              )}
              <button onClick={() => setShowSearch(false)} className="p-1 rounded-lg hover:bg-stone-100 text-stone-400 cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="max-h-[60vh] overflow-y-auto">
              {/* Results grouped by kind */}
              {searchEnabled && allHits.length > 0 && (() => {
                let renderedSoFar = 0;
                return (["patient", "appointment", "invoice", "lead"] as const).map((kind) => {
                  const group = hitsByKind[kind];
                  if (!group || group.length === 0) return null;
                  const style = KIND_STYLES[kind];
                  return (
                    <div key={kind} className="p-2">
                      <p className={cn("text-[10px] font-semibold uppercase tracking-wider px-2 py-1 flex items-center gap-1.5", style.color)}>
                        {style.icon} {style.label}
                      </p>
                      {group.map((h) => {
                        const globalIdx = renderedSoFar++;
                        const active = globalIdx === hitCursor;
                        return (
                          <button
                            key={`${h.kind}-${h.id}`}
                            onClick={() => { router.push(h.href); setShowSearch(false); setSearchQuery(""); }}
                            onMouseEnter={() => setHitCursor(globalIdx)}
                            className={cn(
                              "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left cursor-pointer transition-colors",
                              active ? "bg-blue-50" : "hover:bg-stone-50"
                            )}
                          >
                            {h.kind === "patient" ? (
                              <Avatar name={h.title} size="sm" />
                            ) : (
                              <div className={cn("w-8 h-8 rounded-full flex items-center justify-center bg-stone-50", style.color)}>
                                {style.icon}
                              </div>
                            )}
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-stone-900 truncate">{h.title}</p>
                              {h.subtitle && (
                                <p className="text-xs text-stone-400 truncate">{h.subtitle}</p>
                              )}
                            </div>
                            {h.meta && (
                              <span className="text-[10px] font-semibold uppercase tracking-wide text-stone-500 bg-stone-100 px-1.5 py-0.5 rounded">
                                {h.meta.replace(/_/g, " ")}
                              </span>
                            )}
                            <ChevronDown className="w-3.5 h-3.5 text-stone-300 -rotate-90 shrink-0" />
                          </button>
                        );
                      })}
                    </div>
                  );
                });
              })()}

              {/* Quick navigation when query is short */}
              {!searchEnabled && (
                <div className="p-2">
                  <p className="text-[10px] font-semibold text-stone-400 uppercase tracking-wider px-2 py-1">Quick Navigation</p>
                  {[
                    { label: "Patients",     href: "/patients",     icon: <Users className="w-4 h-4 text-blue-500" /> },
                    { label: "Appointments", href: "/appointments", icon: <Calendar className="w-4 h-4 text-violet-500" /> },
                    { label: "Calendar",     href: "/calendar",     icon: <Calendar className="w-4 h-4 text-violet-500" /> },
                    { label: "Consultation", href: "/consultation", icon: <Stethoscope className="w-4 h-4 text-emerald-500" /> },
                  ].map((nav) => (
                    <button key={nav.href} onClick={() => { router.push(nav.href); setShowSearch(false); }}
                      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-stone-50 transition-colors text-left cursor-pointer">
                      {nav.icon}
                      <span className="text-sm text-stone-700">{nav.label}</span>
                    </button>
                  ))}
                </div>
              )}

              {searchEnabled && allHits.length === 0 && !searchFetching && (
                <div className="py-8 text-center text-sm text-stone-400">No results for &ldquo;{searchQuery}&rdquo;</div>
              )}
            </div>

            <div className="px-4 py-2 border-t border-stone-100 flex items-center justify-between text-[10px] text-stone-400">
              <span className="flex items-center gap-3">
                <span>
                  <kbd className="px-1 py-0.5 rounded border border-stone-200 bg-stone-50 font-mono">↑↓</kbd>{" "}
                  navigate
                </span>
                <span>
                  <kbd className="px-1 py-0.5 rounded border border-stone-200 bg-stone-50 font-mono">↵</kbd>{" "}
                  select
                </span>
                <span>
                  <kbd className="px-1 py-0.5 rounded border border-stone-200 bg-stone-50 font-mono">esc</kbd>{" "}
                  close
                </span>
              </span>
              <span>
                <kbd className="px-1 py-0.5 rounded border border-stone-200 bg-stone-50 font-mono">⌘K</kbd>{" "}
                to open
              </span>
            </div>
          </div>
        </>
      )}
    </header>
  );
}
