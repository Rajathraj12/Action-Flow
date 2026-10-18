import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  ArrowLeft,
  Check,
  X,
  Sparkles,
  Users,
  LayoutDashboard,
  MessageSquare,
  CheckCircle2,
  TrendingUp,
  Calendar,
  Clock,
  Zap,
  AlertTriangle,
  Layers,
  BarChart3,
  Loader2,
  ShieldAlert,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/context/AuthContext";
import { useWorkspace } from "@/context/WorkspaceContext";
import { api, type TaskSummaryResponse } from "@/lib/api";

export const Route = createFileRoute("/dashboard")({
  head: () => ({
    meta: [{ title: "Manager Dashboard — ActionFlow" }],
  }),
  component: DashboardPage,
});

interface AISuggestion {
  id: string;
  title: string;
  assignee: string;
  assigneeInitials: string;
  deadline: string;
  source: string;
  context: string;
  confidence: number;
}

const INITIAL_SUGGESTIONS: AISuggestion[] = [
  {
    id: "sug-1",
    title: "Verify Firebase session persistence across browser refreshes",
    assignee: "Rajath",
    assigneeInitials: "R",
    deadline: "Tomorrow at 5:00 PM",
    source: "Chat with Ankit",
    context: "Can you make sure the token stays active in localStorage so connections aren't lost on reload?",
    confidence: 96,
  },
  {
    id: "sug-2",
    title: "Configure MongoDB Atlas automatic connection retries in production",
    assignee: "Ankit",
    assigneeInitials: "A",
    deadline: "Friday, 6:00 PM",
    source: "Sprint Planning",
    context: "We should increase the Atlas connection timeout to 15s to handle cold starts smoothly.",
    confidence: 92,
  },
  {
    id: "sug-3",
    title: "Design glassmorphic chat thread reaction picker and animations",
    assignee: "Chirag",
    assigneeInitials: "C",
    deadline: "Monday, 12:00 PM",
    source: "UI/UX Review",
    context: "Let's add quick emoji reaction pills on message hover like WhatsApp and Slack.",
    confidence: 89,
  },
];

function DashboardPage() {
  const { user, token } = useAuth();
  const { activeWorkspace, role } = useWorkspace();

  const [aiSuggestions, setAiSuggestions] = useState<AISuggestion[]>(INITIAL_SUGGESTIONS);
  const [approvedCount, setApprovedCount] = useState(4);
  const [actionNotice, setActionNotice] = useState<string | null>(null);

  // Real Workspace Task Summary State
  const [taskSummary, setTaskSummary] = useState<TaskSummaryResponse["summary"] | null>(null);
  const [loadingSummary, setLoadingSummary] = useState(true);
  const [summaryError, setSummaryError] = useState<string | null>(null);

  useEffect(() => {
    if (!token || !activeWorkspace?.id) return;
    setLoadingSummary(true);
    setSummaryError(null);

    api
      .getTaskSummary(activeWorkspace.id)
      .then((res) => {
        setTaskSummary(res.summary);
      })
      .catch((err) => {
        console.warn("[DashboardPage] Task summary error:", err.message);
        setSummaryError(err.message || "Failed to load workspace task summary");
      })
      .finally(() => {
        setLoadingSummary(false);
      });
  }, [token, activeWorkspace?.id]);

  const handleApprove = (id: string, title: string) => {
    setAiSuggestions((prev) => prev.filter((s) => s.id !== id));
    setApprovedCount((c) => c + 1);
    setActionNotice(`Approved task: "${title.slice(0, 32)}..."`);
    setTimeout(() => setActionNotice(null), 3500);
  };

  const handleReject = (id: string, title: string) => {
    setAiSuggestions((prev) => prev.filter((s) => s.id !== id));
    setActionNotice(`Dismissed AI suggestion`);
    setTimeout(() => setActionNotice(null), 3500);
  };

  const totalTasks = taskSummary?.totalTasks ?? 0;
  const activeTasks = taskSummary?.activeTasks ?? 0;
  const completedTasks = taskSummary?.completedTasks ?? 0;
  const overdueTasks = taskSummary?.overdueTasks ?? 0;

  return (
    <div className="flex flex-col flex-1 h-full w-full bg-background relative overflow-hidden">
      {/* Ambient background glow */}
      <div className="pointer-events-none absolute -top-40 -right-40 h-96 w-96 rounded-full bg-primary/10 blur-3xl" />
      <div className="pointer-events-none absolute top-1/2 -left-40 h-96 w-96 rounded-full bg-purple-500/10 blur-3xl" />

      {/* Header */}
      <header className="flex h-16 shrink-0 items-center justify-between border-b border-border/80 bg-card/60 backdrop-blur-md px-6 z-10">
        <div className="flex items-center gap-3">
          <div className="grid h-9 w-9 place-items-center rounded-xl bg-primary/15 text-primary shadow-xs">
            <LayoutDashboard className="h-5 w-5" />
          </div>
          <div>
            <h1 className="font-display text-lg font-bold tracking-tight text-foreground">
              Manager Dashboard
            </h1>
            <p className="text-[11px] text-muted-foreground hidden sm:block">
              {activeWorkspace?.name || "Workspace"} • Task metrics & team workload
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            Live Analytics
          </span>
        </div>
      </header>

      {/* Toast Notice */}
      {actionNotice && (
        <div className="absolute top-20 right-6 z-50 rounded-xl bg-card border border-border shadow-xl px-4 py-2.5 text-xs font-medium text-foreground flex items-center gap-2 animate-in fade-in slide-in-from-top-2">
          <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          {actionNotice}
        </div>
      )}

      <main className="flex-1 overflow-y-auto p-6 md:p-8 z-10 custom-scrollbar">
        <div className="mx-auto max-w-5xl space-y-8">
          {/* Permission / RBAC notice if restricted */}
          {summaryError && summaryError.includes("Forbidden") && (
            <div className="flex items-center gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-xs text-amber-700 dark:text-amber-400">
              <ShieldAlert className="h-5 w-5 shrink-0" />
              <span>
                Workspace-wide task summary is restricted to workspace Managers, Admins, and Owners. You are currently viewing with Member permissions.
              </span>
            </div>
          )}

          {/* Real Workspace Task Stats */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-4">
            <StatCard
              icon={<LayoutDashboard className="h-5 w-5" />}
              title="Active Tasks"
              value={loadingSummary ? "..." : activeTasks.toString()}
              change={totalTasks > 0 ? `${Math.round((activeTasks / totalTasks) * 100)}% of total` : "0%"}
              accent="primary"
            />
            <StatCard
              icon={<CheckCircle2 className="h-5 w-5" />}
              title="Tasks Completed"
              value={loadingSummary ? "..." : completedTasks.toString()}
              change={totalTasks > 0 ? `${Math.round((completedTasks / totalTasks) * 100)}% completion` : "0%"}
              accent="emerald"
            />
            <StatCard
              icon={<AlertTriangle className="h-5 w-5" />}
              title="Overdue Tasks"
              value={loadingSummary ? "..." : overdueTasks.toString()}
              change={overdueTasks > 0 ? "Requires attention" : "All on schedule"}
              accent="rose"
              highlight={overdueTasks > 0}
            />
            <StatCard
              icon={<Layers className="h-5 w-5" />}
              title="Total Tasks"
              value={loadingSummary ? "..." : totalTasks.toString()}
              change={`${activeWorkspace?.name || "Workspace"} scope`}
              accent="blue"
            />
          </div>

          {/* Real Workspace Task Breakdown: Status & Priority */}
          {taskSummary && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {/* Grouped by Status */}
              <div className="rounded-2xl border border-border/80 bg-card/80 p-5 shadow-xs backdrop-blur-sm space-y-4">
                <div className="flex items-center justify-between border-b border-border/60 pb-3">
                  <div className="flex items-center gap-2">
                    <BarChart3 className="h-4 w-4 text-primary" />
                    <h3 className="text-sm font-bold text-foreground font-display">
                      Tasks Grouped by Status
                    </h3>
                  </div>
                  <span className="text-xs text-muted-foreground font-semibold">
                    {totalTasks} total
                  </span>
                </div>

                <div className="space-y-3 pt-1">
                  {[
                    { key: "TODO", label: "To Do", count: taskSummary.statusBreakdown.TODO, color: "bg-slate-500", text: "text-slate-500" },
                    { key: "IN_PROGRESS", label: "In Progress", count: taskSummary.statusBreakdown.IN_PROGRESS, color: "bg-amber-500", text: "text-amber-500" },
                    { key: "IN_REVIEW", label: "In Review", count: taskSummary.statusBreakdown.IN_REVIEW, color: "bg-purple-500", text: "text-purple-500" },
                    { key: "DONE", label: "Done", count: taskSummary.statusBreakdown.DONE, color: "bg-emerald-500", text: "text-emerald-500" },
                  ].map((item) => {
                    const pct = totalTasks > 0 ? Math.round((item.count / totalTasks) * 100) : 0;
                    return (
                      <div key={item.key} className="space-y-1.5">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-semibold text-foreground flex items-center gap-1.5">
                            <span className={cn("h-2 w-2 rounded-full", item.color)} />
                            {item.label}
                          </span>
                          <span className="text-muted-foreground">
                            <strong className="text-foreground">{item.count}</strong> ({pct}%)
                          </span>
                        </div>
                        <div className="h-2 w-full rounded-full bg-muted/60 overflow-hidden">
                          <div
                            className={cn("h-full rounded-full transition-all duration-500", item.color)}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Grouped by Priority */}
              <div className="rounded-2xl border border-border/80 bg-card/80 p-5 shadow-xs backdrop-blur-sm space-y-4">
                <div className="flex items-center justify-between border-b border-border/60 pb-3">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-primary" />
                    <h3 className="text-sm font-bold text-foreground font-display">
                      Tasks Grouped by Priority
                    </h3>
                  </div>
                  <span className="text-xs text-muted-foreground font-semibold">
                    {totalTasks} total
                  </span>
                </div>

                <div className="space-y-3 pt-1">
                  {[
                    { key: "URGENT", label: "Urgent", count: taskSummary.priorityBreakdown.URGENT, color: "bg-rose-500", text: "text-rose-500" },
                    { key: "HIGH", label: "High", count: taskSummary.priorityBreakdown.HIGH, color: "bg-amber-500", text: "text-amber-500" },
                    { key: "MEDIUM", label: "Medium", count: taskSummary.priorityBreakdown.MEDIUM, color: "bg-sky-500", text: "text-sky-500" },
                    { key: "LOW", label: "Low", count: taskSummary.priorityBreakdown.LOW, color: "bg-slate-400", text: "text-slate-400" },
                  ].map((item) => {
                    const pct = totalTasks > 0 ? Math.round((item.count / totalTasks) * 100) : 0;
                    return (
                      <div key={item.key} className="space-y-1.5">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-semibold text-foreground flex items-center gap-1.5">
                            <span className={cn("h-2 w-2 rounded-full", item.color)} />
                            {item.label}
                          </span>
                          <span className="text-muted-foreground">
                            <strong className="text-foreground">{item.count}</strong> ({pct}%)
                          </span>
                        </div>
                        <div className="h-2 w-full rounded-full bg-muted/60 overflow-hidden">
                          <div
                            className={cn("h-full rounded-full transition-all duration-500", item.color)}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* Workload Grouped by Assignee */}
          {taskSummary && taskSummary.assigneeWorkload.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between border-b border-border pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="grid h-8 w-8 place-items-center rounded-lg bg-primary/15 text-primary">
                    <Users className="h-4 w-4" />
                  </div>
                  <div>
                    <h2 className="text-base font-bold font-display text-foreground">
                      Team Workload by Assignee
                    </h2>
                    <p className="text-xs text-muted-foreground">
                      Real-time distribution of active and completed tasks across workspace members.
                    </p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3.5">
                {taskSummary.assigneeWorkload.map((w) => {
                  const totalMemberTasks = w.activeTasks + w.completedTasks;
                  const memberPct = totalMemberTasks > 0 ? Math.round((w.completedTasks / totalMemberTasks) * 100) : 0;
                  return (
                    <div
                      key={w.assignee?.id || "unassigned"}
                      className="rounded-2xl border border-border/80 bg-card/90 p-4 shadow-xs backdrop-blur-sm space-y-3"
                    >
                      <div className="flex items-center gap-2.5">
                        <div className="grid h-9 w-9 place-items-center rounded-xl bg-primary/20 text-xs font-bold text-primary">
                          {w.assignee?.displayName?.charAt(0) || "U"}
                        </div>
                        <div className="min-w-0 flex-1">
                          <h4 className="text-xs font-bold text-foreground truncate">
                            {w.assignee?.displayName || "Unassigned"}
                          </h4>
                          <p className="text-[10px] text-muted-foreground truncate">
                            {w.assignee?.email || "No email"}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center justify-between text-xs pt-1 border-t border-border/50">
                        <span className="text-muted-foreground">Active Tasks:</span>
                        <span className="font-bold text-primary">{w.activeTasks}</span>
                      </div>

                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">Completed:</span>
                        <span className="font-bold text-emerald-600 dark:text-emerald-400">
                          {w.completedTasks}
                        </span>
                      </div>

                      <div className="h-1.5 w-full rounded-full bg-muted/60 overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-primary to-emerald-500 rounded-full"
                          style={{ width: `${memberPct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* AI Task Approvals Section */}
          <div className="space-y-4 pt-2">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-border pb-3">
              <div className="flex items-center gap-2.5">
                <div className="grid h-8 w-8 place-items-center rounded-lg bg-purple-500/15 text-purple-600 dark:text-purple-400">
                  <Sparkles className="h-4 w-4" />
                </div>
                <div>
                  <h2 className="text-base font-bold font-display text-foreground">
                    ActionFlow AI Extractions
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    Tasks automatically detected from recent conversation context.
                  </p>
                </div>
              </div>

              {aiSuggestions.length > 0 && (
                <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-purple-500/10 text-purple-600 dark:text-purple-400 self-start sm:self-auto">
                  {aiSuggestions.length} pending review
                </span>
              )}
            </div>

            <div className="grid gap-3.5 pt-1">
              {aiSuggestions.map((suggestion) => (
                <ApprovalCard
                  key={suggestion.id}
                  suggestion={suggestion}
                  onApprove={() => handleApprove(suggestion.id, suggestion.title)}
                  onReject={() => handleReject(suggestion.id, suggestion.title)}
                />
              ))}

              {aiSuggestions.length === 0 && (
                <div className="rounded-2xl border border-dashed border-border/80 bg-card/40 p-12 text-center flex flex-col items-center justify-center gap-3 backdrop-blur-xs">
                  <div className="grid h-12 w-12 place-items-center rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                    <CheckCircle2 className="h-6 w-6" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-foreground text-base">
                      All AI suggestions reviewed!
                    </h3>
                    <p className="text-xs text-muted-foreground mt-1 max-w-sm">
                      ActionFlow AI will continue scanning chat threads for commitments, deadlines, and deliverables.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setAiSuggestions(INITIAL_SUGGESTIONS)}
                    className="mt-2 text-xs font-semibold text-primary hover:underline cursor-pointer"
                  >
                    Reset demo suggestions
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

function StatCard({
  icon,
  title,
  value,
  change,
  accent,
  highlight,
}: {
  icon: React.ReactNode;
  title: string;
  value: string;
  change: string;
  accent: "primary" | "blue" | "purple" | "emerald" | "rose";
  highlight?: boolean;
}) {
  const accentClasses = {
    primary: "bg-primary/15 text-primary border-primary/20",
    blue: "bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/20",
    purple: "bg-purple-500/15 text-purple-600 dark:text-purple-400 border-purple-500/20",
    emerald: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
    rose: "bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/20",
  }[accent];

  return (
    <div
      className={cn(
        "group relative flex flex-col justify-between rounded-2xl border border-border/80 bg-card/80 p-5 shadow-xs backdrop-blur-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-lg hover:border-primary/40",
        highlight && "ring-1 ring-rose-500/30"
      )}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-muted-foreground">{title}</span>
        <div
          className={cn(
            "grid h-10 w-10 place-items-center rounded-xl border shadow-xs transition-transform duration-300 group-hover:scale-110",
            accentClasses
          )}
        >
          {icon}
        </div>
      </div>

      <div className="mt-4">
        <div className="text-2xl font-bold font-display tracking-tight text-foreground">
          {value}
        </div>
        <div className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground">
          <TrendingUp className="h-3 w-3 text-emerald-500" />
          <span>{change}</span>
        </div>
      </div>
    </div>
  );
}

function ApprovalCard({
  suggestion,
  onApprove,
  onReject,
}: {
  suggestion: AISuggestion;
  onApprove: () => void;
  onReject: () => void;
}) {
  return (
    <div className="group relative flex flex-col gap-4 rounded-2xl border border-border/80 bg-card/90 p-5 shadow-xs backdrop-blur-sm transition-all duration-300 hover:shadow-md hover:border-border md:flex-row md:items-center md:justify-between animate-in fade-in slide-in-from-bottom-2">
      <div className="space-y-2.5 flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1 rounded-full bg-purple-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-purple-600 dark:text-purple-400 border border-purple-500/20">
            <Sparkles className="h-3 w-3" />
            {suggestion.confidence}% confidence
          </span>
          <span className="text-xs text-muted-foreground flex items-center gap-1 font-medium">
            <MessageSquare className="h-3 w-3" />
            {suggestion.source}
          </span>
        </div>

        <h3 className="text-base font-bold text-foreground group-hover:text-primary transition-colors">
          {suggestion.title}
        </h3>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <div className="grid h-5 w-5 place-items-center rounded-full bg-primary/20 text-[10px] font-bold text-primary">
              {suggestion.assigneeInitials}
            </div>
            <span>
              Assignee: <strong className="text-foreground">{suggestion.assignee}</strong>
            </span>
          </div>

          <div className="flex items-center gap-1">
            <Clock className="h-3.5 w-3.5 text-muted-foreground" />
            <span>
              Deadline: <strong className="text-foreground">{suggestion.deadline}</strong>
            </span>
          </div>
        </div>

        <div className="rounded-xl bg-muted/40 p-3 text-xs italic text-muted-foreground border-l-2 border-primary/40 leading-relaxed">
          "{suggestion.context}"
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2 md:flex-col md:w-32 pt-2 md:pt-0">
        <button
          type="button"
          onClick={onApprove}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground shadow-xs hover:bg-primary/90 transition-all active:scale-95 md:w-full cursor-pointer"
        >
          <Check className="h-3.5 w-3.5" />
          Approve
        </button>
        <button
          type="button"
          onClick={onReject}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-border bg-card px-4 py-2 text-xs font-semibold text-muted-foreground hover:bg-destructive/10 hover:text-destructive hover:border-destructive/30 transition-all active:scale-95 md:w-full cursor-pointer"
        >
          <X className="h-3.5 w-3.5" />
          Reject
        </button>
      </div>
    </div>
  );
}
