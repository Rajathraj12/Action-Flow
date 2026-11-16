import React, { useState, useMemo } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Calendar as CalendarIcon,
  Clock,
  AlertTriangle,
  CheckCircle2,
  CircleDashed,
  Plus,
  Flame,
  Zap,
  User,
  X,
  Layers,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { BackendTask, TaskPriority, TaskStatus } from "@/lib/api";

interface TaskCalendarViewProps {
  tasks: BackendTask[];
  onSelectTask: (task: BackendTask) => void;
  onCreateTaskOnDate: (date: Date) => void;
  className?: string;
}

const DAYS_OF_WEEK = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function TaskCalendarView({
  tasks,
  onSelectTask,
  onCreateTaskOnDate,
  className,
}: TaskCalendarViewProps) {
  // Current viewing month/year state
  const [currentDate, setCurrentDate] = useState(() => new Date());
  const [selectedDayTasks, setSelectedDayTasks] = useState<{
    date: Date;
    tasks: BackendTask[];
  } | null>(null);
  const [showNoDeadlineDrawer, setShowNoDeadlineDrawer] = useState(false);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  // Navigation handlers
  const handlePrevMonth = () => {
    setCurrentDate(new Date(year, month - 1, 1));
  };

  const handleNextMonth = () => {
    setCurrentDate(new Date(year, month + 1, 1));
  };

  const handleToday = () => {
    setCurrentDate(new Date());
  };

  const monthName = currentDate.toLocaleString("default", { month: "long" });

  // Separate tasks with and without deadlines
  const { tasksWithDeadline, tasksWithoutDeadline } = useMemo(() => {
    const withDeadlines: BackendTask[] = [];
    const withoutDeadlines: BackendTask[] = [];

    for (const t of tasks) {
      if (t.dueDate) {
        withDeadlines.push(t);
      } else {
        withoutDeadlines.push(t);
      }
    }
    return { tasksWithDeadline: withDeadlines, tasksWithoutDeadline: withoutDeadlines };
  }, [tasks]);

  // Map tasks by date key (YYYY-M-D) for instant O(1) cell lookup
  const tasksByDate = useMemo(() => {
    const map = new Map<string, BackendTask[]>();

    for (const task of tasksWithDeadline) {
      if (!task.dueDate) continue;
      const d = new Date(task.dueDate);
      if (isNaN(d.getTime())) continue;

      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      const existing = map.get(key) || [];
      existing.push(task);
      map.set(key, existing);
    }

    // Sort tasks on each day by priority: URGENT > HIGH > MEDIUM > LOW
    const priorityWeight: Record<TaskPriority, number> = {
      URGENT: 4,
      HIGH: 3,
      MEDIUM: 2,
      LOW: 1,
    };

    map.forEach((taskList) => {
      taskList.sort((a, b) => priorityWeight[b.priority] - priorityWeight[a.priority]);
    });

    return map;
  }, [tasksWithDeadline]);

  // Compute 35 or 42 grid cells for the month
  const calendarCells = useMemo(() => {
    const firstDayOfMonth = new Date(year, month, 1);
    const lastDayOfMonth = new Date(year, month + 1, 0);

    const firstDayWeekday = firstDayOfMonth.getDay(); // 0 (Sun) to 6 (Sat)
    const totalDaysInMonth = lastDayOfMonth.getDate();

    const cells: Array<{
      date: Date;
      isCurrentMonth: boolean;
      isToday: boolean;
      dateKey: string;
    }> = [];

    const today = new Date();
    const todayKey = `${today.getFullYear()}-${today.getMonth()}-${today.getDate()}`;

    // 1. Preceding days from previous month
    const prevMonthLastDay = new Date(year, month, 0).getDate();
    for (let i = firstDayWeekday - 1; i >= 0; i--) {
      const dayNum = prevMonthLastDay - i;
      const d = new Date(year, month - 1, dayNum);
      cells.push({
        date: d,
        isCurrentMonth: false,
        isToday: `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}` === todayKey,
        dateKey: `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`,
      });
    }

    // 2. Current month days
    for (let day = 1; day <= totalDaysInMonth; day++) {
      const d = new Date(year, month, day);
      cells.push({
        date: d,
        isCurrentMonth: true,
        isToday: `${year}-${month}-${day}` === todayKey,
        dateKey: `${year}-${month}-${day}`,
      });
    }

    // 3. Succeeding days from next month to complete the row
    const remainingCells = 7 - (cells.length % 7);
    if (remainingCells < 7) {
      for (let day = 1; day <= remainingCells; day++) {
        const d = new Date(year, month + 1, day);
        cells.push({
          date: d,
          isCurrentMonth: false,
          isToday: `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}` === todayKey,
          dateKey: `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`,
        });
      }
    }

    return cells;
  }, [year, month]);

  // Summary counts
  const dueThisMonthCount = useMemo(() => {
    return tasksWithDeadline.filter((t) => {
      if (!t.dueDate) return false;
      const d = new Date(t.dueDate);
      return d.getFullYear() === year && d.getMonth() === month && t.status !== "DONE";
    }).length;
  }, [tasksWithDeadline, year, month]);

  const overdueCount = useMemo(() => {
    const now = Date.now();
    return tasksWithDeadline.filter((t) => {
      if (!t.dueDate || t.status === "DONE") return false;
      return new Date(t.dueDate).getTime() < now;
    }).length;
  }, [tasksWithDeadline]);

  // Priority Styling Mapping
  const getPriorityStyle = (priority: TaskPriority, status: TaskStatus) => {
    if (status === "DONE") {
      return "bg-slate-100 dark:bg-slate-900/60 text-slate-500 dark:text-slate-400 border-l-2 border-emerald-500 opacity-60 line-through";
    }

    switch (priority) {
      case "URGENT":
        return "bg-rose-500/15 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border-l-2 border-rose-500 hover:bg-rose-500/25";
      case "HIGH":
        return "bg-amber-500/15 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 border-l-2 border-amber-500 hover:bg-amber-500/25";
      case "MEDIUM":
        return "bg-sky-500/15 dark:bg-sky-950/40 text-sky-800 dark:text-sky-300 border-l-2 border-sky-500 hover:bg-sky-500/25";
      case "LOW":
      default:
        return "bg-slate-500/15 dark:bg-slate-800/40 text-slate-700 dark:text-slate-300 border-l-2 border-slate-400 hover:bg-slate-500/25";
    }
  };

  return (
    <div className={cn("flex flex-col space-y-4", className)}>
      {/* 1. Google Calendar Control Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-2xl bg-card/70 border border-border/80 backdrop-blur-md shadow-xs">
        {/* Navigation & Month Title */}
        <div className="flex items-center gap-3">
          <div className="flex items-center rounded-xl border border-border/70 bg-background/80 p-0.5 shadow-2xs">
            <button
              type="button"
              onClick={handlePrevMonth}
              className="grid h-8 w-8 place-items-center rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-all cursor-pointer"
              title="Previous month"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={handleToday}
              className="px-2.5 h-8 text-xs font-semibold text-foreground hover:bg-muted rounded-lg transition-all cursor-pointer"
              title="Jump to today"
            >
              Today
            </button>
            <button
              type="button"
              onClick={handleNextMonth}
              className="grid h-8 w-8 place-items-center rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-all cursor-pointer"
              title="Next month"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          <h2 className="font-display text-base sm:text-lg font-bold tracking-tight text-foreground flex items-center gap-2">
            <span>{monthName}</span>
            <span className="text-muted-foreground font-medium">{year}</span>
          </h2>
        </div>

        {/* Month Metrics Chips */}
        <div className="flex items-center gap-2 flex-wrap text-xs">
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-primary/10 border border-primary/20 text-primary font-semibold">
            <Clock className="h-3.5 w-3.5" />
            <span>{dueThisMonthCount} Due This Month</span>
          </div>

          {overdueCount > 0 && (
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-rose-500/10 border border-rose-500/25 text-rose-600 dark:text-rose-400 font-semibold animate-pulse">
              <AlertTriangle className="h-3.5 w-3.5" />
              <span>{overdueCount} Overdue</span>
            </div>
          )}

          {tasksWithoutDeadline.length > 0 && (
            <button
              type="button"
              onClick={() => setShowNoDeadlineDrawer(!showNoDeadlineDrawer)}
              className={cn(
                "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl border text-xs font-semibold transition-all cursor-pointer",
                showNoDeadlineDrawer
                  ? "bg-amber-500/20 text-amber-700 dark:text-amber-300 border-amber-500/40"
                  : "bg-muted text-muted-foreground hover:text-foreground border-border/70"
              )}
            >
              <Layers className="h-3.5 w-3.5" />
              <span>{tasksWithoutDeadline.length} Unscheduled</span>
            </button>
          )}
        </div>
      </div>

      {/* 2. Unscheduled Tasks Drawer (Optional Collapsible Tray) */}
      {showNoDeadlineDrawer && tasksWithoutDeadline.length > 0 && (
        <div className="p-4 rounded-2xl bg-amber-500/5 border border-amber-500/20 backdrop-blur-sm animate-in fade-in-0 duration-200">
          <div className="flex items-center justify-between mb-2.5">
            <h4 className="text-xs font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5" />
              Tasks without Deadlines ({tasksWithoutDeadline.length})
            </h4>
            <span className="text-[11px] text-muted-foreground">
              Click a task to view and set a due date
            </span>
          </div>
          <div className="flex items-center gap-2 overflow-x-auto pb-1 custom-scrollbar">
            {tasksWithoutDeadline.map((t) => (
              <div
                key={t.id}
                onClick={() => onSelectTask(t)}
                className="shrink-0 flex items-center gap-2 px-3 py-1.5 rounded-xl bg-card border border-border/80 hover:border-primary/50 shadow-2xs text-xs font-medium text-foreground hover:scale-102 transition-all cursor-pointer"
              >
                <span className="h-2 w-2 rounded-full bg-amber-400" />
                <span className="truncate max-w-[160px]">{t.title}</span>
                <span className="text-[10px] text-muted-foreground font-mono">
                  {t.priority}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 3. The Google Calendar Grid Container */}
      <div className="rounded-2xl border border-border/80 bg-card/60 backdrop-blur-md shadow-xs overflow-hidden">
        {/* Day Header Row */}
        <div className="grid grid-cols-7 border-b border-border/70 bg-muted/40 text-center">
          {DAYS_OF_WEEK.map((dayName, idx) => (
            <div
              key={dayName}
              className={cn(
                "py-2.5 text-xs font-bold tracking-wider uppercase text-muted-foreground",
                (idx === 0 || idx === 6) && "text-muted-foreground/70"
              )}
            >
              {dayName}
            </div>
          ))}
        </div>

        {/* 7-Column Days Grid */}
        <div className="grid grid-cols-7 divide-x divide-y divide-border/60">
          {calendarCells.map((cell, idx) => {
            const dayTasks = tasksByDate.get(cell.dateKey) || [];
            const maxVisible = 3;
            const visibleTasks = dayTasks.slice(0, maxVisible);
            const extraCount = dayTasks.length - maxVisible;

            return (
              <div
                key={`${cell.dateKey}-${idx}`}
                className={cn(
                  "group/cell relative flex flex-col p-1.5 min-h-[115px] sm:min-h-[130px] transition-colors",
                  cell.isCurrentMonth
                    ? "bg-card/40 hover:bg-muted/30"
                    : "bg-muted/10 opacity-45 hover:opacity-70",
                  cell.isToday && "bg-primary/[0.04] dark:bg-primary/[0.08]"
                )}
              >
                {/* Cell Header: Date Number + Add Task Quick Button */}
                <div className="flex items-center justify-between mb-1">
                  <span
                    className={cn(
                      "text-xs font-semibold tracking-tight inline-flex items-center justify-center rounded-full",
                      cell.isToday
                        ? "h-6 w-6 bg-primary text-primary-foreground font-bold shadow-xs scale-105"
                        : cell.isCurrentMonth
                        ? "text-foreground font-medium pl-1"
                        : "text-muted-foreground/60 pl-1"
                    )}
                  >
                    {cell.date.getDate()}
                  </span>

                  {/* Add Task '+' on Hover */}
                  <button
                    type="button"
                    onClick={() => onCreateTaskOnDate(cell.date)}
                    className="opacity-0 group-hover/cell:opacity-100 h-5 w-5 grid place-items-center rounded-md bg-muted hover:bg-primary hover:text-primary-foreground text-muted-foreground transition-all cursor-pointer"
                    title={`Add task on ${cell.date.toLocaleDateString()}`}
                  >
                    <Plus className="h-3 w-3" />
                  </button>
                </div>

                {/* Day Tasks Stack */}
                <div className="flex flex-col gap-1 overflow-hidden flex-1">
                  {visibleTasks.map((task) => {
                    const isDone = task.status === "DONE";
                    const isOngoing = task.status === "IN_PROGRESS";

                    return (
                      <div
                        key={task.id}
                        onClick={() => onSelectTask(task)}
                        className={cn(
                          "group/task relative flex items-center justify-between gap-1.5 px-1.5 py-1 rounded-md text-[11px] font-medium transition-all cursor-pointer truncate shadow-2xs",
                          getPriorityStyle(task.priority, task.status)
                        )}
                        title={`${task.title} (${task.priority} • ${task.status})`}
                      >
                        <div className="flex items-center gap-1 min-w-0">
                          {isDone ? (
                            <CheckCircle2 className="h-3 w-3 text-emerald-500 shrink-0" />
                          ) : isOngoing ? (
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 shrink-0 animate-pulse" />
                          ) : (
                            <span className="h-1.5 w-1.5 rounded-full bg-slate-400 shrink-0" />
                          )}
                          <span className="truncate">{task.title}</span>
                        </div>

                        {task.assignee && (
                          <div
                            className="h-3.5 w-3.5 rounded-full bg-background/80 text-[8px] font-bold grid place-items-center shrink-0 border border-border/50"
                            title={task.assignee.displayName}
                          >
                            {task.assignee.initials || "U"}
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {/* '+X more' Overflow Button */}
                  {extraCount > 0 && (
                    <button
                      type="button"
                      onClick={() =>
                        setSelectedDayTasks({
                          date: cell.date,
                          tasks: dayTasks,
                        })
                      }
                      className="text-left px-1.5 py-0.5 rounded text-[10px] font-bold text-primary hover:underline hover:bg-primary/10 transition-colors cursor-pointer"
                    >
                      +{extraCount} more
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 4. Day Detail Modal (When clicking '+X more') */}
      {selectedDayTasks && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in-0 duration-150">
          <div className="relative w-full max-w-md rounded-2xl bg-card border border-border/80 shadow-2xl p-5 animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-border">
              <div className="flex items-center gap-2">
                <CalendarIcon className="h-4 w-4 text-primary" />
                <h3 className="text-sm font-bold text-foreground">
                  {selectedDayTasks.date.toLocaleDateString(undefined, {
                    weekday: "long",
                    month: "long",
                    day: "numeric",
                    year: "numeric",
                  })}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedDayTasks(null)}
                className="h-7 w-7 grid place-items-center rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground cursor-pointer transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-4 space-y-2 max-h-72 overflow-y-auto pr-1 custom-scrollbar">
              {selectedDayTasks.tasks.map((task) => (
                <div
                  key={task.id}
                  onClick={() => {
                    setSelectedDayTasks(null);
                    onSelectTask(task);
                  }}
                  className={cn(
                    "flex items-center justify-between gap-3 p-2.5 rounded-xl border border-border/70 hover:border-primary/50 bg-background/80 transition-all cursor-pointer hover:scale-[1.01]"
                  )}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-xs">{task.status === "DONE" ? "✅" : "📌"}</span>
                    <div>
                      <p className="text-xs font-semibold text-foreground truncate max-w-[240px]">
                        {task.title}
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        {task.priority} • {task.status.replace("_", " ")}
                      </p>
                    </div>
                  </div>

                  {task.assignee && (
                    <span className="text-[11px] text-muted-foreground shrink-0">
                      {task.assignee.displayName}
                    </span>
                  )}
                </div>
              ))}
            </div>

            <div className="mt-4 pt-3 border-t border-border flex justify-between items-center">
              <button
                type="button"
                onClick={() => {
                  const date = selectedDayTasks.date;
                  setSelectedDayTasks(null);
                  onCreateTaskOnDate(date);
                }}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline cursor-pointer"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Add task on this day</span>
              </button>

              <button
                type="button"
                onClick={() => setSelectedDayTasks(null)}
                className="px-3 py-1 rounded-xl bg-muted text-xs font-semibold text-foreground hover:bg-muted/80 cursor-pointer"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
