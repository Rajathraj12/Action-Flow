import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import {
  ArrowLeft,
  CheckCircle2,
  CircleDashed,
  CircleDot,
  XCircle,
  Calendar,
  Plus,
  CheckSquare,
  Clock,
  Sparkles,
  Filter,
} from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/tasks")({
  head: () => ({
    meta: [{ title: "My Tasks — ActionFlow" }],
  }),
  component: TasksPage,
});

interface TaskItem {
  id: string;
  title: string;
  deadline: string;
  priority: "High" | "Medium" | "Low";
  status: "pending" | "in-progress" | "completed";
  source?: string;
}

const INITIAL_TASKS: TaskItem[] = [
  {
    id: "task-1",
    title: "Verify Firebase session persistence across browser reloads",
    deadline: "Today, 5:00 PM",
    priority: "High",
    status: "in-progress",
    source: "Chat with Ankit",
  },
  {
    id: "task-2",
    title: "Raise MongoDB Atlas connection timeout to 15s with auto-retry",
    deadline: "Tomorrow, 12:00 PM",
    priority: "High",
    status: "completed",
    source: "Backend Sprint",
  },
  {
    id: "task-3",
    title: "Design hover reaction pill bar and quick emoji picker drawer",
    deadline: "Oct 20, 4:00 PM",
    priority: "Medium",
    status: "completed",
    source: "UI/UX Overhaul",
  },
  {
    id: "task-4",
    title: "Test multi-user real-time chat sync across Rajath & Ankit accounts",
    deadline: "Oct 22, 6:00 PM",
    priority: "Medium",
    status: "pending",
    source: "ActionFlow Testing",
  },
];

function TasksPage() {
  const [tasks, setTasks] = useState<TaskItem[]>(INITIAL_TASKS);
  const [activeFilter, setActiveFilter] = useState<"all" | "in-progress" | "completed" | "pending">("all");
  const [isAdding, setIsAdding] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskPriority, setNewTaskPriority] = useState<"High" | "Medium" | "Low">("Medium");

  const toggleTaskStatus = (id: string) => {
    setTasks((prev) =>
      prev.map((t) => {
        if (t.id === id) {
          const nextStatus = t.status === "completed" ? "in-progress" : "completed";
          return { ...t, status: nextStatus };
        }
        return t;
      })
    );
  };

  const handleAddTask = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTaskTitle.trim()) return;
    const newTask: TaskItem = {
      id: `task-${Date.now()}`,
      title: newTaskTitle.trim(),
      deadline: "Due this week",
      priority: newTaskPriority,
      status: "in-progress",
      source: "Manual Assignment",
    };
    setTasks([newTask, ...tasks]);
    setNewTaskTitle("");
    setIsAdding(false);
  };

  const filteredTasks = tasks.filter((t) => {
    if (activeFilter === "all") return true;
    return t.status === activeFilter;
  });

  const completedCount = tasks.filter((t) => t.status === "completed").length;
  const inProgressCount = tasks.filter((t) => t.status === "in-progress").length;
  const pendingCount = tasks.filter((t) => t.status === "pending").length;

  return (
    <div className="flex flex-col flex-1 h-full w-full bg-background relative overflow-hidden">
      {/* Ambient decorative blur */}
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
              {completedCount} of {tasks.length} tasks completed
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setIsAdding(!isAdding)}
          className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-3.5 py-1.5 text-xs font-semibold text-primary-foreground shadow-xs hover:bg-primary/90 transition-all active:scale-95 cursor-pointer"
        >
          <Plus className="h-4 w-4" />
          <span>New Task</span>
        </button>
      </header>

      <main className="flex-1 overflow-y-auto p-6 md:p-8 z-10 custom-scrollbar">
        <div className="mx-auto max-w-4xl space-y-6">
          {/* Top Filter and Progress Banner */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            {/* Filter Tabs */}
            <div className="flex items-center gap-1.5 p-1 rounded-xl bg-muted/50 border border-border/60 backdrop-blur-xs self-start">
              <button
                type="button"
                onClick={() => setActiveFilter("all")}
                className={cn(
                  "px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer",
                  activeFilter === "all"
                    ? "bg-card text-foreground shadow-xs"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                All ({tasks.length})
              </button>
              <button
                type="button"
                onClick={() => setActiveFilter("in-progress")}
                className={cn(
                  "px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer",
                  activeFilter === "in-progress"
                    ? "bg-card text-amber-600 dark:text-amber-400 shadow-xs"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                In Progress ({inProgressCount})
              </button>
              <button
                type="button"
                onClick={() => setActiveFilter("completed")}
                className={cn(
                  "px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer",
                  activeFilter === "completed"
                    ? "bg-card text-emerald-600 dark:text-emerald-400 shadow-xs"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                Completed ({completedCount})
              </button>
            </div>

            {/* Progress Bar */}
            <div className="flex items-center gap-3">
              <span className="text-xs font-medium text-muted-foreground">
                {Math.round((completedCount / (tasks.length || 1)) * 100)}% Complete
              </span>
              <div className="w-28 h-2 rounded-full bg-muted overflow-hidden border border-border/40">
                <div
                  className="h-full bg-gradient-to-r from-primary to-emerald-500 rounded-full transition-all duration-500"
                  style={{ width: `${(completedCount / (tasks.length || 1)) * 100}%` }}
                />
              </div>
            </div>
          </div>

          {/* Quick Add Form Drawer */}
          {isAdding && (
            <form
              onSubmit={handleAddTask}
              className="rounded-2xl border border-primary/30 bg-card/90 backdrop-blur-md p-4 shadow-lg space-y-3 animate-in fade-in slide-in-from-top-2"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
                  <Sparkles className="h-3.5 w-3.5 text-primary" />
                  Create New Assignment
                </span>
                <button
                  type="button"
                  onClick={() => setIsAdding(false)}
                  className="text-xs text-muted-foreground hover:text-foreground cursor-pointer"
                >
                  ✕
                </button>
              </div>

              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="text"
                  value={newTaskTitle}
                  onChange={(e) => setNewTaskTitle(e.target.value)}
                  placeholder="What needs to be done?..."
                  autoFocus
                  className="flex-1 rounded-xl border border-border bg-background px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                />

                <div className="flex items-center gap-2">
                  <select
                    value={newTaskPriority}
                    onChange={(e) => setNewTaskPriority(e.target.value as any)}
                    className="rounded-xl border border-border bg-background px-3 py-2 text-xs text-foreground cursor-pointer"
                  >
                    <option value="High">High Priority</option>
                    <option value="Medium">Medium Priority</option>
                    <option value="Low">Low Priority</option>
                  </select>

                  <button
                    type="submit"
                    className="rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground shadow-xs hover:bg-primary/90 transition-all cursor-pointer"
                  >
                    Save
                  </button>
                </div>
              </div>
            </form>
          )}

          {/* Task Cards List */}
          <div className="grid gap-3">
            {filteredTasks.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border/80 bg-card/40 p-12 text-center backdrop-blur-xs flex flex-col items-center justify-center gap-2">
                <CheckCircle2 className="mx-auto h-10 w-10 text-muted-foreground/30 mb-1" />
                <h3 className="font-semibold text-foreground text-base">
                  No tasks match this filter
                </h3>
                <p className="text-xs text-muted-foreground max-w-sm">
                  You are all caught up! Click "New Task" above or check another tab.
                </p>
              </div>
            ) : (
              filteredTasks.map((task) => (
                <TaskCard
                  key={task.id}
                  task={task}
                  onToggle={() => toggleTaskStatus(task.id)}
                />
              ))
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

function TaskCard({
  task,
  onToggle,
}: {
  task: TaskItem;
  onToggle: () => void;
}) {
  const getStatusConfig = (status: TaskItem["status"]) => {
    switch (status) {
      case "completed":
        return {
          icon: <CheckCircle2 className="h-5 w-5 text-emerald-500 fill-emerald-500/20" />,
          text: "text-emerald-600 dark:text-emerald-400",
          label: "Completed",
          bg: "bg-emerald-500/10 border-emerald-500/20",
        };
      case "in-progress":
        return {
          icon: <CircleDot className="h-5 w-5 text-amber-500 fill-amber-500/20" />,
          text: "text-amber-600 dark:text-amber-400",
          label: "In Progress",
          bg: "bg-amber-500/10 border-amber-500/20",
        };
      default:
        return {
          icon: <CircleDashed className="h-5 w-5 text-slate-400" />,
          text: "text-slate-500 dark:text-slate-400",
          label: "Pending",
          bg: "bg-slate-500/10 border-slate-500/20",
        };
    }
  };

  const config = getStatusConfig(task.status);
  const isCompleted = task.status === "completed";

  return (
    <div
      onClick={onToggle}
      className={cn(
        "group relative flex flex-col sm:flex-row sm:items-center gap-4 rounded-2xl border border-border/80 bg-card/90 p-4.5 shadow-xs backdrop-blur-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md hover:border-primary/40 cursor-pointer animate-in fade-in slide-in-from-bottom-1",
        isCompleted && "opacity-80 bg-muted/20"
      )}
    >
      <div className="shrink-0 transition-transform group-hover:scale-110">
        {config.icon}
      </div>

      <div className="flex-1 min-w-0">
        <h3
          className={cn(
            "text-sm font-semibold truncate transition-all text-foreground",
            isCompleted && "line-through text-muted-foreground"
          )}
        >
          {task.title}
        </h3>

        <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          <div className="flex items-center gap-1">
            <Calendar className="h-3.5 w-3.5 text-muted-foreground/70" />
            <span>{task.deadline}</span>
          </div>

          <span
            className={cn(
              "px-2 py-0.5 rounded-full text-[10px] font-semibold border",
              task.priority === "High"
                ? "border-red-500/30 text-red-600 dark:text-red-400 bg-red-500/10"
                : task.priority === "Medium"
                ? "border-amber-500/30 text-amber-600 dark:text-amber-400 bg-amber-500/10"
                : "border-slate-500/30 text-slate-600 dark:text-slate-400 bg-slate-500/10"
            )}
          >
            {task.priority} Priority
          </span>

          {task.source && (
            <span className="text-[11px] text-muted-foreground/60 hidden sm:inline">
              via {task.source}
            </span>
          )}
        </div>
      </div>

      <div className="shrink-0 flex items-center justify-between sm:justify-end gap-2 pt-1 sm:pt-0 border-t border-border/40 sm:border-none">
        <span
          className={cn(
            "text-xs font-semibold px-2.5 py-0.5 rounded-full border",
            config.bg,
            config.text
          )}
        >
          {config.label}
        </span>
      </div>
    </div>
  );
}

