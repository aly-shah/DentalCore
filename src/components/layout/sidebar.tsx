"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth-context";
import { useModuleNavigation } from "@/modules/core/hooks";
import { useModuleContext } from "@/modules/core/provider";
import type { ModuleId } from "@/modules/core/types";
import {
  LayoutDashboard, Users, Calendar, CreditCard, Phone, UserCog,
  Stethoscope, Building2, Package, Brain, Settings,
  LogOut, ChevronLeft, Menu, DoorOpen,
  FlaskConical, HeartPulse, Receipt, PhoneCall, Clock, Activity,
  Sparkles, X, Bell, Camera, FileText, Shield, Pill, Inbox, CalendarCheck,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

// Map module icon names to components
const iconMap: Record<string, LucideIcon> = {
  LayoutDashboard, Users, Calendar, CreditCard, Phone, UserCog,
  Stethoscope, Building2, Package, Brain, Settings,
  DoorOpen, FlaskConical, HeartPulse, Receipt, PhoneCall,
  Clock, Activity, Sparkles, Bell, Camera, FileText, Shield, Pill, Inbox, CalendarCheck,
  CalendarClock: Clock,
};

// Role-specific label overrides for dashboard
const dashboardLabels: Record<string, string> = {
  DOCTOR: "My Day",
  RECEPTIONIST: "Front Desk",
  BILLING: "Billing",
  CALL_CENTER: "Workspace",
  ASSISTANT: "Tasks",
};

// Group modules into nav sections per role
interface NavSection {
  section?: string;
  moduleIds: ModuleId[];
}

const roleNavLayout: Record<string, NavSection[]> = {
  ADMIN: [
    { moduleIds: ["MOD-DASHBOARD", "MOD-PATIENT", "MOD-APPOINTMENT"] },
    { section: "Clinic", moduleIds: ["MOD-CONSULTATION", "MOD-BILLING", "MOD-ROOMS", "MOD-COMMUNICATION"] },
    { section: "Tools", moduleIds: ["MOD-AI-TRANSCRIPTION", "MOD-FOLLOWUP"] },
    { section: "Settings", moduleIds: ["MOD-STAFF", "MOD-PROCEDURE", "MOD-BRANCH", "MOD-ADMIN"] },
  ],
  SUPER_ADMIN: [
    { moduleIds: ["MOD-DASHBOARD", "MOD-PATIENT", "MOD-APPOINTMENT"] },
    { section: "Clinic", moduleIds: ["MOD-CONSULTATION", "MOD-BILLING", "MOD-ROOMS", "MOD-COMMUNICATION"] },
    { section: "Tools", moduleIds: ["MOD-AI-TRANSCRIPTION", "MOD-FOLLOWUP"] },
    { section: "Settings", moduleIds: ["MOD-STAFF", "MOD-PROCEDURE", "MOD-BRANCH", "MOD-ADMIN"] },
  ],
  DOCTOR: [
    { moduleIds: ["MOD-DASHBOARD", "MOD-PATIENT", "MOD-APPOINTMENT", "MOD-CONSULTATION", "MOD-AI-TRANSCRIPTION", "MOD-FOLLOWUP"] },
  ],
  RECEPTIONIST: [
    { moduleIds: ["MOD-DASHBOARD", "MOD-PATIENT", "MOD-APPOINTMENT", "MOD-ROOMS", "MOD-BILLING"] },
  ],
  BILLING: [
    { moduleIds: ["MOD-DASHBOARD", "MOD-BILLING"] },
  ],
  CALL_CENTER: [
    { moduleIds: ["MOD-DASHBOARD", "MOD-COMMUNICATION", "MOD-APPOINTMENT"] },
  ],
  ASSISTANT: [
    { moduleIds: ["MOD-DASHBOARD", "MOD-PATIENT", "MOD-APPOINTMENT", "MOD-ROOMS"] },
  ],
};

// Extra non-module routes (vitals, check-in, lab-results, packages)
const extraRoutes: Record<string, { label: string; href: string; icon: string; afterModule: ModuleId; roles: string[] }[]> = {
  "/notifications": [{ label: "Notifications", href: "/notifications", icon: "Bell", afterModule: "MOD-DASHBOARD", roles: ["ADMIN", "SUPER_ADMIN", "DOCTOR", "RECEPTIONIST", "ASSISTANT", "BILLING", "CALL_CENTER"] }],
  "/calendar": [{ label: "Calendar", href: "/calendar", icon: "Calendar", afterModule: "MOD-APPOINTMENT", roles: ["ADMIN", "SUPER_ADMIN", "DOCTOR", "RECEPTIONIST", "ASSISTANT"] }],
  "/vitals": [{ label: "Pre-Exam / Vitals", href: "/vitals", icon: "HeartPulse", afterModule: "MOD-PATIENT", roles: ["ASSISTANT"] }],
  "/appointments/check-in": [{ label: "Check-In", href: "/appointments/check-in", icon: "HeartPulse", afterModule: "MOD-APPOINTMENT", roles: ["RECEPTIONIST"] }],
  "/lab-results": [{ label: "Dental Imaging", href: "/lab-results", icon: "FlaskConical", afterModule: "MOD-FOLLOWUP", roles: ["ADMIN", "SUPER_ADMIN", "DOCTOR"] }],
  "/admin/packages": [{ label: "Treatment Plans", href: "/admin/packages", icon: "Package", afterModule: "MOD-PROCEDURE", roles: ["ADMIN", "SUPER_ADMIN", "BILLING"] }],
  "/admin/templates": [{ label: "Procedure Templates", href: "/admin/templates", icon: "FileText", afterModule: "MOD-PROCEDURE", roles: ["ADMIN", "SUPER_ADMIN"] }],
  "/admin/blocks":    [{ label: "Calendar Blocks", href: "/admin/blocks", icon: "Clock", afterModule: "MOD-APPOINTMENT", roles: ["ADMIN", "SUPER_ADMIN", "DOCTOR"] }],
  "/admin/ai-usage":  [{ label: "AI Usage", href: "/admin/ai-usage", icon: "Sparkles", afterModule: "MOD-AI-TRANSCRIPTION", roles: ["ADMIN", "SUPER_ADMIN"] }],
  "/admin/audit":     [{ label: "Audit Log", href: "/admin/audit", icon: "Shield", afterModule: "MOD-ADMIN", roles: ["ADMIN", "SUPER_ADMIN"] }],
  "/admin/tenants":   [{ label: "Tenants", href: "/admin/tenants", icon: "Building2", afterModule: "MOD-ADMIN", roles: ["SUPER_ADMIN"] }],
  "/admin/whatsapp":  [
    { label: "Messages", href: "/admin/messages", icon: "Inbox", afterModule: "MOD-COMMUNICATION", roles: ["ADMIN", "SUPER_ADMIN", "DOCTOR", "RECEPTIONIST"] },
    { label: "WhatsApp", href: "/admin/whatsapp", icon: "Phone", afterModule: "MOD-COMMUNICATION", roles: ["ADMIN", "SUPER_ADMIN"] },
    { label: "WA Inbox", href: "/admin/whatsapp/inbox", icon: "Bell", afterModule: "MOD-COMMUNICATION", roles: ["ADMIN", "SUPER_ADMIN", "RECEPTIONIST"] },
  ],
  "/admin/booking-requests": [
    { label: "Online Bookings", href: "/admin/booking-requests", icon: "CalendarCheck", afterModule: "MOD-APPOINTMENT", roles: ["ADMIN", "SUPER_ADMIN", "RECEPTIONIST", "DOCTOR"] },
  ],
  "/pharmacy": [{ label: "Dental Supplies", href: "/pharmacy", icon: "Pill", afterModule: "MOD-BILLING", roles: ["ADMIN", "SUPER_ADMIN", "BILLING"] }],
};

export function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const { user, logout } = useAuth();
  const { ready } = useModuleContext();
  const navModules = useModuleNavigation();
  const role = user?.role || "ADMIN";
  // Clinical staff get a shortcut to the mobile-first doctor/clinical app.
  const isClinical = ["DOCTOR", "ASSISTANT", "ADMIN", "SUPER_ADMIN"].includes(role);

  // Auto-collapse on resize. Below 768px we use the drawer (mobileOpen),
  // so `collapsed` is irrelevant there — leaving it alone means the drawer
  // renders with full labels (260px wide drawer can show text).
  useEffect(() => {
    const onResize = () => {
      const w = window.innerWidth;
      if (w < 768) {
        // Mobile: drawer mode. Keep collapsed=false so the drawer shows labels.
        setCollapsed(false);
        setMobileOpen(false);
      } else if (w < 1024) {
        setCollapsed(true);
      } else {
        setCollapsed(false);
      }
    };
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // Close mobile nav on route change
  const [prevPathname, setPrevPathname] = useState(pathname);
  if (pathname !== prevPathname) {
    setPrevPathname(pathname);
    setMobileOpen(false);
  }

  const sidebarWidth = collapsed ? "w-[80px]" : "w-[264px]";
  // Labels show when expanded OR when the mobile drawer is open
  // (drawer is 260px wide so it has room for text).
  const showLabels = !collapsed || mobileOpen;

  // Build nav items from module registry
  const navLayout = roleNavLayout[role] || roleNavLayout.ADMIN;
  const moduleMap = new Map(navModules.map((m) => [m.id, m]));

  // Collect extra routes for this role
  const roleExtras = Object.values(extraRoutes)
    .flat()
    .filter((r) => r.roles.includes(role));

  const navContent = (
    <>
      {/* Brand */}
      <div className={cn("flex items-center h-16 border-b border-stone-100 shrink-0", !showLabels ? "justify-center px-2" : "px-5")}>
        {!showLabels ? (
          <span className="text-sm font-bold tracking-tight text-blue-700">DC</span>
        ) : (
          <div className="min-w-0">
            <h1 className="text-base font-bold text-blue-700 leading-tight truncate tracking-tight">DentaCore</h1>
            <p className="text-[10px] text-slate-400 font-medium">Dental Clinic ERP</p>
          </div>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
        {ready && navLayout.map((group, gi) => (
          <div key={gi} className="mb-1">
            {group.section && showLabels && (
              <p className="px-3 py-2 mt-3 first:mt-0 text-[10px] font-semibold text-stone-400 uppercase tracking-widest">{group.section}</p>
            )}
            {group.section && !showLabels && <div className="my-2 mx-2 border-t border-stone-100" />}

            {group.moduleIds.map((modId) => {
              const mod = moduleMap.get(modId);
              if (!mod || !mod.route) return null;

              const Icon = iconMap[mod.icon] || LayoutDashboard;
              const label = modId === "MOD-DASHBOARD"
                ? (dashboardLabels[role] || mod.navLabel || mod.name)
                : (mod.navLabel || mod.name);
              const isActive = pathname === mod.route || (mod.route !== "/dashboard" && pathname.startsWith(mod.route));

              return (
                <div key={modId}>
                  <Link
                    href={mod.route}
                    data-id={modId}
                    className={cn(
                      "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all",
                      isActive ? "bg-blue-50/80 text-blue-700 font-semibold" : "text-stone-500 hover:bg-stone-50 hover:text-stone-700",
                      !showLabels && "justify-center px-2"
                    )}
                    title={!showLabels ? label : undefined}
                  >
                    <Icon className={cn("w-5 h-5 shrink-0", isActive && "text-blue-600")} />
                    {showLabels && <span className="truncate">{label}</span>}
                  </Link>

                  {/* Insert extra routes that go after this module */}
                  {roleExtras
                    .filter((r) => r.afterModule === modId)
                    .map((extra) => {
                      const ExIcon = iconMap[extra.icon] || LayoutDashboard;
                      const exActive = pathname === extra.href;
                      return (
                        <Link
                          key={extra.href}
                          href={extra.href}
                          className={cn(
                            "relative flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all",
                            exActive ? "bg-blue-50 text-blue-700" : "text-stone-500 hover:bg-stone-50 hover:text-stone-700",
                            !showLabels && "justify-center px-2"
                          )}
                          title={!showLabels ? extra.label : undefined}
                        >
                          <ExIcon className={cn("w-5 h-5 shrink-0", exActive && "text-blue-600")} />
                          {showLabels && <span className="truncate">{extra.label}</span>}
                          {extra.href === "/admin/booking-requests" && (
                            <BookingRequestsBadge collapsed={!showLabels} active={exActive} />
                          )}
                          {extra.href === "/notifications" && (
                            <NotificationsBadge collapsed={!showLabels} active={exActive} />
                          )}
                        </Link>
                      );
                    })}
                </div>
              );
            })}
          </div>
        ))}
      </nav>

      {/* Bottom */}
      <div className="border-t border-stone-100 px-2 py-2 space-y-0.5 shrink-0">
        {isClinical && (
          <Link
            href="/doctor-app"
            title={!showLabels ? "Doctor App" : undefined}
            className={cn(
              "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-teal-600 hover:bg-teal-50 hover:text-teal-700 transition-all",
              !showLabels && "justify-center px-2"
            )}
          >
            <Stethoscope className="w-5 h-5 shrink-0" />{showLabels && <span>Doctor App</span>}
          </Link>
        )}
        <Link href="/settings" className={cn("flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-stone-500 hover:bg-stone-50 hover:text-stone-700 transition-all", !showLabels && "justify-center px-2")}>
          <Settings className="w-5 h-5 shrink-0" />{showLabels && <span>Settings</span>}
        </Link>
        <button onClick={() => { logout(); window.location.href = "/login"; }} className={cn("flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-stone-500 hover:bg-red-50 hover:text-red-600 transition-all w-full cursor-pointer", !showLabels && "justify-center px-2")}>
          <LogOut className="w-5 h-5 shrink-0" />{showLabels && <span>Log Out</span>}
        </button>
      </div>
    </>
  );

  return (
    <>
      {/* Mobile menu button — top z-index so it stays tappable over
          everything (drawers, modals, fullscreen views). Other surfaces
          must reserve the top-left ~48×48 area on mobile so their content
          doesn't slide underneath. */}
      <button
        onClick={() => setMobileOpen(true)}
        aria-label="Open menu"
        className="fixed top-3 left-3 z-[60] md:hidden w-9 h-9 bg-white/85 backdrop-blur-md rounded-lg border border-blue-100/80 shadow-sm flex items-center justify-center text-stone-600 hover:bg-white/95 transition-colors cursor-pointer"
      >
        <Menu className="w-4 h-4" />
      </button>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="sidebar-overlay md:hidden" onClick={() => setMobileOpen(false)} />
      )}

      {/* Sidebar */}
      <aside className={cn(
        "fixed top-0 h-screen bg-[#F4F8FE] border-r border-blue-100/70 flex flex-col z-40 sidebar-transition",
        "max-md:w-[260px]",
        mobileOpen ? "max-md:left-0" : "max-md:-left-[260px]",
        "md:left-0",
        sidebarWidth
      )}>
        {mobileOpen && (
          <button onClick={() => setMobileOpen(false)} className="absolute top-4 right-3 md:hidden w-8 h-8 rounded-lg hover:bg-stone-100 flex items-center justify-center text-stone-400 cursor-pointer z-10">
            <X className="w-4 h-4" />
          </button>
        )}
        {navContent}
      </aside>

      {/* Desktop collapse toggle */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className={cn(
          "fixed top-20 z-50 w-6 h-6 bg-white rounded-full border border-stone-200 shadow-sm items-center justify-center text-stone-400 hover:text-stone-600 hover:bg-stone-50 transition-all cursor-pointer hidden md:flex",
          collapsed ? "left-[77px]" : "left-[261px]"
        )}
      >
        <ChevronLeft className={cn("w-3.5 h-3.5 transition-transform", collapsed && "rotate-180")} />
      </button>
    </>
  );
}

/**
 * Sidebar pill showing the number of PENDING online bookings. Polls
 * every 30s + on window focus so a receptionist seeing the dashboard
 * picks up new requests without a refresh. When collapsed (icon-only
 * sidebar), renders as a small unread dot on the corner of the icon.
 */
function BookingRequestsBadge({ collapsed, active }: { collapsed: boolean; active: boolean }) {
  const { data } = useQuery({
    queryKey: ["booking-requests-count"],
    queryFn: async () => {
      const r = await fetch("/api/admin/booking-requests/count");
      const j = await r.json();
      if (!j.success) throw new Error(j.error || "load_failed");
      return j.data as { count: number };
    },
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
    staleTime: 10_000,
  });

  const count = data?.count ?? 0;
  if (count === 0) return null;

  if (collapsed) {
    return (
      <span
        aria-label={`${count} pending booking${count === 1 ? "" : "s"}`}
        className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-red-500 ring-2 ring-white"
      />
    );
  }

  return (
    <span
      className={cn(
        "ml-auto inline-flex items-center justify-center min-w-[18px] h-[18px] px-1.5 text-[10px] font-bold rounded-full",
        active ? "bg-blue-600 text-white" : "bg-red-500 text-white"
      )}
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}

/**
 * Sidebar pill showing the current user's unread notification count
 * (includes voice-note alerts). Polls every 30s + on window focus.
 */
function NotificationsBadge({ collapsed, active }: { collapsed: boolean; active: boolean }) {
  const { user } = useAuth();
  const { data } = useQuery({
    queryKey: ["notifications-unread", user?.id],
    queryFn: async () => {
      const r = await fetch(`/api/notifications?userId=${user?.id}&unreadOnly=true`);
      const j = await r.json();
      if (!j.success) throw new Error("load_failed");
      return j as { unreadCount: number };
    },
    enabled: !!user?.id,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
    staleTime: 10_000,
  });

  const count = data?.unreadCount ?? 0;
  if (count === 0) return null;

  if (collapsed) {
    return (
      <span
        aria-label={`${count} unread notification${count === 1 ? "" : "s"}`}
        className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-red-500 ring-2 ring-white"
      />
    );
  }

  return (
    <span
      className={cn(
        "ml-auto inline-flex items-center justify-center min-w-[18px] h-[18px] px-1.5 text-[10px] font-bold rounded-full",
        active ? "bg-blue-600 text-white" : "bg-red-500 text-white"
      )}
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}

export function useSidebarWidth() {
  const [width, setWidth] = useState(240);
  useEffect(() => {
    const onResize = () => {
      if (window.innerWidth < 768) setWidth(0);
      else if (window.innerWidth < 1024) setWidth(72);
      else setWidth(240);
    };
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return width;
}
