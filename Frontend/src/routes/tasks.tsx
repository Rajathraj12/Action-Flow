import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, useCallback, useMemo } from "react";
import {
  CheckSquare,
  CheckCircle2,
  CircleDashed,
  CircleDot,
  Clock,
  Calendar,
  Plus,
  Search,
  Filter,
  X,
  AlertTriangle,
  MessageSquare,
  User,
  Loader2,
  RotateCcw,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useAuth } from "@/context/AuthContext";
import { useWorkspace } from "@/context/WorkspaceContext";
import {
  api,
  type BackendTask,
  type TaskStatus,
  type TaskPriority,
} from "@/lib/api";
import {
  getSocket,
  joinWorkspaceRoom,
  leaveWorkspaceRoom,
} from "@/lib/socket";
import { CreateTaskModal } from "@/components/tasks/CreateTaskModal";
import { TaskDetailModal } from "@/components/tasks/TaskDetailModal";

export const Route = createFileRoute("/tasks")({
  head: () => ({
    meta: [{ title: "My Tasks — ActionFlow" }],
  }),
  component: TasksPage,
});

type TaskTab = "all" | "assigned" | "created" | "completed" | "overdue";

function TasksPage() {
  const { user, token } = useAuth();
  const { activeWorkspace } = useWorkspace();
  const navigate = useNavigate();

  const [tasks, setTasks] = useState<BackendTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filter and Search State
  const [activeTab, setActiveTab] = useState<TaskTab>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [priorityFilter, setPriorityFilter] = useState<string>("ALL");

  // Modals
  const [selectedTask, setSelectedTask] = useState<BackendTask | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  // Fetch tasks from backend
  const fetchTasks = useCallback(async () => {
    if (!token || !activeWorkspace?.id) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api.getTasks(activeWorkspace.id, {
        filter: activeTab,
        search: searchQuery.trim() || undefined,
        status: statusFilter !== "ALL" ? statusFilter : undefined,
        priority: priorityFilter !== "ALL" ? priorityFilter : undefined,
      });
      setTasks(res.tasks);
    } catch (err: any) {
      console.error("[TasksPage] Failed to fetch tasks:", err);
      setError(err.message || "Failed to load tasks");
    } finally {
      setLoading(false);
    }
  }, [token, activeWorkspace?.id, activeTab, searchQuery, statusFilter, priorityFilter]);

  // Load tasks on filter changes
  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  // Socket.IO Real-time task listener
  useEffect(() => {
    if (!token || !activeWorkspace?.id) return;
    joinWorkspaceRoom(activeWorkspace.id);

    const socket = getSocket();
    if (!socket) return;

    const handleTaskCreated = (newTask: BackendTask) => {
      fetchTasks();
    };

    const handleTaskUpdated = (updatedTask: BackendTask) => {
      setTasks((prev) =>
        prev.map((t) => (t.id === updatedTask.id ? { ...t, ...updatedTask } : t))
      );
      if (selectedTask?.id === updatedTask.id) {
        setSelectedTask(updatedTask);
      }
    };

    const handleTaskAssigned = (data: { task: BackendTask; newAssigneeId: string }) => {
      fetchTasks();
      if (data.newAssigneeId === user?._id) {
        toast.info(`You have been assigned to task: "${data.task.title}"`);
      }
    };

    const handleTaskStatusChanged = (data: { task: BackendTask; newStatus: TaskStatus }) => {
      fetchTasks();
      if (
        data.task.assignee?.id === user?._id ||
        data.task.createdBy?.id === user?._id
      ) {
        toast.info(`Task "${data.task.title}" is now ${data.newStatus}`);
      }
    };

    const handleTaskDeleted = () => {
      fetchTasks();
    };

    socket.on("task:created", handleTaskCreated);
    socket.on("task:updated", handleTaskUpdated);
    socket.on("task:assigned", handleTaskAssigned);
    socket.on("task:status_changed", handleTaskStatusChanged);
    socket.on("task:completed", handleTaskUpdated);
    socket.on("task:deleted", handleTaskDeleted);

    return () => {
      socket.off("task:created", handleTaskCreated);
      socket.off("task:updated", handleTaskUpdated);
      socket.off("task:assigned", handleTaskAssigned);
      socket.off("task:status_changed", handleTaskStatusChanged);
      socket.off("task:completed", handleTaskUpdated);
      socket.off("task:deleted", handleTaskDeleted);
      leaveWorkspaceRoom(activeWorkspace.id);
    };
  }, [token, activeWorkspace?.id, user?._id, selectedTask?.id, fetchTasks]);

  // Quick toggle status between completed and in-progress/todo
  const handleQuickToggleStatus = async (task: BackendTask, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!activeWorkspace?.id) return;
    const newStatus: TaskStatus = task.status === "DONE" ? "IN_PROGRESS" : "DONE";
    try {
      const res = await api.updateTaskStatus(activeWorkspace.id, task.id, newStatus);
      setTasks((prev) =>
        prev.map((t) => (t.id === task.id ? { ...t, status: res.task.status } : t))
      );
      toast.success(
        res.task.status === "DONE"
          ? `Marked "${task.title}" as Done`
          : `Reopened "${task.title}"`
      );
    } catch (err: any) {
      toast.error(err.message || "Failed to update task status");
    }
  };

  // Navigate to original source message in Messenger
  const handleNavigateToSource = (conversationId: string, messageId: string) => {
    setIsDetailOpen(false);
    navigate({
      to: "/",
      search: {
        conversationId,
        messageId,
      } as any,
    });
  };

  // Counts for summary progress
  const completedCount = useMemo(
    () => tasks.filter((t) => t.status === "DONE").length,
    [tasks]
  );
  const overdueCount = useMemo(
    () =>
      tasks.filter(
        (t) =>
          t.status !== "DONE" &&
          t.dueDate &&
          new Date(t.dueDate).getTime() < Date.now()
      ).length,
    [tasks]
  );

  const hasActiveFilters =
    searchQuery.trim() !== "" ||
    statusFilter !== "ALL" ||
    priorityFilter !== "ALL";

  const clearFilters = () => {
    setSearchQuery("");
    setStatusFilter("ALL");
    setPriorityFilter("ALL");
  };

  return (
    <div className="flex flex-col flex-1 h-full w-full bg-background relative overflow-hidden">
      {/* Ambient background glows */}
      <div className="pointer-events-none absolute -top-40 -left-40 h-96 w-96 rounded-full bg-primary/10 blur-3xl" />
      <div className="pointer-events-none absolute bottom-0 right-0 h-96 w-96 rounded-full bg-emerald-500/10 blur-3xl" />

      {/* Header */}
      <header className="flex h-16 shrink-0 items-center justify-between border-b border-border/80 bg-card/60 backdrop-blur-md px-6 z-10">
        <div className="flex items-center gap-3">
          <div className="grid h-9 w-9 place-items-center rounded-xl bg-primary/15 text-primary shadow-xs">
            <CheckSquare className="h-5 w-5" />
          </div>
          <div>
            <h1 className="font-display text-lg font-bold tracking-tight text-foreground">
              My Tasks
            </h1>
            <p className="text-[11px] text-muted-foreground hidden sm:block">
              {activeWorkspace?.name || "Workspace"} • {completedCount} of {tasks.length} tasks completed
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setIsCreateOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-3.5 py-1.5 text-xs font-semibold text-primary-foreground shadow-xs hover:bg-primary/90 transition-all active:scale-95 cursor-pointer"
        >
          <Plus className="h-4 w-4" />
          <span>New Task</span>
        </button>
      </header>

      <main className="flex-1 overflow-y-auto p-6 md:p-8 z-10 custom-scrollbar">
        <div className="mx-auto max-w-5xl space-y-6">
          {/* Top Filter and Progress Banner */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            {/* View Tabs */}
            <div className="flex flex-wrap items-center gap-1.5 p-1 rounded-xl bg-muted/50 border border-border/60 backdrop-blur-xs self-start">
              <button
                type="button"
                onClick={() => setActiveTab("all")}
                className={cn(
                  "px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer",
                  activeTab === "all"
                    ? "bg-card text-foreground shadow-xs"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                All My Tasks
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("assigned")}
                className={cn(
                  "px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer",
                  activeTab === "assigned"
                    ? "bg-card text-primary shadow-xs"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                Assigned to Me
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("created")}
                className={cn(
                  "px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer",
                  activeTab === "created"
                    ? "bg-card text-foreground shadow-xs"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                Created by Me
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("completed")}
                className={cn(
                  "px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer",
                  activeTab === "completed"
                    ? "bg-card text-emerald-600 dark:text-emerald-400 shadow-xs"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                Completed
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("overdue")}
                className={cn(
                  "flex items-center gap-1 px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer",
                  activeTab === "overdue"
                    ? "bg-card text-rose-600 dark:text-rose-400 shadow-xs"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <span>Overdue</span>
                {overdueCount > 0 && (
                  <span className="grid h-4 w-4 place-items-center rounded-full bg-rose-500/20 text-[10px] font-bold text-rose-600 dark:text-rose-400">
                    {overdueCount}
                  </span>
                )}
              </button>
            </div>

            {/* Progress Bar */}
            <div className="flex items-center gap-3">
              <span className="text-xs font-medium text-muted-foreground">
                {Math.round((completedCount / (tasks.length || 1)) * 100)}% Complete
              </span>
              <div className="w-32 h-2 rounded-full bg-muted overflow-hidden border border-border/40">
                <div
                  className="h-full bg-gradient-to-r from-primary to-emerald-500 rounded-full transition-all duration-500"
                  style={{
                    width: `${Math.min(
                      100,
                      Math.round((completedCount / (tasks.length || 1)) * 100)
                    )}%`,
                  }}
                />
              </div>
            </div>
          </div>

          {/* Search & Filter Bar */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-3 rounded-2xl bg-card/60 border border-border/70 backdrop-blur-md shadow-xs">
            {/* Search Input */}
            <div className="relative flex-1">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search tasks by title..."
                className="w-full rounded-xl border border-border bg-background/80 pl-9 pr-8 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2.5 top-2.5 text-muted-foreground hover:text-foreground cursor-pointer"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            {/* Status & Priority dropdowns */}
            <div className="flex items-center gap-2">
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="rounded-xl border border-border bg-background px-3 py-1.5 text-xs text-foreground cursor-pointer focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="ALL">All Statuses</option>
                <option value="TODO">To Do</option>
                <option value="IN_PROGRESS">In Progress</option>
                <option value="IN_REVIEW">In Review</option>
                <option value="DONE">Done</option>
              </select>

              <select
                value={priorityFilter}
                onChange={(e) => setPriorityFilter(e.target.value)}
                className="rounded-xl border border-border bg-background px-3 py-1.5 text-xs text-foreground cursor-pointer focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="ALL">All Priorities</option>
                <option value="URGENT">Urgent</option>
                <option value="HIGH">High</option>
                <option value="MEDIUM">Medium</option>
                <option value="LOW">Low</option>
              </select>

              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={clearFilters}
                  className="inline-flex items-center gap-1 rounded-xl bg-muted px-2.5 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                  title="Clear all filters"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Reset</span>
                </button>
              )}
            </div>
          </div>

          {/* Task Cards List */}
          {loading ? (
            <div className="rounded-2xl border border-border bg-card/40 p-16 text-center backdrop-blur-xs flex flex-col items-center justify-center gap-3">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-xs text-muted-foreground font-medium">
                Loading workspace tasks...
              </p>
            </div>
          ) : error ? (
            <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-12 text-center backdrop-blur-xs flex flex-col items-center justify-center gap-3">
              <AlertTriangle className="h-8 w-8 text-destructive" />
              <p className="text-xs font-semibold text-destructive">{error}</p>
              <button
                type="button"
                onClick={fetchTasks}
                className="mt-2 inline-flex items-center gap-1.5 rounded-xl bg-destructive px-3.5 py-1.5 text-xs font-semibold text-destructive-foreground hover:bg-destructive/90 cursor-pointer shadow-xs"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                <span>Retry</span>
              </button>
            </div>
          ) : tasks.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border/80 bg-card/40 p-16 text-center backdrop-blur-xs flex flex-col items-center justify-center gap-3">
              <div className="grid h-12 w-12 place-items-center rounded-2xl bg-primary/10 text-primary mb-1">
                <CheckCircle2 className="h-6 w-6" />
              </div>
              <h3 className="font-semibold text-foreground text-base">
                {hasActiveFilters ? "No matching tasks found" : "No tasks in this view"}
              </h3>
              <p className="text-xs text-muted-foreground max-w-sm">
                {hasActiveFilters
                  ? "Try clearing your search query or adjusting your status and priority filters."
                  : "You're all caught up! Create a new task or convert any message into a task from Messenger."}
              </p>
              {hasActiveFilters ? (
                <button
                  type="button"
                  onClick={clearFilters}
                  className="mt-2 text-xs font-semibold text-primary hover:underline cursor-pointer"
                >
                  Clear filters
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setIsCreateOpen(true)}
                  className="mt-2 inline-flex items-center gap-1.5 rounded-xl bg-primary px-3.5 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 transition-all cursor-pointer shadow-xs"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>Create Task</span>
                </button>
              )}
            </div>
          ) : (
            <div className="grid gap-3">
              {tasks.map((task) => {
                const isDone = task.status === "DONE";
                const isOverdue =
                  !isDone &&
                  task.dueDate &&
                  new Date(task.dueDate).getTime() < Date.now();

                return (
                  <div
                    key={task.id}
                    onClick={() => {
                      setSelectedTask(task);
                      setIsDetailOpen(true);
                    }}
                    className={cn(
                      "group relative flex flex-col sm:flex-row sm:items-center justify-between gap-3.5 rounded-2xl border p-4 transition-all duration-200 cursor-pointer",
                      isDone
                        ? "border-border/60 bg-card/40 opacity-75 hover:opacity-100 hover:bg-card/70"
                        : "border-border bg-card/80 backdrop-blur-sm shadow-xs hover:border-primary/40 hover:shadow-md hover:scale-[1.005]"
                    )}
                  >
                    {/* Left: Quick Checkbox + Title + Description */}
                    <div className="flex items-start gap-3.5 min-w-0 flex-1">
                      <button
                        type="button"
                        onClick={(e) => handleQuickToggleStatus(task, e)}
                        className={cn(
                          "mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-lg border transition-all cursor-pointer",
                          isDone
                            ? "bg-emerald-500 text-white border-emerald-500 shadow-xs"
                            : "border-border bg-background hover:border-primary text-transparent hover:text-muted-foreground"
                        )}
                        title={isDone ? "Mark as In Progress" : "Mark as Done"}
                      >
                        <CheckCircle2 className="h-4 w-4" />
                      </button>

                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h4
                            className={cn(
                              "text-sm font-semibold transition-colors",
                              isDone
                                ? "line-through text-muted-foreground"
                                : "text-foreground group-hover:text-primary"
                            )}
                          >
                            {task.title}
                          </h4>

                          {/* Source Message Badge */}
                          {task.sourceMessageId && (
                            <span
                              className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary border border-primary/20"
                              title="Created from Messenger conversation"
                            >
                              <MessageSquare className="h-3 w-3" />
                              <span>From Chat</span>
                            </span>
                          )}
                        </div>

                        {task.description && (
                          <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">
                            {task.description}
                          </p>
                        )}

                        <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
                          {/* Assignee */}
                          <div className="flex items-center gap-1.5">
                            <div className="grid h-5 w-5 place-items-center rounded-full bg-primary/15 text-[10px] font-bold text-primary">
                              {task.assignee?.initials ||
                                task.assignee?.displayName?.charAt(0) ||
                                "U"}
                            </div>
                            <span>
                              {task.assignee?.displayName || "Unassigned"}
                            </span>
                          </div>

                          <span>•</span>

                          {/* Due Date & Overdue */}
                          {task.dueDate ? (
                            <div
                              className={cn(
                                "flex items-center gap-1 font-medium",
                                isOverdue
                                  ? "text-rose-600 dark:text-rose-400 font-bold"
                                  : "text-muted-foreground"
                              )}
                            >
                              {isOverdue ? (
                                <AlertTriangle className="h-3 w-3 text-rose-500 animate-pulse" />
                              ) : (
                                <Clock className="h-3 w-3" />
                              )}
                              <span>
                                {isOverdue
                                  ? `Overdue: ${new Date(task.dueDate).toLocaleDateString([], {
                                      month: "short",
                                      day: "numeric",
                                    })}`
                                  : `Due ${new Date(task.dueDate).toLocaleDateString([], {
                                      month: "short",
                                      day: "numeric",
                                      hour: "2-digit",
                                      minute: "2-digit",
                                    })}`}
                              </span>
                            </div>
                          ) : (
                            <span className="italic text-muted-foreground/80">
                              No deadline
                            </span>
                          )}

                          <span>•</span>

                          {/* Created date */}
                          <span>
                            Created{" "}
                            {new Date(task.createdAt).toLocaleDateString([], {
                              month: "short",
                              day: "numeric",
                            })}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Right: Status and Priority Badges */}
                    <div className="flex items-center gap-2 self-start sm:self-center shrink-0">
                      {/* Priority Badge */}
                      <span
                        className={cn(
                          "rounded-lg px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider border shadow-xs",
                          task.priority === "URGENT" &&
                            "bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/30",
                          task.priority === "HIGH" &&
                            "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30",
                          task.priority === "MEDIUM" &&
                            "bg-sky-500/15 text-sky-600 dark:text-sky-400 border-sky-500/30",
                          task.priority === "LOW" &&
                            "bg-slate-500/15 text-slate-600 dark:text-slate-400 border-slate-500/30"
                        )}
                      >
                        {task.priority}
                      </span>

                      {/* Status Badge */}
                      <span
                        className={cn(
                          "rounded-lg px-2.5 py-1 text-[11px] font-semibold border shadow-xs",
                          task.status === "DONE" &&
                            "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30",
                          task.status === "IN_REVIEW" &&
                            "bg-purple-500/15 text-purple-600 dark:text-purple-400 border-purple-500/30",
                          task.status === "IN_PROGRESS" &&
                            "bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30",
                          task.status === "TODO" &&
                            "bg-muted text-muted-foreground border-border"
                        )}
                      >
                        {task.status.replace("_", " ")}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </main>

      {/* Task Creation Modal */}
      <CreateTaskModal
        open={isCreateOpen}
        onOpenChange={setIsCreateOpen}
        workspaceId={activeWorkspace?.id}
        currentUserId={user?._id}
        onTaskCreated={(newTask) => {
          fetchTasks();
          toast.success(`Task "${newTask.title}" created successfully!`);
        }}
      />

      {/* Task Detail & Editing Modal */}
      <TaskDetailModal
        open={isDetailOpen}
        onOpenChange={setIsDetailOpen}
        task={selectedTask}
        workspaceId={activeWorkspace?.id}
        currentUserId={user?._id}
        onTaskUpdated={fetchTasks}
        onTaskDeleted={fetchTasks}
        onNavigateToSourceMessage={handleNavigateToSource}
      />
    </div>
  );
}
