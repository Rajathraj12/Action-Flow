import { Link, useLocation } from "@tanstack/react-router";
import { MessageSquare, CheckSquare, LayoutDashboard, Settings, LogOut } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/context/AuthContext";

export function SidebarNav() {
  const location = useLocation();
  const currentPath = location.pathname;
  const { user, logout } = useAuth();

  return (
    <nav className="hidden w-16 shrink-0 flex-col items-center gap-2 bg-rail pb-5 text-rail-foreground md:flex">
      <div className="flex h-16 w-full items-center justify-center shrink-0 mb-2">
        <div className="h-10 w-10 shrink-0 overflow-hidden">
          <img src="/icon.png" alt="ActionFlow Icon" className="h-full w-full object-contain" />
        </div>
      </div>
      
      <NavButton to="/" icon={<MessageSquare className="h-5 w-5" />} active={currentPath === "/"} ariaLabel="Chat" />
      <NavButton to="/tasks" icon={<CheckSquare className="h-5 w-5" />} active={currentPath === "/tasks"} ariaLabel="My Tasks" />
      <NavButton to="/dashboard" icon={<LayoutDashboard className="h-5 w-5" />} active={currentPath === "/dashboard"} ariaLabel="Manager Dashboard" />

      <div className="mt-auto flex flex-col items-center gap-2">
        <NavButton to="/settings" icon={<Settings className="h-5 w-5" />} active={currentPath === "/settings"} ariaLabel="Settings" />

        {user && (
          <div className="relative group flex items-center justify-center pt-2 border-t border-rail-foreground/10">
            <button
              onClick={() => logout()}
              aria-label={`Logged in as ${user.displayName}. Click to log out.`}
              className="relative grid h-10 w-10 place-items-center rounded-full bg-rail-foreground/20 text-xs font-bold text-rail-foreground hover:bg-rail-foreground/30 transition-colors"
            >
              {user.initials || "U"}
              <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border border-rail bg-emerald-500" />
            </button>
            <div className="absolute left-full ml-2 px-2.5 py-1.5 rounded-md bg-foreground text-background text-xs font-medium opacity-0 transition-opacity group-hover:opacity-100 pointer-events-none z-50 whitespace-nowrap shadow-md">
              <span className="font-semibold">{user.displayName}</span>
              <span className="block text-[10px] text-muted-foreground">Click to log out</span>
            </div>
          </div>
        )}
      </div>
    </nav>
  );
}

function NavButton({ to, icon, active, ariaLabel }: { to: string, icon: React.ReactNode, active: boolean, ariaLabel: string }) {
  return (
    <div className="relative group flex items-center justify-center">
      <Link 
        to={to} 
        aria-label={ariaLabel}
        className={cn(
          "grid h-11 w-11 place-items-center rounded-xl transition-colors",
          active
            ? "bg-rail-foreground/15 text-rail-foreground"
            : "text-rail-foreground/60 hover:bg-rail-foreground/10 hover:text-rail-foreground"
        )}
      >
        {icon}
      </Link>
      <div className="absolute left-full ml-2 px-2.5 py-1.5 rounded-md bg-foreground text-background text-xs font-medium opacity-0 transition-opacity group-hover:opacity-100 pointer-events-none z-50 whitespace-nowrap shadow-md">
        {ariaLabel}
      </div>
    </div>
  );
}
