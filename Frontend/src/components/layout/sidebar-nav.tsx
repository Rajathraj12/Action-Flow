import { Link, useLocation } from "@tanstack/react-router";
import { MessageSquare, CheckSquare, LayoutDashboard, Settings, LogOut, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/context/AuthContext";

export function SidebarNav() {
  const location = useLocation();
  const currentPath = location.pathname;
  const { user, logout } = useAuth();

  return (
    <nav className="hidden w-[4.25rem] shrink-0 flex-col items-center gap-2.5 bg-rail/95 backdrop-blur-md pb-5 text-rail-foreground md:flex border-r border-rail-foreground/10 select-none shadow-xl z-20">
      {/* Brand Icon with ambient glow */}
      <div className="flex h-16 w-full items-center justify-center shrink-0 mb-1">
        <Link 
          to="/" 
          className="group relative flex h-10 w-10 items-center justify-center rounded-xl bg-primary/20 p-2 transition-all duration-300 hover:bg-primary/30 hover:scale-105 hover:shadow-[0_0_15px_rgba(0,168,132,0.35)]"
          aria-label="ActionFlow Home"
        >
          <img 
            src="/icon.png" 
            alt="ActionFlow Icon" 
            className="h-full w-full object-contain transition-transform duration-300 group-hover:rotate-6" 
          />
        </Link>
      </div>
      
      {/* Navigation Links */}
      <div className="flex flex-col items-center gap-2 w-full px-2">
        <NavButton to="/" icon={<MessageSquare className="h-5 w-5" />} active={currentPath === "/"} ariaLabel="Chat" />
        <NavButton to="/tasks" icon={<CheckSquare className="h-5 w-5" />} active={currentPath === "/tasks"} ariaLabel="My Tasks" />
        <NavButton to="/dashboard" icon={<LayoutDashboard className="h-5 w-5" />} active={currentPath === "/dashboard"} ariaLabel="Manager Dashboard" />
      </div>

      {/* Footer Navigation: Settings & Profile */}
      <div className="mt-auto flex flex-col items-center gap-2.5 w-full px-2">
        <NavButton to="/settings" icon={<Settings className="h-5 w-5" />} active={currentPath === "/settings"} ariaLabel="Settings" />

        {user && (
          <div className="relative group flex items-center justify-center pt-3 mt-1 border-t border-rail-foreground/15 w-full">
            <button
              onClick={() => logout()}
              aria-label={`Logged in as ${user.displayName}. Click to log out.`}
              className="relative grid h-10 w-10 place-items-center rounded-full bg-gradient-to-tr from-primary/30 to-rail-foreground/20 text-xs font-bold text-rail-foreground transition-all duration-200 hover:scale-105 hover:shadow-md cursor-pointer"
            >
              <span className="tracking-tight">{user.initials || "U"}</span>
              
              {/* Online indicator with pulsing ping wave */}
              <span className="absolute -bottom-0.5 -right-0.5 flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500 border-2 border-rail" />
              </span>
            </button>

            {/* User Profile Tooltip */}
            <div className="absolute left-full ml-3 px-3 py-2 rounded-xl bg-card border border-border text-foreground text-xs shadow-xl opacity-0 translate-x-1 transition-all duration-200 group-hover:opacity-100 group-hover:translate-x-0 pointer-events-none z-50 whitespace-nowrap min-w-32">
              <div className="flex items-center gap-1.5 font-semibold">
                <span className="truncate">{user.displayName}</span>
              </div>
              <span className="block text-[10px] text-muted-foreground mt-0.5 truncate">{user.email}</span>
              <div className="mt-1 pt-1 border-t border-border/60 flex items-center gap-1 text-[10px] text-destructive font-medium">
                <LogOut className="h-3 w-3" />
                <span>Click to sign out</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </nav>
  );
}

function NavButton({ to, icon, active, ariaLabel }: { to: string, icon: React.ReactNode, active: boolean, ariaLabel: string }) {
  return (
    <div className="relative group flex items-center justify-center w-full">
      {/* Active Glowing Pill Bar on Left */}
      {active && (
        <span className="absolute left-0 h-6 w-1 rounded-r-full bg-primary shadow-[0_0_10px_rgba(0,168,132,0.6)] animate-in fade-in duration-300" />
      )}
      
      <Link 
        to={to} 
        aria-label={ariaLabel}
        className={cn(
          "relative grid h-11 w-11 place-items-center rounded-xl transition-all duration-200",
          active
            ? "bg-rail-foreground/20 text-rail-foreground shadow-sm scale-100 font-semibold"
            : "text-rail-foreground/60 hover:bg-rail-foreground/10 hover:text-rail-foreground hover:scale-105 active:scale-95"
        )}
      >
        {icon}
      </Link>

      {/* Floating Animated Tooltip */}
      <div className="absolute left-full ml-3 px-2.5 py-1.5 rounded-lg bg-card border border-border text-foreground text-xs font-medium opacity-0 translate-x-1 transition-all duration-200 group-hover:opacity-100 group-hover:translate-x-0 pointer-events-none z-50 whitespace-nowrap shadow-lg">
        {ariaLabel}
      </div>
    </div>
  );
}
