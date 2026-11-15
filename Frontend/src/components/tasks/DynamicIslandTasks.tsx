import React, { useEffect, useState, useRef, useCallback } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  Flame,
  Zap,
  CheckCircle2,
  Clock,
  ArrowRight,
  ChevronDown,
  ChevronUp,
  X,
  AlertCircle,
  Plus,
  Layers,
  Sparkles,
  Check,
  User as UserIcon,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useAuth } from "@/context/AuthContext";
import { useWorkspace } from "@/context/WorkspaceContext";
import { api, type BackendTask, type TaskStatus, type TaskPriority } from "@/lib/api";
import { getSocket, joinWorkspaceRoom } from "@/lib/socket";

interface DynamicIslandTasksProps {
  className?: string;
  onCreateTaskClick?: () => void;
}

export function DynamicIslandTasks({ className, onCreateTaskClick }: DynamicIslandTasksProps) {
  const { token, user } = useAuth();
  const { activeWorkspace } = useWorkspace();
  const navigate = useNavigate();

  const [isOpen, setIsOpen] = useState(false);
  const [tasks, setTasks] = useState<BackendTask[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeFilter, setActiveFilter] = useState<"ONGOING" | "ALL_ACTIVE" | "MINE">("ONGOING");
  const [justUpdated, setJustUpdated] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Fetch all tasks for current workspace
  const fetchTasks = useCallback(async () => {
    if (!token || !activeWorkspace?.id) return;
    try {
      setLoading(true);
      const res = await api.getTasks(activeWorkspace.id, {
        filter: "ALL",
      });
      setTasks(res.tasks || []);
    } catch (err: any) {
      console.warn("[DynamicIsland] Failed to fetch tasks:", err?.message);
    } finally {
      setLoading(false);
    }
  }, [token, activeWorkspace?.id]);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  // Real-time Socket.IO connection
  useEffect(() => {
    if (!token || !activeWorkspace?.id) return;
    joinWorkspaceRoom(activeWorkspace.id);

    const socket = getSocket();
    if (!socket) return;

    const triggerPulse = () => {
      setJustUpdated(true);
      setTimeout(() => setJustUpdated(false), 2000);
      fetchTasks();
    };

    socket.on("task:created", triggerPulse);
    socket.on("task:updated", triggerPulse);
    socket.on("task:assigned", triggerPulse);
    socket.on("task:status_changed", triggerPulse);
    socket.on("task:completed", triggerPulse);

    return () => {
      socket.off("task:created", triggerPulse);
      socket.off("task:updated", triggerPulse);
      socket.off("task:assigned", triggerPulse);
      socket.off("task:status_changed", triggerPulse);
      socket.off("task:completed", triggerPulse);
    };
  }, [token, activeWorkspace?.id, fetchTasks]);

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  // Keyboard escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      window.addEventListener("keydown", handleKeyDown);
    }
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  // Filter tasks
  const ongoingTasks = tasks.filter((t) => t.status === "IN_PROGRESS");
  const allActiveTasks = tasks.filter((t) => t.status !== "DONE");
  const myTasks = tasks.filter(
    (t) => t.status !== "DONE" && t.assignee?.id === (user?._id || user?.id)
  );

  const displayedTasks =
    activeFilter === "ONGOING"
      ? ongoingTasks
      : activeFilter === "MINE"
      ? myTasks
      : allActiveTasks;

  const urgentCount = allActiveTasks.filter((t) => t.priority === "URGENT").length;

  // Quick advance status helper
  const handleQuickAdvance = async (e: React.MouseEvent, task: BackendTask) => {
    e.stopPropagation();
    if (!token || !activeWorkspace?.id) return;

    const nextStatus: TaskStatus =
      task.status === "TODO"
        ? "IN_PROGRESS"
        : task.status === "IN_PROGRESS"
        ? "DONE"
        : "DONE";

    try {
      await api.updateTaskStatus(activeWorkspace.id, task.id, nextStatus);
      toast.success(
        nextStatus === "DONE"
          ? `Completed: "${task.title}" 🎉`
          : `Moved to ${nextStatus}: "${task.title}"`
      );
      fetchTasks();
    } catch (err: any) {
      toast.error(err?.message || "Failed to update task status");
    }
  };

  const priorityColor: Record<TaskPriority, { bg: string; text: string; icon: string }> = {
    URGENT: { bg: "bg-red-500/20 border-red-500/40", text: "text-red-400", icon: "🔥" },
    HIGH: { bg: "bg-amber-500/20 border-amber-500/40", text: "text-amber-400", icon: "⚡" },
    MEDIUM: { bg: "bg-teal-500/20 border-teal-500/40", text: "text-teal-300", icon: "•" },
    LOW: { bg: "bg-slate-500/20 border-slate-500/40", text: "text-slate-300", icon: "•" },
  };

  return (
    <div ref={containerRef} className={cn("relative z-30 select-none", className)}>
      {/* 1. Dynamic Island Collapsed Capsule */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "group relative flex items-center gap-2.5 h-9 px-3.5 rounded-full",
          "bg-slate-900/90 dark:bg-black/90 backdrop-blur-xl",
          "border border-white/15 dark:border-white/10",
          "text-white shadow-md hover:shadow-emerald-500/20",
          "transition-all duration-300 ease-out cursor-pointer",
          justUpdated && "ring-2 ring-emerald-400 scale-[1.03] shadow-emerald-500/40",
          isOpen && "ring-2 ring-primary/60 bg-black scale-[1.02]"
        )}
        title="Click to view ongoing tasks"
      >
        {/* Glowing pulse beacon */}
        <span className="relative flex h-2.5 w-2.5 shrink-0">
          {ongoingTasks.length > 0 ? (
            <>
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
            </>
          ) : (
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-slate-500" />
          )}
        </span>

        {/* Dynamic Island icon */}
        <div className="flex items-center gap-1.5 shrink-0">
          <Flame className={cn("h-3.5 w-3.5 text-amber-400", ongoingTasks.length > 0 && "animate-pulse")} />
          <span className="text-xs font-bold tracking-tight">
            {ongoingTasks.length}{" "}
            <span className="text-slate-300 font-medium hidden sm:inline">
              {ongoingTasks.length === 1 ? "Ongoing Task" : "Ongoing Tasks"}
            </span>
          </span>
        </div>

        {/* Urgent or live indicator chip */}
        {urgentCount > 0 ? (
          <span className="hidden lg:inline-flex items-center px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-red-500/30 text-red-300 border border-red-500/40 animate-pulse">
            {urgentCount} Urgent
          </span>
        ) : (
          <span className="hidden lg:inline-flex items-center px-1.5 py-0.2 rounded-full text-[10px] font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
            Live
          </span>
        )}

        {/* Chevron Indicator */}
        <ChevronDown
          className={cn(
            "h-3 w-3 text-slate-400 transition-transform duration-300 group-hover:text-white",
            isOpen && "rotate-180"
          )}
        />
      </button>

      {/* 2. Expanded Dynamic Island Popover */}
      {isOpen && (
        <div
          className={cn(
            "absolute top-full left-1/2 -translate-x-1/2 mt-2.5",
            "w-[380px] sm:w-[440px] max-w-[95vw]",
            "rounded-3xl bg-slate-950/95 dark:bg-black/95 text-white backdrop-blur-2xl",
            "border border-white/15 dark:border-white/10 shadow-2xl",
            "p-4 z-50 animate-in fade-in-0 zoom-in-95 duration-200"
          )}
        >
          {/* Header */}
          <div className="flex items-center justify-between pb-3 border-b border-white/10">
            <div className="flex items-center gap-2">
              <div className="grid h-7 w-7 place-items-center rounded-xl bg-gradient-to-tr from-emerald-500 to-teal-500 text-white shadow-sm">
                <Layers className="h-4 w-4" />
              </div>
              <div>
                <h4 className="text-sm font-bold tracking-tight text-white flex items-center gap-1.5">
                  Live Workspace Tasks
                  <span className="inline-block h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                </h4>
                <p className="text-[11px] text-slate-400 truncate max-w-[220px]">
                  {activeWorkspace?.name || "Workspace Tasks"}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              {onCreateTaskClick && (
                <button
                  type="button"
                  onClick={() => {
                    setIsOpen(false);
                    onCreateTaskClick();
                  }}
                  className="grid h-7 w-7 place-items-center rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer"
                  title="Create new task"
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
              )}
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="grid h-7 w-7 place-items-center rounded-lg bg-white/10 hover:bg-white/20 text-slate-400 hover:text-white transition-colors cursor-pointer"
                title="Close"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {/* Filter Tabs */}
          <div className="flex items-center gap-1 mt-3 p-1 rounded-xl bg-white/5 border border-white/5">
            <button
              type="button"
              onClick={() => setActiveFilter("ONGOING")}
              className={cn(
                "flex-1 py-1 px-2 rounded-lg text-xs font-semibold transition-all cursor-pointer text-center",
                activeFilter === "ONGOING"
                  ? "bg-emerald-500/25 text-emerald-300 shadow-xs border border-emerald-500/30"
                  : "text-slate-400 hover:text-white"
              )}
            >
              Ongoing ({ongoingTasks.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveFilter("ALL_ACTIVE")}
              className={cn(
                "flex-1 py-1 px-2 rounded-lg text-xs font-semibold transition-all cursor-pointer text-center",
                activeFilter === "ALL_ACTIVE"
                  ? "bg-white/15 text-white shadow-xs border border-white/20"
                  : "text-slate-400 hover:text-white"
              )}
            >
              All Open ({allActiveTasks.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveFilter("MINE")}
              className={cn(
                "flex-1 py-1 px-2 rounded-lg text-xs font-semibold transition-all cursor-pointer text-center",
                activeFilter === "MINE"
                  ? "bg-primary/25 text-primary shadow-xs border border-primary/30"
                  : "text-slate-400 hover:text-white"
              )}
            >
              Assigned ({myTasks.length})
            </button>
          </div>

          {/* Task List Content */}
          <div className="mt-3 max-h-72 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
            {loading ? (
              <div className="flex flex-col items-center justify-center py-8 text-slate-400 gap-2">
                <span className="h-4 w-4 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin" />
                <span className="text-xs">Syncing workspace tasks...</span>
              </div>
            ) : displayedTasks.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center px-4">
                <div className="grid h-10 w-10 place-items-center rounded-2xl bg-emerald-500/10 text-emerald-400 mb-2">
                  <CheckCircle2 className="h-5 w-5" />
                </div>
                <p className="text-xs font-semibold text-slate-200">
                  {activeFilter === "ONGOING"
                    ? "No tasks currently in progress"
                    : activeFilter === "MINE"
                    ? "You have no assigned open tasks"
                    : "All workspace tasks are completed"}
                </p>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Tasks started by teammates will appear here in real-time.
                </p>
              </div>
            ) : (
              displayedTasks.map((task) => {
                const priorityInfo = priorityColor[task.priority] || priorityColor.MEDIUM;
                const isOngoing = task.status === "IN_PROGRESS";

                return (
                  <div
                    key={task.id}
                    onClick={() => {
                      setIsOpen(false);
                      navigate({ to: "/tasks", search: { taskId: task.id } as any });
                    }}
                    className={cn(
                      "group relative flex items-start justify-between gap-3 p-3 rounded-2xl",
                      "bg-white/[0.04] hover:bg-white/[0.08] border border-white/5 hover:border-white/15",
                      "transition-all duration-200 cursor-pointer"
                    )}
                  >
                    <div className="flex-1 min-w-0">
                      {/* Top Badges */}
                      <div className="flex items-center gap-1.5 flex-wrap mb-1.5">
                        <span
                          className={cn(
                            "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border",
                            priorityInfo.bg,
                            priorityInfo.text
                          )}
                        >
                          {priorityInfo.icon} {task.priority}
                        </span>

                        <span
                          className={cn(
                            "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border",
                            isOngoing
                              ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/30"
                              : "bg-slate-500/20 text-slate-300 border-slate-500/30"
                          )}
                        >
                          {isOngoing && <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />}
                          {task.status.replace("_", " ")}
                        </span>

                        {task.isOverdue && (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-red-500/30 text-red-300 border border-red-500/40">
                            Overdue
                          </span>
                        )}
                      </div>

                      {/* Title */}
                      <h5 className="text-xs font-semibold text-slate-100 group-hover:text-white line-clamp-1 transition-colors">
                        {task.title}
                      </h5>

                      {/* Assignee & Due Date Footer */}
                      <div className="flex items-center gap-3 mt-2 text-[11px] text-slate-400">
                        {task.assignee ? (
                          <div className="flex items-center gap-1.5 shrink-0">
                            <div className="h-4 w-4 rounded-full bg-primary/30 text-primary grid place-items-center text-[9px] font-bold">
                              {task.assignee.initials || "U"}
                            </div>
                            <span className="truncate max-w-[120px]">{task.assignee.displayName}</span>
                          </div>
                        ) : (
                          <span className="text-slate-500 italic">Unassigned</span>
                        )}

                        {task.dueDate && (
                          <div className="flex items-center gap-1 shrink-0">
                            <Clock className="h-3 w-3 text-slate-500" />
                            <span>{new Date(task.dueDate).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Quick Advance Button */}
                    <button
                      type="button"
                      onClick={(e) => handleQuickAdvance(e, task)}
                      className={cn(
                        "shrink-0 h-7 w-7 mt-1 grid place-items-center rounded-xl",
                        "bg-white/10 hover:bg-emerald-500 text-slate-300 hover:text-white",
                        "border border-white/10 hover:border-emerald-400 shadow-sm",
                        "transition-all duration-200 cursor-pointer"
                      )}
                      title={task.status === "TODO" ? "Start Task (In Progress)" : "Mark Done"}
                    >
                      <Check className="h-3.5 w-3.5" />
                    </button>
                  </div>
                );
              })
            )}
          </div>

          {/* Footer Bar */}
          <div className="mt-3 pt-3 border-t border-white/10 flex items-center justify-end">
            <button
              type="button"
              onClick={() => {
                setIsOpen(false);
                navigate({ to: "/tasks" });
              }}
              className="inline-flex items-center gap-1 text-xs font-bold text-emerald-400 hover:text-emerald-300 hover:underline cursor-pointer"
            >
              Open Full Task Board
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
