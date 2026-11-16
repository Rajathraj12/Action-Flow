import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
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
  ShieldCheck,
  Pencil,
  Lock,
  RotateCw,
  Flame,
  ArrowUpRight,
  Activity,
  Menu,
} from "lucide-react";
import { openMobileNav } from "@/lib/mobile-nav";
import { cn } from "@/lib/utils";
import { useAuth } from "@/context/AuthContext";
import { useWorkspace } from "@/context/WorkspaceContext";
import { api, type TaskSummaryResponse, type WorkspaceMember } from "@/lib/api";
import { getSocket, initSocketClient, joinWorkspaceRoom, leaveWorkspaceRoom } from "@/lib/socket";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

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
  assigneeId?: string;
  assigneeInitials: string;
  isUnassigned?: boolean;
  deadline: string;
  deadlineDate?: string;
  priority?: string;
  source: string;
  context: string;
  confidence: number;
  messageId?: string;
  conversationId?: string;
}

const DEMO_TEAM_MEMBERS = [
  { name: "Rajath", role: "Owner", initials: "R" },
  { name: "Harsha", role: "Manager", initials: "H" },
  { name: "Ankit", role: "Admin", initials: "A" },
  { name: "Chirag", role: "Member", initials: "C" },
  { name: "Harsh", role: "Member", initials: "H" },
];

function formatDeadlineDisplay(deadline: string, deadlineDate?: string): string {
  if (deadlineDate) {
    const parts = deadlineDate.split("T")[0].split("-");
    if (parts.length === 3) {
      const [y, m, d] = parts;
      const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
      const monthIdx = parseInt(m, 10) - 1;
      if (monthIdx >= 0 && monthIdx < 12) {
        const timePart = deadline.includes(",") ? `, ${deadline.split(",")[1].trim()}` : "";
        return `${d.padStart(2, "0")} ${months[monthIdx]} ${y}${timePart}`;
      }
    }
  }
  return deadline;
}

function DashboardPage() {
  const { user, token } = useAuth();
  const { activeWorkspace, userRole, isOwner, isAdmin, isManager } = useWorkspace();
  const canManageAI = isOwner || isAdmin || isManager;

  // Instant SWR state: Load from session cache immediately (0ms delay)
  const [aiSuggestions, setAiSuggestions] = useState<AISuggestion[]>(() => {
    try {
      const stored = sessionStorage.getItem("actionflow_ai_extractions_cache");
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {}
    return [];
  });

  const [loadingAiSuggestions, setLoadingAiSuggestions] = useState<boolean>(() => {
    try {
      const stored = sessionStorage.getItem("actionflow_ai_extractions_cache");
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) return false;
      }
    } catch {}
    return true;
  });

  const [approvedCount, setApprovedCount] = useState(4);
  const [actionNotice, setActionNotice] = useState<string | null>(null);

  // Edit AI Suggestion Modal State
  const [editingSuggestion, setEditingSuggestion] = useState<AISuggestion | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);

  // Real Workspace Task Summary State
  const [taskSummary, setTaskSummary] = useState<TaskSummaryResponse["summary"] | null>(null);
  const [loadingSummary, setLoadingSummary] = useState(true);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [workspaceMembers, setWorkspaceMembers] = useState<WorkspaceMember[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastSyncedTime, setLastSyncedTime] = useState<Date>(new Date());

  const refreshTaskSummary = useCallback(async () => {
    if (!token || !activeWorkspace?.id) return;
    try {
      const res = await api.getTaskSummary(activeWorkspace.id);
      if (res?.summary) {
        setTaskSummary(res.summary);
        setSummaryError(null);
        setLastSyncedTime(new Date());
      }
    } catch (err: any) {
      console.warn("[DashboardPage] Task summary refresh error:", err.message);
      setSummaryError(err.message || "Failed to load workspace task summary");
    } finally {
      setLoadingSummary(false);
    }
  }, [token, activeWorkspace?.id]);

  const refreshAiExtractions = useCallback(async () => {
    if (!token || !activeWorkspace?.id) return;
    try {
      const res = await api.getAiExtractions(activeWorkspace.id);
      const list = Array.isArray(res.extractions) ? res.extractions : [];

      // Filter out suggestions that the manager previously dismissed in this session
      const dismissedKey = `actionflow_ai_dismissed_${activeWorkspace.id}`;
      let dismissedSet = new Set<string>();
      try {
        const rawDismissed = sessionStorage.getItem(dismissedKey);
        if (rawDismissed) dismissedSet = new Set(JSON.parse(rawDismissed));
      } catch {}

      const filtered = list.filter((s) => !dismissedSet.has(s.id));
      setAiSuggestions(filtered);

      const cacheKey = `actionflow_ai_extractions_${activeWorkspace.id}`;
      try {
        sessionStorage.setItem(cacheKey, JSON.stringify(filtered));
        sessionStorage.setItem("actionflow_ai_extractions_cache", JSON.stringify(filtered));
      } catch {}
    } catch (err: any) {
      console.warn("[DashboardPage] AI extractions refresh error:", err.message);
    } finally {
      setLoadingAiSuggestions(false);
    }
  }, [token, activeWorkspace?.id]);

  const handleManualSync = async () => {
    setIsRefreshing(true);
    await Promise.all([refreshAiExtractions(), refreshTaskSummary()]);
    setTimeout(() => setIsRefreshing(false), 500);
  };

  useEffect(() => {
    if (!token || !activeWorkspace?.id) return;
    setLoadingSummary(true);
    setSummaryError(null);

    // Initial fetch of fresh task metrics and AI extractions
    refreshTaskSummary();
    refreshAiExtractions();

    // Fetch live workspace members for assignment resolution
    api
      .getWorkspaceMembers(activeWorkspace.id)
      .then((res) => {
        setWorkspaceMembers(res.members || []);
      })
      .catch((err) => {
        console.warn("[DashboardPage] Workspace members fetch error:", err.message);
      });

    // Instant SWR local workspace cache check
    const cacheKey = `actionflow_ai_extractions_${activeWorkspace.id}`;
    try {
      const cached = sessionStorage.getItem(cacheKey);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setAiSuggestions(parsed);
          setLoadingAiSuggestions(false);
        }
      }
    } catch {}

    // Ensure socket connection is active for real-time task and AI notifications
    const socket = initSocketClient(token);
    joinWorkspaceRoom(activeWorkspace.id);

    const handleIncomingMessage = (msg: any) => {
      if (
        msg?.aiTaskDetection?.isTaskCandidate ||
        /\b(schedule|meeting|client meeting|call|fix|update|prepare|send|review|deploy|by tomorrow|by monday|by friday|urgent|asap|verify)\b/i.test(
          msg?.text || ""
        )
      ) {
        refreshAiExtractions();
      }
    };

    const handleTaskCandidate = () => {
      refreshAiExtractions();
    };

    // Live Socket listener for ANY task modifications in workspace
    const handleTaskEvent = () => {
      refreshTaskSummary();
    };

    const handleConnect = () => {
      joinWorkspaceRoom(activeWorkspace.id);
      refreshAiExtractions();
      refreshTaskSummary();
    };

    socket.on("message:new", handleIncomingMessage);
    socket.on("message_received", handleIncomingMessage);
    socket.on("ai:task_candidate", handleTaskCandidate);
    socket.on("task:created", handleTaskEvent);
    socket.on("task:updated", handleTaskEvent);
    socket.on("task:status_changed", handleTaskEvent);
    socket.on("task:completed", handleTaskEvent);
    socket.on("task:deleted", handleTaskEvent);
    socket.on("task:assigned", handleTaskEvent);
    socket.on("connect", handleConnect);

    return () => {
      socket.off("message:new", handleIncomingMessage);
      socket.off("message_received", handleIncomingMessage);
      socket.off("ai:task_candidate", handleTaskCandidate);
      socket.off("task:created", handleTaskEvent);
      socket.off("task:updated", handleTaskEvent);
      socket.off("task:status_changed", handleTaskEvent);
      socket.off("task:completed", handleTaskEvent);
      socket.off("task:deleted", handleTaskEvent);
      socket.off("task:assigned", handleTaskEvent);
      socket.off("connect", handleConnect);
      leaveWorkspaceRoom(activeWorkspace.id);
    };
  }, [token, activeWorkspace?.id, refreshAiExtractions, refreshTaskSummary]);

  // Periodic background sync every 5 seconds to ensure live real-time metrics stay synchronized
  useEffect(() => {
    if (!token || !activeWorkspace?.id) return;
    const interval = setInterval(() => {
      refreshAiExtractions();
      refreshTaskSummary();
    }, 5000);
    return () => clearInterval(interval);
  }, [token, activeWorkspace?.id, refreshAiExtractions, refreshTaskSummary]);

  const handleApprove = async (id: string, title: string) => {
    const target = aiSuggestions.find((s) => s.id === id);
    setAiSuggestions((prev) => {
      const next = prev.filter((s) => s.id !== id);
      try {
        if (activeWorkspace?.id) {
          sessionStorage.setItem(`actionflow_ai_extractions_${activeWorkspace.id}`, JSON.stringify(next));
        }
        sessionStorage.setItem("actionflow_ai_extractions_cache", JSON.stringify(next));
      } catch {}
      return next;
    });
    setApprovedCount((c) => c + 1);

    if (target && activeWorkspace?.id) {
      try {
        await api.createTask(activeWorkspace.id, {
          title: target.title,
          description: `Auto-extracted from chat: "${target.context}"`,
          assigneeId: target.assigneeId,
          priority: (target.priority as any) || "MEDIUM",
          dueDate: target.deadlineDate || undefined,
          sourceMessageId: target.messageId,
          sourceConversationId: target.conversationId,
        });
        refreshTaskSummary();
        setActionNotice(`Approved & created task: "${title.slice(0, 32)}..."`);
      } catch (err: any) {
        setActionNotice(`Approved task: "${title.slice(0, 32)}..."`);
      }
    } else {
      setActionNotice(`Approved task: "${title.slice(0, 32)}..."`);
    }
    setTimeout(() => setActionNotice(null), 3500);
  };

  const handleReject = (id: string, title: string) => {
    setAiSuggestions((prev) => {
      const next = prev.filter((s) => s.id !== id);
      try {
        if (activeWorkspace?.id) {
          sessionStorage.setItem(`actionflow_ai_extractions_${activeWorkspace.id}`, JSON.stringify(next));
          const dismissedKey = `actionflow_ai_dismissed_${activeWorkspace.id}`;
          const rawDismissed = sessionStorage.getItem(dismissedKey);
          const dismissedSet = new Set(rawDismissed ? JSON.parse(rawDismissed) : []);
          dismissedSet.add(id);
          sessionStorage.setItem(dismissedKey, JSON.stringify(Array.from(dismissedSet)));
        }
        sessionStorage.setItem("actionflow_ai_extractions_cache", JSON.stringify(next));
      } catch {}
      return next;
    });
    setActionNotice(`Dismissed AI suggestion`);
    setTimeout(() => setActionNotice(null), 3500);
  };

  const handleOpenEdit = (suggestion: AISuggestion) => {
    setEditingSuggestion({ ...suggestion });
    setIsEditModalOpen(true);
  };

  const handleSaveEdit = (updated: AISuggestion) => {
    setAiSuggestions((prev) =>
      prev.map((s) => (s.id === updated.id ? updated : s))
    );
    setIsEditModalOpen(false);
    setActionNotice(`Updated AI task: "${updated.title.slice(0, 32)}..."`);
    setTimeout(() => setActionNotice(null), 3500);
  };

  const handleSaveAndApprove = async (updated: AISuggestion) => {
    setAiSuggestions((prev) => prev.filter((s) => s.id !== updated.id));
    setApprovedCount((c) => c + 1);
    setIsEditModalOpen(false);

    if (activeWorkspace?.id) {
      try {
        await api.createTask(activeWorkspace.id, {
          title: updated.title,
          description: `Auto-extracted from chat: "${updated.context}"`,
          assigneeId: updated.assigneeId,
          priority: (updated.priority as any) || "MEDIUM",
          dueDate: updated.deadlineDate || undefined,
          sourceMessageId: updated.messageId,
          sourceConversationId: updated.conversationId,
        });
        refreshTaskSummary();
        setActionNotice(`Saved & created task: "${updated.title.slice(0, 32)}..."`);
      } catch (err: any) {
        setActionNotice(`Saved & approved task: "${updated.title.slice(0, 32)}..."`);
      }
    } else {
      setActionNotice(`Saved & approved task: "${updated.title.slice(0, 32)}..."`);
    }
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
      <header className="flex h-16 shrink-0 items-center justify-between border-b border-border/80 bg-card/70 backdrop-blur-md px-4 sm:px-6 z-10">
        <div className="flex items-center gap-2.5 sm:gap-3">
          {/* Mobile Navigation Drawer Toggle */}
          <button
            type="button"
            onClick={openMobileNav}
            className="grid h-9 w-9 place-items-center rounded-xl bg-muted/70 text-muted-foreground hover:bg-muted hover:text-foreground md:hidden cursor-pointer transition-colors shadow-2xs"
            title="Open Navigation Menu"
            aria-label="Open Navigation Menu"
          >
            <Menu className="h-5 w-5" />
          </button>

          <div className="grid h-10 w-10 place-items-center rounded-2xl bg-gradient-to-br from-primary/25 to-primary/10 text-primary shadow-xs border border-primary/20">
            <LayoutDashboard className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-display text-base sm:text-lg font-bold tracking-tight text-foreground">
                Manager Dashboard
              </h1>
              <span className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-primary/10 text-primary border border-primary/20">
                Live Real-Time
              </span>
            </div>
            <p className="text-[11px] text-muted-foreground hidden sm:block">
              {activeWorkspace?.name || "Workspace"} • Live Task Intelligence & Team Workload Analytics
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={handleManualSync}
            disabled={isRefreshing}
            className="inline-flex items-center gap-1.5 rounded-xl border border-border/80 bg-card/80 px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-muted/80 hover:border-primary/40 transition-all cursor-pointer shadow-xs active:scale-95"
            title="Sync latest live analytics and AI extractions"
          >
            <RotateCw className={cn("h-3.5 w-3.5 text-primary transition-transform", isRefreshing && "animate-spin")} />
            <span className="hidden md:inline">Sync Now</span>
          </button>

          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400 shadow-xs">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
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

          {/* Executive Workspace Task Stats */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              icon={<LayoutDashboard className="h-5 w-5" />}
              title="Active Tasks"
              value={loadingSummary ? "..." : activeTasks.toString()}
              change={totalTasks > 0 ? `${Math.round((activeTasks / totalTasks) * 100)}% of total` : "0% active"}
              accent="primary"
              progress={totalTasks > 0 ? Math.round((activeTasks / totalTasks) * 100) : 0}
              subtitle="In progress, to-do or review"
            />
            <StatCard
              icon={<CheckCircle2 className="h-5 w-5" />}
              title="Tasks Completed"
              value={loadingSummary ? "..." : completedTasks.toString()}
              change={totalTasks > 0 ? `${Math.round((completedTasks / totalTasks) * 100)}% completion` : "0% completion"}
              accent="emerald"
              progress={totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0}
              subtitle="Delivered successfully"
            />
            <StatCard
              icon={<AlertTriangle className="h-5 w-5" />}
              title="Overdue Tasks"
              value={loadingSummary ? "..." : overdueTasks.toString()}
              change={overdueTasks > 0 ? "Requires attention" : "All on schedule"}
              accent="rose"
              highlight={overdueTasks > 0}
              progress={totalTasks > 0 ? Math.round((overdueTasks / totalTasks) * 100) : 0}
              subtitle={overdueTasks > 0 ? "Past delivery deadline" : "Zero delivery bottlenecks"}
            />
            <StatCard
              icon={<Layers className="h-5 w-5" />}
              title="Total Tasks"
              value={loadingSummary ? "..." : totalTasks.toString()}
              change={`${activeWorkspace?.name || "Workspace"} scope`}
              accent="blue"
              subtitle="All tracked workspace deliverables"
            />
          </div>

          {/* Real Workspace Task Breakdown: Status & Priority */}
          {taskSummary && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {/* Grouped by Status */}
              <div className="rounded-2xl border border-border/80 bg-card/85 p-6 shadow-xs backdrop-blur-md space-y-5">
                <div className="flex items-center justify-between border-b border-border/60 pb-3.5">
                  <div className="flex items-center gap-2.5">
                    <div className="grid h-8 w-8 place-items-center rounded-lg bg-primary/15 text-primary">
                      <BarChart3 className="h-4 w-4" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-foreground font-display">
                        Tasks Grouped by Status
                      </h3>
                      <p className="text-[11px] text-muted-foreground">
                        Live lifecycle workflow distribution
                      </p>
                    </div>
                  </div>
                  <span className="inline-flex items-center gap-1 rounded-full bg-muted/80 px-2.5 py-1 text-xs font-bold text-foreground border border-border/60 font-mono">
                    {totalTasks} total
                  </span>
                </div>

                {/* Continuous Multi-segment Pipeline Stream Bar */}
                {totalTasks > 0 && (
                  <div className="space-y-1.5">
                    <div className="flex h-3 w-full rounded-full overflow-hidden bg-muted/60 p-0.5 gap-0.5 border border-border/40 shadow-inner">
                      {[
                        { key: "TODO", count: taskSummary.statusBreakdown.TODO, color: "bg-slate-400" },
                        { key: "IN_PROGRESS", count: taskSummary.statusBreakdown.IN_PROGRESS, color: "bg-amber-500" },
                        { key: "IN_REVIEW", count: taskSummary.statusBreakdown.IN_REVIEW, color: "bg-purple-500" },
                        { key: "DONE", count: taskSummary.statusBreakdown.DONE, color: "bg-emerald-500" },
                      ].map((seg) => {
                        const pct = Math.round((seg.count / totalTasks) * 100);
                        if (pct <= 0) return null;
                        return (
                          <div
                            key={seg.key}
                            style={{ width: `${pct}%` }}
                            className={cn("h-full rounded-full transition-all duration-500", seg.color)}
                            title={`${seg.key}: ${seg.count} (${pct}%)`}
                          />
                        );
                      })}
                    </div>
                    <div className="flex items-center justify-between text-[10px] text-muted-foreground px-0.5">
                      <span>Pipeline Flow</span>
                      <span>100% Scope</span>
                    </div>
                  </div>
                )}

                {/* Status Rows */}
                <div className="space-y-3 pt-1">
                  {[
                    { key: "TODO", label: "To Do", count: taskSummary.statusBreakdown.TODO, color: "from-slate-400 to-slate-500", dot: "bg-slate-400", badge: "bg-slate-500/10 text-slate-600 dark:text-slate-300 border-slate-500/20" },
                    { key: "IN_PROGRESS", label: "In Progress", count: taskSummary.statusBreakdown.IN_PROGRESS, color: "from-amber-400 to-orange-500", dot: "bg-amber-500", badge: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20" },
                    { key: "IN_REVIEW", label: "In Review", count: taskSummary.statusBreakdown.IN_REVIEW, color: "from-purple-400 to-violet-500", dot: "bg-purple-500", badge: "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20" },
                    { key: "DONE", label: "Done", count: taskSummary.statusBreakdown.DONE, color: "from-emerald-400 to-teal-500", dot: "bg-emerald-500", badge: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20" },
                  ].map((item) => {
                    const pct = totalTasks > 0 ? Math.round((item.count / totalTasks) * 100) : 0;
                    return (
                      <div key={item.key} className="group/row rounded-xl border border-border/50 bg-background/50 p-3 transition-all hover:bg-muted/30 hover:border-border">
                        <div className="flex items-center justify-between text-xs mb-2">
                          <span className="font-bold text-foreground flex items-center gap-2">
                            <span className={cn("h-2.5 w-2.5 rounded-full shadow-xs", item.dot)} />
                            {item.label}
                          </span>
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-bold text-foreground text-sm">
                              {item.count}
                            </span>
                            <span className={cn("rounded-md px-2 py-0.5 text-[11px] font-bold border", item.badge)}>
                              {pct}%
                            </span>
                          </div>
                        </div>
                        <div className="h-2 w-full rounded-full bg-muted/70 overflow-hidden">
                          <div
                            className={cn("h-full rounded-full bg-gradient-to-r transition-all duration-700 shadow-xs", item.color)}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Grouped by Priority */}
              <div className="rounded-2xl border border-border/80 bg-card/85 p-6 shadow-xs backdrop-blur-md space-y-5">
                <div className="flex items-center justify-between border-b border-border/60 pb-3.5">
                  <div className="flex items-center gap-2.5">
                    <div className="grid h-8 w-8 place-items-center rounded-lg bg-amber-500/15 text-amber-600 dark:text-amber-400">
                      <TrendingUp className="h-4 w-4" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-foreground font-display">
                        Tasks Grouped by Priority
                      </h3>
                      <p className="text-[11px] text-muted-foreground">
                        Urgency & critical path tracking
                      </p>
                    </div>
                  </div>
                  <span className="inline-flex items-center gap-1 rounded-full bg-muted/80 px-2.5 py-1 text-xs font-bold text-foreground border border-border/60 font-mono">
                    {totalTasks} total
                  </span>
                </div>

                {/* Continuous Priority Spectrum Bar */}
                {totalTasks > 0 && (
                  <div className="space-y-1.5">
                    <div className="flex h-3 w-full rounded-full overflow-hidden bg-muted/60 p-0.5 gap-0.5 border border-border/40 shadow-inner">
                      {[
                        { key: "URGENT", count: taskSummary.priorityBreakdown.URGENT, color: "bg-rose-500" },
                        { key: "HIGH", count: taskSummary.priorityBreakdown.HIGH, color: "bg-amber-500" },
                        { key: "MEDIUM", count: taskSummary.priorityBreakdown.MEDIUM, color: "bg-sky-500" },
                        { key: "LOW", count: taskSummary.priorityBreakdown.LOW, color: "bg-slate-400" },
                      ].map((seg) => {
                        const pct = Math.round((seg.count / totalTasks) * 100);
                        if (pct <= 0) return null;
                        return (
                          <div
                            key={seg.key}
                            style={{ width: `${pct}%` }}
                            className={cn("h-full rounded-full transition-all duration-500", seg.color)}
                            title={`${seg.key}: ${seg.count} (${pct}%)`}
                          />
                        );
                      })}
                    </div>
                    <div className="flex items-center justify-between text-[10px] text-muted-foreground px-0.5">
                      <span>Urgent to Low Risk</span>
                      <span>Priority Spectrum</span>
                    </div>
                  </div>
                )}

                {/* Priority Rows */}
                <div className="space-y-3 pt-1">
                  {[
                    { key: "URGENT", label: "Urgent", count: taskSummary.priorityBreakdown.URGENT, color: "from-rose-500 to-red-600", dot: "bg-rose-500 animate-pulse", badge: "bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/30", extraTag: "Critical" },
                    { key: "HIGH", label: "High", count: taskSummary.priorityBreakdown.HIGH, color: "from-amber-400 to-orange-500", dot: "bg-amber-500", badge: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20", extraTag: "Elevated" },
                    { key: "MEDIUM", label: "Medium", count: taskSummary.priorityBreakdown.MEDIUM, color: "from-sky-400 to-blue-500", dot: "bg-sky-500", badge: "bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/20", extraTag: "Standard" },
                    { key: "LOW", label: "Low", count: taskSummary.priorityBreakdown.LOW, color: "from-slate-300 to-slate-400", dot: "bg-slate-400", badge: "bg-slate-500/10 text-slate-500 border-slate-500/20", extraTag: "Routine" },
                  ].map((item) => {
                    const pct = totalTasks > 0 ? Math.round((item.count / totalTasks) * 100) : 0;
                    return (
                      <div key={item.key} className="group/row rounded-xl border border-border/50 bg-background/50 p-3 transition-all hover:bg-muted/30 hover:border-border">
                        <div className="flex items-center justify-between text-xs mb-2">
                          <span className="font-bold text-foreground flex items-center gap-2">
                            <span className={cn("h-2.5 w-2.5 rounded-full shadow-xs", item.dot)} />
                            {item.label}
                            {item.count > 0 && item.key === "URGENT" && (
                              <span className="inline-flex items-center gap-0.5 rounded-full bg-rose-500/20 px-1.5 py-0.2 text-[9px] font-extrabold text-rose-600 dark:text-rose-400 border border-rose-500/30">
                                <Flame className="h-2.5 w-2.5" /> High Risk
                              </span>
                            )}
                          </span>
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-bold text-foreground text-sm">
                              {item.count}
                            </span>
                            <span className={cn("rounded-md px-2 py-0.5 text-[11px] font-bold border", item.badge)}>
                              {pct}%
                            </span>
                          </div>
                        </div>
                        <div className="h-2 w-full rounded-full bg-muted/70 overflow-hidden">
                          <div
                            className={cn("h-full rounded-full bg-gradient-to-r transition-all duration-700 shadow-xs", item.color)}
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
            <div className="space-y-4 pt-2">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-border/80 pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="grid h-9 w-9 place-items-center rounded-xl bg-primary/15 text-primary border border-primary/20 shadow-xs">
                    <Users className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-base font-bold font-display text-foreground">
                        Team Workload & Capacity
                      </h2>
                      <span className="rounded-full bg-muted/80 px-2.5 py-0.5 text-[11px] font-bold text-foreground border border-border">
                        {taskSummary.assigneeWorkload.length} Members Tracked
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Real-time distribution of active commitments and completed deliverables across workspace members.
                    </p>
                  </div>
                </div>

                <Link
                  to="/tasks"
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:text-primary/80 transition-colors cursor-pointer self-start sm:self-auto"
                >
                  <span>Open Kanban Board</span>
                  <ArrowUpRight className="h-3.5 w-3.5" />
                </Link>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {taskSummary.assigneeWorkload.map((w) => {
                  const totalMemberTasks = w.activeTasks + w.completedTasks;
                  const memberPct = totalMemberTasks > 0 ? Math.round((w.completedTasks / totalMemberTasks) * 100) : 0;
                  
                  // Capacity status calculation
                  const statusConfig = w.activeTasks === 0
                    ? { label: "Available", bg: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/25", dot: "bg-emerald-500" }
                    : w.activeTasks <= 2
                    ? { label: "Optimal Load", bg: "bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/25", dot: "bg-sky-500" }
                    : { label: "High Demand", bg: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/25", dot: "bg-amber-500 animate-pulse" };

                  return (
                    <div
                      key={w.assignee?.id || "unassigned"}
                      className="group relative flex flex-col justify-between rounded-2xl border border-border/80 bg-card/85 p-5 shadow-xs backdrop-blur-md transition-all duration-300 hover:-translate-y-1 hover:shadow-lg hover:border-primary/40 space-y-4"
                    >
                      {/* Teammate Header */}
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="relative">
                            <div className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-primary/25 to-primary/10 text-xs font-bold text-primary border border-primary/25 shadow-xs">
                              {w.assignee?.displayName?.charAt(0)?.toUpperCase() || "U"}
                            </div>
                            <span className={cn("absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-card", statusConfig.dot)} />
                          </div>
                          <div className="min-w-0">
                            <h4 className="text-sm font-bold text-foreground truncate font-display">
                              {w.assignee?.displayName || "Unassigned"}
                            </h4>
                            <p className="text-[11px] text-muted-foreground truncate">
                              {w.assignee?.email || "Workspace Member"}
                            </p>
                          </div>
                        </div>

                        <span className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-bold border shrink-0", statusConfig.bg)}>
                          <span className={cn("h-1.5 w-1.5 rounded-full", statusConfig.dot)} />
                          {statusConfig.label}
                        </span>
                      </div>

                      {/* Workload Metric Blocks */}
                      <div className="grid grid-cols-2 gap-2.5 pt-1">
                        <div className="rounded-xl border border-primary/20 bg-primary/5 p-2.5 text-center">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Active Tasks</span>
                          <div className="text-lg font-extrabold font-display text-primary mt-0.5">
                            {w.activeTasks}
                          </div>
                        </div>
                        <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-2.5 text-center">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Completed</span>
                          <div className="text-lg font-extrabold font-display text-emerald-600 dark:text-emerald-400 mt-0.5">
                            {w.completedTasks}
                          </div>
                        </div>
                      </div>

                      {/* Progress bar */}
                      <div className="space-y-1.5 pt-1">
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="text-muted-foreground font-medium">Delivery Rate</span>
                          <span className="font-mono font-bold text-foreground">{memberPct}%</span>
                        </div>
                        <div className="h-1.5 w-full rounded-full bg-muted/70 overflow-hidden">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-primary to-emerald-500 transition-all duration-700"
                            style={{ width: `${memberPct}%` }}
                          />
                        </div>
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
                canManageAI ? (
                  <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-purple-500/10 text-purple-600 dark:text-purple-400 self-start sm:self-auto flex items-center gap-1.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-purple-500 animate-pulse" />
                    {userRole ? `${userRole} Access` : "Manager Access"} • {aiSuggestions.length} pending review
                  </span>
                ) : (
                  <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-muted text-muted-foreground self-start sm:self-auto flex items-center gap-1">
                    <Lock className="h-3 w-3" />
                    Read-only (Manager Role Required)
                  </span>
                )
              )}
            </div>

            <div className="grid gap-3.5 pt-1">
              {loadingAiSuggestions ? (
                <div className="space-y-3">
                  {[1, 2, 3].map((i) => (
                    <div
                      key={i}
                      className="rounded-2xl border border-border/70 bg-card/60 p-5 animate-pulse flex flex-col md:flex-row gap-4 justify-between items-start md:items-center"
                    >
                      <div className="space-y-2.5 flex-1 w-full">
                        <div className="flex gap-2 items-center">
                          <div className="h-4 w-28 rounded-full bg-muted/80" />
                          <div className="h-4 w-24 rounded-full bg-muted/60" />
                        </div>
                        <div className="h-5 w-3/4 rounded-lg bg-muted/80" />
                        <div className="flex gap-4">
                          <div className="h-4 w-28 rounded-md bg-muted/60" />
                          <div className="h-4 w-32 rounded-md bg-muted/60" />
                        </div>
                        <div className="h-10 w-full rounded-xl bg-muted/40" />
                      </div>
                      <div className="flex gap-2 w-full md:w-32 md:flex-col pt-2 md:pt-0">
                        <div className="h-8 flex-1 md:w-full rounded-xl bg-muted/80" />
                        <div className="h-8 flex-1 md:w-full rounded-xl bg-muted/60" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : aiSuggestions.length > 0 ? (
                aiSuggestions.map((suggestion) => (
                  <ApprovalCard
                    key={suggestion.id}
                    suggestion={suggestion}
                    canManage={canManageAI}
                    onEdit={() => handleOpenEdit(suggestion)}
                    onApprove={() => handleApprove(suggestion.id, suggestion.title)}
                    onReject={() => handleReject(suggestion.id, suggestion.title)}
                  />
                ))
              ) : (
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
                </div>
              )}
            </div>
          </div>
        </div>
      </main>

      {/* Edit AI Suggestion Modal */}
      <EditAISuggestionModal
        open={isEditModalOpen}
        onOpenChange={setIsEditModalOpen}
        suggestion={editingSuggestion}
        workspaceMembers={workspaceMembers}
        userRole={userRole}
        onSave={handleSaveEdit}
        onSaveAndApprove={handleSaveAndApprove}
      />
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
  progress,
  subtitle,
}: {
  icon: React.ReactNode;
  title: string;
  value: string;
  change: string;
  accent: "primary" | "blue" | "purple" | "emerald" | "rose";
  highlight?: boolean;
  progress?: number;
  subtitle?: string;
}) {
  const accentStyles = {
    primary: {
      bar: "from-primary via-primary/80 to-primary/40",
      iconBg: "bg-primary/15 text-primary border-primary/25",
      ring: "hover:border-primary/40 hover:shadow-primary/5",
    },
    blue: {
      bar: "from-sky-500 via-blue-500 to-indigo-500",
      iconBg: "bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/25",
      ring: "hover:border-blue-500/40 hover:shadow-blue-500/5",
    },
    purple: {
      bar: "from-purple-500 via-fuchsia-500 to-pink-500",
      iconBg: "bg-purple-500/15 text-purple-600 dark:text-purple-400 border-purple-500/25",
      ring: "hover:border-purple-500/40 hover:shadow-purple-500/5",
    },
    emerald: {
      bar: "from-emerald-400 via-emerald-500 to-teal-500",
      iconBg: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/25",
      ring: "hover:border-emerald-500/40 hover:shadow-emerald-500/5",
    },
    rose: {
      bar: "from-rose-500 via-red-500 to-pink-600",
      iconBg: "bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/25",
      ring: "hover:border-rose-500/40 hover:shadow-rose-500/5",
    },
  }[accent];

  return (
    <div
      className={cn(
        "group relative flex flex-col justify-between overflow-hidden rounded-2xl border border-border/80 bg-card/85 p-5 shadow-xs backdrop-blur-md transition-all duration-300 hover:-translate-y-1 hover:shadow-xl",
        accentStyles.ring,
        highlight && "ring-2 ring-rose-500/40 border-rose-500/40"
      )}
    >
      {/* Top ambient color bar */}
      <div className={cn("absolute top-0 left-0 right-0 h-1 bg-gradient-to-r", accentStyles.bar)} />

      <div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground font-display">
            {title}
          </span>
          <div
            className={cn(
              "grid h-10 w-10 place-items-center rounded-xl border shadow-xs transition-transform duration-300 group-hover:scale-110",
              accentStyles.iconBg
            )}
          >
            {icon}
          </div>
        </div>

        <div className="mt-3">
          <div className="text-3xl font-extrabold font-display tracking-tight text-foreground">
            {value}
          </div>
          {subtitle && (
            <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
              {subtitle}
            </p>
          )}
        </div>
      </div>

      <div className="mt-4 pt-3 border-t border-border/50 space-y-2">
        <div className="flex items-center justify-between text-[11px]">
          <span
            className={cn(
              "font-semibold flex items-center gap-1",
              highlight ? "text-rose-600 dark:text-rose-400" : "text-emerald-600 dark:text-emerald-400"
            )}
          >
            {highlight ? (
              <AlertTriangle className="h-3 w-3 shrink-0" />
            ) : (
              <TrendingUp className="h-3 w-3 shrink-0" />
            )}
            <span className="truncate">{change}</span>
          </span>
          {typeof progress === "number" && (
            <span className="text-muted-foreground font-mono font-bold shrink-0">
              {progress}%
            </span>
          )}
        </div>

        {typeof progress === "number" && (
          <div className="h-1.5 w-full rounded-full bg-muted/70 overflow-hidden">
            <div
              className={cn("h-full rounded-full transition-all duration-700 bg-gradient-to-r", accentStyles.bar)}
              style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
            />
          </div>
        )}
      </div>
    </div>
  );
}

function ApprovalCard({
  suggestion,
  canManage,
  onEdit,
  onApprove,
  onReject,
}: {
  suggestion: AISuggestion;
  canManage: boolean;
  onEdit: () => void;
  onApprove: () => void;
  onReject: () => void;
}) {
  const isUnassigned = suggestion.isUnassigned || !suggestion.assignee || suggestion.assignee === "Unassigned";

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
          {isUnassigned ? (
            <div className="flex items-center gap-1.5">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-500/15 border border-amber-500/30 text-amber-700 dark:text-amber-400 font-bold text-xs animate-pulse">
                <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                Assignee: Unassigned (Action Required)
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5">
              <div className="grid h-5 w-5 place-items-center rounded-full bg-primary/20 text-[10px] font-bold text-primary">
                {suggestion.assigneeInitials}
              </div>
              <span>
                Assignee: <strong className="text-foreground">{suggestion.assignee}</strong>
              </span>
            </div>
          )}

          <div className="flex items-center gap-1">
            <Clock className="h-3.5 w-3.5 text-muted-foreground" />
            <span>
              Deadline: <strong className="text-foreground">{formatDeadlineDisplay(suggestion.deadline, suggestion.deadlineDate)}</strong>
            </span>
          </div>
        </div>

        <div className="rounded-xl bg-muted/40 p-3 text-xs italic text-muted-foreground border-l-2 border-primary/40 leading-relaxed">
          "{suggestion.context}"
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2 md:flex-col md:w-32 pt-2 md:pt-0">
        {canManage ? (
          <>
            <button
              type="button"
              onClick={isUnassigned ? onEdit : onApprove}
              className={cn(
                "flex flex-1 items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold shadow-xs transition-all active:scale-95 md:w-full cursor-pointer",
                isUnassigned
                  ? "bg-amber-600 hover:bg-amber-500 text-white"
                  : "bg-primary text-primary-foreground hover:bg-primary/90"
              )}
              title={isUnassigned ? "Assign teammate before approving" : "Approve and create task"}
            >
              {isUnassigned ? (
                <>
                  <Pencil className="h-3.5 w-3.5" />
                  Assign & Approve
                </>
              ) : (
                <>
                  <Check className="h-3.5 w-3.5" />
                  Approve
                </>
              )}
            </button>
            <button
              type="button"
              onClick={onEdit}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-border bg-card px-3 py-2 text-xs font-semibold text-foreground hover:bg-muted hover:border-primary/40 transition-all active:scale-95 md:w-full cursor-pointer"
              title="Edit task parameters according to RBAC permissions"
            >
              <Pencil className="h-3.5 w-3.5 text-amber-500" />
              Edit
            </button>
            <button
              type="button"
              onClick={onReject}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-border bg-card px-3 py-2 text-xs font-semibold text-muted-foreground hover:bg-destructive/10 hover:text-destructive hover:border-destructive/30 transition-all active:scale-95 md:w-full cursor-pointer"
              title="Dismiss suggestion"
            >
              <X className="h-3.5 w-3.5" />
              Reject
            </button>
          </>
        ) : (
          <div className="flex flex-col items-center justify-center py-2 text-center md:w-full">
            <span className="inline-flex items-center gap-1 rounded-xl bg-muted/80 px-2.5 py-1.5 text-[11px] font-medium text-muted-foreground border border-border/60">
              <Lock className="h-3 w-3" />
              Manager Only
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

function EditAISuggestionModal({
  open,
  onOpenChange,
  suggestion,
  workspaceMembers,
  userRole,
  onSave,
  onSaveAndApprove,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  suggestion: AISuggestion | null;
  workspaceMembers?: WorkspaceMember[];
  userRole: string | null;
  onSave: (updated: AISuggestion) => void;
  onSaveAndApprove: (updated: AISuggestion) => void;
}) {
  const [title, setTitle] = useState("");
  const [assignee, setAssignee] = useState("");
  const [deadline, setDeadline] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);

  useEffect(() => {
    if (suggestion) {
      setTitle(suggestion.title);
      const isUnass = suggestion.isUnassigned || !suggestion.assignee || suggestion.assignee === "Unassigned";
      setAssignee(isUnass ? "" : suggestion.assignee);
      setDeadline(formatDeadlineDisplay(suggestion.deadline, suggestion.deadlineDate));
      setValidationError(null);
    }
  }, [suggestion, open]);

  if (!suggestion) return null;

  const memberList =
    workspaceMembers && workspaceMembers.length > 0
      ? workspaceMembers
      : DEMO_TEAM_MEMBERS.map((d, i) => ({
          id: `demo-${i}`,
          userId: `demo-${i}`,
          displayName: d.name,
          role: d.role as any,
          initials: d.initials,
          email: `${d.name.toLowerCase()}@actionflow.com`,
          status: "ACTIVE" as any,
          joinedAt: new Date().toISOString(),
        }));

  const handleMemberSelect = (memberName: string) => {
    setAssignee(memberName);
    setValidationError(null);
  };

  const handleSubmit = (e: React.FormEvent, andApprove = false) => {
    e.preventDefault();
    if (!title.trim()) return;

    const isUnassignedNow = !assignee || assignee === "Unassigned";

    if (andApprove && isUnassignedNow) {
      setValidationError("Please select an assignee from the dropdown before approving into the workspace board.");
      return;
    }

    const found = memberList.find((m) => m.displayName.toLowerCase() === assignee.toLowerCase());
    const memberInitials = found?.initials || (isUnassignedNow ? "?" : assignee.charAt(0).toUpperCase());

    const updated: AISuggestion = {
      ...suggestion,
      title: title.trim(),
      assignee: isUnassignedNow ? "Unassigned" : assignee.trim(),
      assigneeId: found ? found.userId || found.id : undefined,
      assigneeInitials: memberInitials,
      isUnassigned: isUnassignedNow,
      deadline: deadline.trim() || suggestion.deadline,
    };

    if (andApprove) {
      onSaveAndApprove(updated);
    } else {
      onSave(updated);
    }
  };

  const isCurrentUnassigned = !assignee || assignee === "Unassigned";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg p-0 overflow-hidden rounded-2xl border border-border bg-card shadow-2xl">
        <DialogHeader className="p-5 pb-4 border-b border-border/70 bg-muted/20">
          <div className="flex items-center gap-2.5">
            <div className="grid h-8 w-8 place-items-center rounded-xl bg-purple-500/15 text-purple-600 dark:text-purple-400">
              <Sparkles className="h-4 w-4" />
            </div>
            <div>
              <DialogTitle className="text-base font-bold font-display text-foreground">
                Edit AI-Extracted Task
              </DialogTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                Review and modify parameters before approving into workspace board.
              </p>
            </div>
          </div>
        </DialogHeader>

        <form onSubmit={(e) => handleSubmit(e, false)} className="p-5 space-y-4">
          {/* RBAC Notice */}
          <div className="flex items-center justify-between rounded-xl bg-primary/10 border border-primary/20 px-3.5 py-2 text-xs">
            <span className="font-semibold text-primary flex items-center gap-1.5">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" />
              Role Authorization
            </span>
            <span className="font-medium text-foreground">
              {userRole ? `${userRole} Access` : "Manager Access"} (Edit Authorized)
            </span>
          </div>

          {/* Unassigned Warning Alert Banner */}
          {isCurrentUnassigned && (
            <div className="flex items-start gap-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 p-3 text-xs text-amber-800 dark:text-amber-300">
              <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500 mt-0.5" />
              <div>
                <strong className="block font-semibold">Unassigned Action Item:</strong>
                <span>No team member was designated in the chat message. Please select an assignee below so the task has a clear owner.</span>
              </div>
            </div>
          )}

          {validationError && (
            <div className="flex items-center gap-2 rounded-xl bg-destructive/10 border border-destructive/20 p-2.5 text-xs text-destructive">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>{validationError}</span>
            </div>
          )}

          {/* Title */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-foreground flex items-center justify-between">
              <span>Task Title</span>
              <span className="text-[10px] text-muted-foreground">{suggestion.confidence}% confidence</span>
            </label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Verify session persistence"
              required
              className="rounded-xl border-border bg-muted/40 text-sm focus:bg-card"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Assignee */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <Users className="h-3.5 w-3.5 text-muted-foreground" />
                  Assignee
                </span>
                {isCurrentUnassigned && (
                  <span className="text-[10px] font-bold text-amber-600 dark:text-amber-400 flex items-center gap-1 animate-pulse">
                    <AlertTriangle className="h-3 w-3" />
                    Unassigned — Choose member
                  </span>
                )}
              </label>
              <select
                value={assignee}
                onChange={(e) => handleMemberSelect(e.target.value)}
                className={cn(
                  "w-full h-9 rounded-xl border px-3 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary focus:bg-card cursor-pointer transition-all",
                  isCurrentUnassigned
                    ? "border-amber-500/70 bg-amber-500/10 text-amber-900 dark:text-amber-100 font-semibold ring-1 ring-amber-500/30"
                    : "border-border bg-muted/40"
                )}
              >
                <option value="">
                  ⚠️ Unassigned — Choose a team member...
                </option>
                {memberList.map((m) => (
                  <option key={m.id || m.displayName} value={m.displayName}>
                    {m.displayName} ({m.role})
                  </option>
                ))}
              </select>
            </div>

            {/* Deadline */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                Target Deadline
              </label>
              <Input
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
                placeholder="e.g. Tomorrow at 5:00 PM"
                className="rounded-xl border-border bg-muted/40 text-xs focus:bg-card"
              />
            </div>
          </div>

          {/* Context Snippet */}
          <div className="space-y-1.5 pt-1">
            <label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
              <MessageSquare className="h-3.5 w-3.5 text-muted-foreground" />
              Source Context ({suggestion.source})
            </label>
            <div className="rounded-xl bg-muted/30 p-2.5 text-xs text-muted-foreground italic border border-border/60">
              "{suggestion.context}"
            </div>
          </div>

          <DialogFooter className="pt-2 flex flex-col-reverse sm:flex-row gap-2 sm:justify-end">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
              className="rounded-xl cursor-pointer"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="secondary"
              size="sm"
              className="rounded-xl cursor-pointer"
            >
              Save Changes
            </Button>
            <Button
              type="button"
              onClick={(e) => handleSubmit(e, true)}
              size="sm"
              className={cn(
                "rounded-xl gap-1.5 font-semibold cursor-pointer",
                isCurrentUnassigned
                  ? "bg-amber-600 hover:bg-amber-500 text-white"
                  : "bg-primary text-primary-foreground hover:bg-primary/90"
              )}
            >
              <Check className="h-3.5 w-3.5" />
              Save & Approve
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
