import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { Bell, Key, Sparkles, CheckSquare, Users, HelpCircle, Monitor, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [{ title: "Settings — Action Flow" }],
  }),
  component: SettingsPage,
});

type SettingTab = "none" | "Account" | "AI Extractions" | "Task Preferences" | "Notifications" | "Team & Roles" | "Help";

function SettingsPage() {
  const [activeTab, setActiveTab] = useState<SettingTab>("none");

  return (
    <>
      <div className="flex flex-1 h-full w-full">
        {/* Settings List / Sidebar */}
        <aside className="flex w-full flex-col border-r border-border bg-card md:w-[26rem]">
          <header className="flex h-16 items-center gap-4 border-b border-border px-6">
            <h1 className="font-display text-xl font-bold tracking-tight">Settings</h1>
          </header>

        <div className="flex-1 overflow-y-auto py-2">
          {/* Profile Section */}
          <div className="flex items-center gap-4 px-6 py-5 cursor-pointer hover:bg-muted/50 transition-colors">
            <div className="grid h-16 w-16 place-items-center rounded-full bg-primary/12 font-display text-xl font-semibold text-primary">
              SS
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-lg font-semibold truncate">Stephen Smith</h2>
              <p className="text-sm text-muted-foreground truncate">Available</p>
            </div>
          </div>

          <div className="h-2 w-full bg-muted/30" />

          {/* Settings Items */}
          <div className="py-2">
            <SettingsItem icon={<Key className="h-5 w-5" />} title="Account" description="Profile details, security, preferences" active={activeTab === "Account"} onClick={() => setActiveTab("Account")} />
            <SettingsItem icon={<Sparkles className="h-5 w-5" />} title="AI Extractions" description="LLM settings, auto-tagging, approvals" active={activeTab === "AI Extractions"} onClick={() => setActiveTab("AI Extractions")} />
            <SettingsItem icon={<CheckSquare className="h-5 w-5" />} title="Task Preferences" description="Custom statuses, default priorities" active={activeTab === "Task Preferences"} onClick={() => setActiveTab("Task Preferences")} />
            <SettingsItem icon={<Bell className="h-5 w-5" />} title="Notifications" description="Deadlines, new assignments, approvals" active={activeTab === "Notifications"} onClick={() => setActiveTab("Notifications")} />
            <SettingsItem icon={<Users className="h-5 w-5" />} title="Team & Roles" description="Manager access, workspace members" active={activeTab === "Team & Roles"} onClick={() => setActiveTab("Team & Roles")} />
            <SettingsItem icon={<HelpCircle className="h-5 w-5" />} title="Help" description="Documentation, contact support" active={activeTab === "Help"} onClick={() => setActiveTab("Help")} />
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <section className="hidden flex-1 flex-col bg-muted/10 md:flex overflow-y-auto">
        {activeTab === "none" && (
          <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
            <img src="/logo.png" alt="ActionFlow" className="h-10 mb-4 object-contain" />
            <p className="text-sm text-muted-foreground leading-relaxed max-w-md">
              Personalize your workspace. Select a setting from the menu to customize your preferences, notifications, and security.
            </p>
          </div>
        )}

        {activeTab === "Account" && (
          <SettingsDetail title="Account">
            <h3 className="px-6 pt-4 pb-2 text-sm font-semibold text-muted-foreground uppercase tracking-wider">Appearance</h3>
            <ThemeToggleOption title="Dark Mode" description="Switch between light and dark theme for the whole website" />
            
            <h3 className="px-6 pt-6 pb-2 text-sm font-semibold text-muted-foreground uppercase tracking-wider">Security</h3>
            <ListOption title="Email address" value="stephen.smith@example.com" />
            <ListOption title="Two-step verification" />
            <ListOption title="Active sessions" value="1 device" />
            <ListOption title="Delete account" danger />
          </SettingsDetail>
        )}

        {activeTab === "AI Extractions" && (
          <SettingsDetail title="AI Task Extractions">
            <h3 className="px-6 pt-4 pb-2 text-sm font-semibold text-muted-foreground uppercase tracking-wider">Extraction Settings</h3>
            <ToggleOption title="Enable AI Extraction" description="Allow LLM to scan group chats for potential work assignments" defaultChecked />
            <ToggleOption title="Require Manager Approval" description="Send extracted tasks to Manager Dashboard for review before creation" defaultChecked />
            
            <h3 className="px-6 pt-6 pb-2 text-sm font-semibold text-muted-foreground uppercase tracking-wider">Smart Tagging</h3>
            <ToggleOption title="Auto-assign priorities" description="AI will determine task priority based on message urgency" defaultChecked />
            <ToggleOption title="Detect deadlines" description="Automatically extract due dates from conversation context" defaultChecked />
          </SettingsDetail>
        )}

        {activeTab === "Task Preferences" && (
          <SettingsDetail title="Task Preferences">
            <h3 className="px-6 pt-4 pb-2 text-sm font-semibold text-muted-foreground uppercase tracking-wider">Defaults</h3>
            <ListOption title="Default Priority" value="Medium" />
            <ListOption title="Default Assignee" value="Self" />
            
            <h3 className="px-6 pt-6 pb-2 text-sm font-semibold text-muted-foreground uppercase tracking-wider">Lifecycle</h3>
            <ToggleOption title="Auto-archive completed" description="Move tasks to archive 7 days after completion" defaultChecked />
            <ListOption title="Custom Statuses" value="4 active" />
          </SettingsDetail>
        )}

        {activeTab === "Notifications" && (
          <SettingsDetail title="Notifications">
            <h3 className="px-6 pt-4 pb-2 text-sm font-semibold text-muted-foreground uppercase tracking-wider">Tasks & Deadlines</h3>
            <ToggleOption title="New assignments" description="Notify me when I am assigned a new task" defaultChecked />
            <ListOption title="Deadline reminders" value="24 hours before" />
            
            <h3 className="px-6 pt-6 pb-2 text-sm font-semibold text-muted-foreground uppercase tracking-wider">Manager Alerts</h3>
            <ToggleOption title="Pending AI Approvals" description="Notify when new AI extractions need review" defaultChecked />
            <ToggleOption title="Overdue tasks" description="Weekly digest of team's overdue tasks" defaultChecked />
          </SettingsDetail>
        )}

        {activeTab === "Team & Roles" && (
          <SettingsDetail title="Team & Roles">
            <h3 className="px-6 pt-4 pb-2 text-sm font-semibold text-muted-foreground uppercase tracking-wider">Workspace</h3>
            <ListOption title="Workspace Name" value="Acme Corp" />
            <ListOption title="Members" value="8 active" />
            
            <h3 className="px-6 pt-6 pb-2 text-sm font-semibold text-muted-foreground uppercase tracking-wider">Permissions</h3>
            <ListOption title="Manager Dashboard Access" value="Admins only" />
            <ToggleOption title="Allow guest invites" description="Team members can invite external guests to chats" />
          </SettingsDetail>
        )}

        {activeTab === "Help" && (
          <SettingsDetail title="Help">
            <ListOption title="Help center" />
            <ListOption title="ActionFlow Documentation" />
            <ListOption title="Contact support" description="Questions? Need help?" />
            <ListOption title="Terms and Privacy Policy" />
          </SettingsDetail>
        )}
      </section>
      </div>
    </>
  );
}

function SettingsDetail({ title, children }: { title: string, children: React.ReactNode }) {
  return (
    <div className="flex h-full flex-col bg-card animate-in fade-in slide-in-from-right-4 duration-300">
      <header className="flex h-16 shrink-0 items-center border-b border-border">
        <div className="mx-auto w-full max-w-3xl px-6">
          <h2 className="text-xl font-bold font-display text-center">{title}</h2>
        </div>
      </header>
      <div className="flex-1 overflow-y-auto pb-10">
        <div className="mx-auto w-full max-w-3xl">
          {children}
        </div>
      </div>
    </div>
  );
}

function ListOption({ title, description, value, danger }: { title: string, description?: string, value?: string, danger?: boolean }) {
  return (
    <div className="flex w-full items-center justify-between px-6 py-4 cursor-pointer hover:bg-muted/50 transition-colors">
      <div className="flex flex-col gap-0.5 min-w-0 pr-4">
        <span className={cn("text-base", danger ? "text-red-500" : "text-foreground")}>{title}</span>
        {description && <span className="text-sm text-muted-foreground">{description}</span>}
      </div>
      <div className="flex items-center gap-3 shrink-0">
        {value && <span className="text-sm text-muted-foreground">{value}</span>}
        <ChevronRight className="h-4 w-4 text-muted-foreground/50" />
      </div>
    </div>
  );
}

function ToggleOption({ title, description, defaultChecked }: { title: string, description: string, defaultChecked?: boolean }) {
  const [checked, setChecked] = useState(defaultChecked);
  return (
    <div className="flex w-full items-center justify-between px-6 py-4 cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => setChecked(!checked)}>
      <div className="flex flex-col gap-0.5 min-w-0 pr-4">
        <span className="text-base text-foreground">{title}</span>
        <span className="text-sm text-muted-foreground">{description}</span>
      </div>
      <div className="shrink-0">
        <div className={cn("h-6 w-11 rounded-full border-2 border-transparent transition-colors", checked ? "bg-primary" : "bg-muted")}>
          <div className={cn("h-5 w-5 rounded-full bg-background shadow-sm transition-transform", checked ? "translate-x-5" : "translate-x-0")} />
        </div>
      </div>
    </div>
  );
}

function ThemeToggleOption({ title, description }: { title: string, description: string }) {
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    setIsDark(document.documentElement.classList.contains("dark"));
  }, []);

  const toggleTheme = () => {
    const nextTheme = !isDark;
    setIsDark(nextTheme);
    if (nextTheme) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  };

  return (
    <div className="flex w-full items-center justify-between px-6 py-4 cursor-pointer hover:bg-muted/50 transition-colors" onClick={toggleTheme}>
      <div className="flex flex-col gap-0.5 min-w-0 pr-4">
        <span className="text-base text-foreground">{title}</span>
        <span className="text-sm text-muted-foreground">{description}</span>
      </div>
      <div className="shrink-0">
        <div className={cn("h-6 w-11 rounded-full border-2 border-transparent transition-colors", isDark ? "bg-primary" : "bg-muted")}>
          <div className={cn("h-5 w-5 rounded-full bg-background shadow-sm transition-transform", isDark ? "translate-x-5" : "translate-x-0")} />
        </div>
      </div>
    </div>
  );
}

function SettingsItem({ icon, title, description, active, onClick }: { icon: React.ReactNode; title: string; description: string; active?: boolean; onClick?: () => void }) {
  return (
    <button 
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-5 px-6 py-4 text-left transition-colors hover:bg-muted",
        active && "bg-muted"
      )}
    >
      <div className={cn("text-muted-foreground transition-colors", active && "text-primary")}>
        {icon}
      </div>
      <div className="flex-1 min-w-0 border-b border-border/40 pb-4 -mb-4">
        <div className={cn("text-base font-medium transition-colors", active && "text-primary")}>{title}</div>
        <div className="text-sm text-muted-foreground mt-0.5">{description}</div>
      </div>
    </button>
  );
}
