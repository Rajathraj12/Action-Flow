import { useState, useEffect } from "react";
import { Link, useLocation } from "@tanstack/react-router";
import {
  MessageSquare,
  CheckSquare,
  LayoutDashboard,
  Settings,
  LogOut,
  Search,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/context/AuthContext";
import { useWorkspace } from "@/context/WorkspaceContext";

import { NotificationCenter } from "@/components/notifications/NotificationCenter";
import { GlobalSearchModal } from "@/components/search/GlobalSearchModal";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
} from "@/components/ui/tooltip";

export function SidebarNav() {
  const location = useLocation();
  const currentPath = location.pathname;
  const { user, logout } = useAuth();
  const { activeWorkspace, userRole } = useWorkspace();
  const [isSearchOpen, setIsSearchOpen] = useState(false);

  // Collapsible sidebar state with local storage persistence (default: expanded)
  const [isCollapsed, setIsCollapsed] = useState<boolean>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("actionflow_sidebar_collapsed");
      return saved === "true";
    }
    return false;
  });

  const toggleSidebar = () => {
    setIsCollapsed((prev) => {
      const next = !prev;
      if (typeof window !== "undefined") {
        localStorage.setItem("actionflow_sidebar_collapsed", String(next));
      }
      return next;
    });
  };

  // Keyboard shortcuts: Ctrl+K (Search) & Ctrl+B (Toggle Sidebar)
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setIsSearchOpen((prev) => !prev);
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "b") {
        e.preventDefault();
        toggleSidebar();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <TooltipProvider delayDuration={120} skipDelayDuration={40}>
      <nav
        className={cn(
          "relative hidden shrink-0 flex-col bg-gradient-to-b from-rail via-rail/95 to-rail pb-4 text-rail-foreground md:flex border-r border-rail-foreground/10 select-none shadow-2xl z-20 transition-[width] duration-300 ease-[cubic-bezier(0.2,0.8,0.2,1)] overflow-hidden",
          isCollapsed ? "w-[4.5rem]" : "w-64"
        )}
      >
        {/* Ambient background glow */}
        <div className="pointer-events-none absolute -top-12 -left-12 h-32 w-32 rounded-full bg-primary/20 blur-2xl" />
        <div className="pointer-events-none absolute bottom-0 left-0 h-32 w-32 rounded-full bg-teal-500/10 blur-2xl" />

        {/* Brand Header */}
        <div
          className={cn(
            "flex h-16 w-full items-center border-b border-rail-foreground/10 shrink-0",
            isCollapsed ? "justify-center px-0" : "justify-between px-3.5"
          )}
        >
          {isCollapsed ? (
            <SidebarTooltip
              label="Expand Navigation"
              description="Click to expand the full sidebar"
              shortcut="Ctrl+B"
            >
              <button
                type="button"
                onClick={toggleSidebar}
                className="group relative grid h-11 w-11 place-items-center rounded-xl bg-primary/15 border border-primary/30 hover:border-primary/50 hover:bg-primary/25 transition-all duration-200 cursor-pointer shadow-xs hover:scale-105 active:scale-95"
                aria-label="Expand sidebar"
              >
                <img
                  src="/icon.png"
                  alt="ActionFlow Icon"
                  className="h-8 w-8 rounded-lg object-contain group-hover:hidden transition-transform"
                />
                <PanelLeftOpen className="h-5 w-5 hidden group-hover:block text-white transition-transform" />
              </button>
            </SidebarTooltip>
          ) : (
            <>
              <Link to="/" className="flex items-center gap-3 min-w-0 group" aria-label="ActionFlow Home">
                <div className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-xl transition-all duration-300 group-hover:scale-105 group-hover:shadow-[0_0_20px_rgba(0,168,132,0.45)]">
                  <img
                    src="/icon.png"
                    alt="ActionFlow Icon"
                    className="h-full w-full rounded-xl object-contain shadow-sm transition-transform duration-300"
                  />
                </div>
                <div className="flex flex-col min-w-0 transition-all duration-300 ease-in-out whitespace-nowrap overflow-hidden">
                  <span className="font-display text-base font-extrabold tracking-tight text-white block leading-tight">
                    ActionFlow
                  </span>
                  <span className="text-[11px] text-rail-foreground/70 font-medium truncate block">
                    Team Collaboration
                  </span>
                </div>
              </Link>

              <SidebarTooltip
                label="Collapse Navigation"
                description="Minimize sidebar to icon rail"
                shortcut="Ctrl+B"
                side="bottom"
              >
                <button
                  type="button"
                  onClick={toggleSidebar}
                  className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-rail-foreground/60 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                  aria-label="Collapse sidebar"
                >
                  <PanelLeftClose className="h-4.5 w-4.5" />
                </button>
              </SidebarTooltip>
            </>
          )}
        </div>

        {/* Active Workspace Card */}
        <div className={cn("pt-3 pb-1 shrink-0", isCollapsed ? "px-0 flex justify-center" : "px-2.5")}>
          {isCollapsed ? (
            <SidebarTooltip
              label={activeWorkspace?.name || "Soul Business Solutions"}
              badge={userRole || "Member"}
              description="Active Workspace • Click for settings"
            >
              <Link
                to="/settings"
                className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-primary to-emerald-600 text-xs font-black text-white shadow-xs hover:scale-105 hover:shadow-[0_0_14px_rgba(0,168,132,0.4)] transition-all cursor-pointer"
                aria-label="Workspace Settings"
              >
                {activeWorkspace ? activeWorkspace.name.slice(0, 2).toUpperCase() : "SB"}
              </Link>
            </SidebarTooltip>
          ) : (
            <SidebarTooltip
              label="Workspace Settings"
              description="Manage members, permissions & workspace settings"
              side="bottom"
            >
              <Link
                to="/settings"
                className="flex items-center justify-between gap-2.5 rounded-xl border border-rail-foreground/15 bg-white/5 p-2 transition-all duration-200 hover:bg-white/10 hover:border-primary/50 cursor-pointer group shadow-xs w-full"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-primary to-emerald-600 text-xs font-black text-white shadow-xs">
                    {activeWorkspace ? activeWorkspace.name.slice(0, 2).toUpperCase() : "SB"}
                  </div>
                  <div className="min-w-0 transition-all duration-300 ease-in-out whitespace-nowrap overflow-hidden">
                    <span className="font-bold text-xs text-white truncate block leading-tight">
                      {activeWorkspace?.name || "Soul Business Solutions"}
                    </span>
                    <span className="text-[10px] text-rail-foreground/70 flex items-center gap-1 mt-0.5 font-medium">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                      {userRole ? `${userRole}` : "Active"}
                    </span>
                  </div>
                </div>
                <span className="text-[10px] text-rail-foreground/60 group-hover:text-white font-bold px-1.5 py-0.5 rounded bg-white/10 shrink-0">
                  SBS
                </span>
              </Link>
            </SidebarTooltip>
          )}
        </div>

        <div className="h-px w-[calc(100%-1.5rem)] mx-auto bg-rail-foreground/10 my-1.5 shrink-0" />

        {/* Navigation Links */}
        <div className={cn("flex flex-col gap-1 w-full pt-1 shrink-0", isCollapsed ? "px-0" : "px-2.5")}>
          <NavButton
            to="/"
            icon={<MessageSquare className="h-4.5 w-4.5" />}
            label="Messages"
            description="Team conversations, DMs & groups"
            active={currentPath === "/"}
            isCollapsed={isCollapsed}
          />
          <NavButton
            to="/tasks"
            icon={<CheckSquare className="h-4.5 w-4.5" />}
            label="My Tasks"
            description="View, filter & manage assigned tasks"
            active={currentPath === "/tasks"}
            isCollapsed={isCollapsed}
          />
          <NavButton
            to="/dashboard"
            icon={<LayoutDashboard className="h-4.5 w-4.5" />}
            label="Manager Dashboard"
            description="Team workload, deadlines & analytics"
            active={currentPath === "/dashboard"}
            isCollapsed={isCollapsed}
          />
        </div>

        {/* Footer Tools: Global Search, Notification Center, Settings & Profile */}
        <div className={cn("mt-auto flex flex-col gap-1.5 w-full pt-3 border-t border-rail-foreground/10 shrink-0", isCollapsed ? "px-0" : "px-2.5")}>
          {/* Global Search Button */}
          <SidebarTooltip
            label="Global Search"
            description="Quick search across messages, tasks & files"
            shortcut="Ctrl+K"
            enabled={isCollapsed}
          >
            <button
              type="button"
              onClick={() => setIsSearchOpen(true)}
              className={cn(
                "group flex items-center rounded-xl text-xs font-semibold text-rail-foreground/80 hover:bg-white/10 hover:text-white transition-all duration-200 cursor-pointer shadow-xs active:scale-98",
                isCollapsed
                  ? "h-10 w-10 mx-auto justify-center"
                  : "w-full justify-between px-3 py-2.5"
              )}
              aria-label="Global Search"
            >
              <div className={cn("flex items-center min-w-0", isCollapsed ? "justify-center" : "gap-2.5")}>
                <Search className="h-4.5 w-4.5 shrink-0 group-hover:text-primary transition-colors" />
                {!isCollapsed && (
                  <span className="whitespace-nowrap overflow-hidden">
                    Global Search
                  </span>
                )}
              </div>
              {!isCollapsed && (
                <span className="text-[10px] font-mono text-rail-foreground/60 bg-white/10 px-1.5 py-0.5 rounded border border-white/10 shrink-0 group-hover:border-primary/40 group-hover:text-primary transition-colors">
                  Ctrl+K
                </span>
              )}
            </button>
          </SidebarTooltip>

          {/* Central Notification Center */}
          <NotificationCenter isSidebarExpanded={!isCollapsed} />

          {/* Settings Navigation */}
          <NavButton
            to="/settings"
            icon={<Settings className="h-4.5 w-4.5" />}
            label="Settings"
            description="Workspace settings, team & profile"
            badge={!isCollapsed && userRole ? userRole : undefined}
            active={currentPath === "/settings"}
            isCollapsed={isCollapsed}
          />

          {/* User Profile Card */}
          {user && (
            <div className="pt-2 mt-1 border-t border-rail-foreground/15 w-full shrink-0">
              {isCollapsed ? (
                <div className="flex justify-center w-full">
                  <SidebarTooltip
                    label={user.displayName}
                    badge={userRole || "Member"}
                    description="Click to Sign Out"
                  >
                    <button
                      type="button"
                      onClick={() => logout()}
                      aria-label="Sign out"
                      className="group relative grid h-10 w-10 place-items-center rounded-full bg-gradient-to-tr from-primary to-teal-400 text-xs font-bold text-white shadow-xs hover:scale-105 hover:shadow-[0_0_14px_rgba(0,168,132,0.4)] transition-all cursor-pointer"
                    >
                      <span className="group-hover:hidden">{user.initials || "U"}</span>
                      <LogOut className="h-4 w-4 hidden group-hover:block transition-all text-white" />
                      <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-emerald-400 border-2 border-rail shadow-xs" />
                    </button>
                  </SidebarTooltip>
                </div>
              ) : (
                <div className="flex items-center justify-between rounded-xl bg-white/5 border border-rail-foreground/15 p-2 transition-all shadow-xs">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="relative grid h-8 w-8 shrink-0 place-items-center rounded-full bg-gradient-to-tr from-primary to-teal-400 text-xs font-bold text-white shadow-xs">
                      {user.initials || "U"}
                      <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-emerald-400 border-2 border-rail shadow-xs" />
                    </div>
                    <div className="min-w-0 transition-all duration-300 ease-in-out whitespace-nowrap overflow-hidden">
                      <span className="truncate text-xs font-bold text-white block leading-tight">
                        {user.displayName}
                      </span>
                      <span className="truncate text-[10px] text-rail-foreground/70 block mt-0.5 font-medium">
                        {userRole ? `${userRole}` : "Team Member"}
                      </span>
                    </div>
                  </div>

                  <SidebarTooltip
                    label="Sign Out"
                    description="Log out of your session"
                    side="left"
                  >
                    <button
                      type="button"
                      onClick={() => logout()}
                      className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-rail-foreground/60 hover:text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer"
                      aria-label="Sign out"
                    >
                      <LogOut className="h-3.5 w-3.5" />
                    </button>
                  </SidebarTooltip>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Global Search Modal */}
        <GlobalSearchModal isOpen={isSearchOpen} onClose={() => setIsSearchOpen(false)} />
      </nav>
    </TooltipProvider>
  );
}

interface SidebarTooltipProps {
  children: React.ReactNode;
  label: string;
  description?: string;
  shortcut?: string;
  badge?: string;
  side?: "right" | "top" | "bottom" | "left";
  enabled?: boolean;
}

function SidebarTooltip({
  children,
  label,
  description,
  shortcut,
  badge,
  side = "right",
  enabled = true,
}: SidebarTooltipProps) {
  if (!enabled) return <>{children}</>;

  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent
        side={side}
        sideOffset={10}
        className="z-50 flex flex-col gap-1 rounded-xl bg-slate-900/95 px-3 py-2 text-white border border-white/15 shadow-[0_10px_35px_rgba(0,0,0,0.6)] backdrop-blur-xl animate-in fade-in-0 zoom-in-95 pointer-events-none"
      >
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold tracking-tight text-white">{label}</span>
          {badge && (
            <span className="text-[10px] font-semibold text-emerald-300 bg-emerald-500/20 px-1.5 py-0.5 rounded border border-emerald-500/30">
              {badge}
            </span>
          )}
          {shortcut && (
            <span className="text-[10px] font-mono text-slate-400 bg-white/10 px-1.5 py-0.5 rounded border border-white/10 ml-auto font-medium">
              {shortcut}
            </span>
          )}
        </div>
        {description && (
          <span className="text-[11px] text-slate-300 font-normal leading-tight max-w-[210px]">
            {description}
          </span>
        )}
      </TooltipContent>
    </Tooltip>
  );
}

function NavButton({
  to,
  icon,
  label,
  description,
  badge,
  active,
  isCollapsed,
}: {
  to: string;
  icon: React.ReactNode;
  label: string;
  description?: string;
  badge?: string;
  active: boolean;
  isCollapsed: boolean;
}) {
  const content = (
    <Link
      to={to}
      aria-label={label}
      className={cn(
        "relative flex items-center rounded-xl text-xs font-semibold transition-all duration-200 group cursor-pointer active:scale-98",
        isCollapsed
          ? "h-10 w-10 mx-auto justify-center"
          : "w-full justify-between px-3 py-2.5",
        active
          ? isCollapsed
            ? "bg-primary/25 text-primary border border-primary/40 shadow-[0_0_16px_rgba(0,168,132,0.35)]"
            : "bg-gradient-to-r from-primary/30 via-primary/20 to-transparent text-white font-bold border-l-2 border-primary shadow-xs"
          : "text-rail-foreground/70 hover:bg-white/10 hover:text-white"
      )}
    >
      <div className={cn("flex items-center min-w-0", isCollapsed ? "justify-center" : "gap-2.5")}>
        <span
          className={cn(
            "transition-all duration-200 shrink-0 flex items-center justify-center group-hover:scale-110",
            active ? "text-primary" : "text-rail-foreground/70 group-hover:text-white"
          )}
        >
          {icon}
        </span>
        {!isCollapsed && (
          <span className="whitespace-nowrap overflow-hidden transition-colors">
            {label}
          </span>
        )}
      </div>

      {!isCollapsed && badge && (
        <span className="text-[10px] font-bold text-primary bg-primary/20 px-1.5 py-0.5 rounded border border-primary/30 shrink-0">
          {badge}
        </span>
      )}
    </Link>
  );

  return (
    <SidebarTooltip
      label={label}
      description={description}
      badge={badge}
      enabled={isCollapsed}
    >
      {content}
    </SidebarTooltip>
  );
}
