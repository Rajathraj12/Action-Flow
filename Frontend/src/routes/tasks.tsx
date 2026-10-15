import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, CheckCircle2, CircleDashed, CircleDot, XCircle, Calendar } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/tasks")({
  head: () => ({
    meta: [{ title: "My Tasks — ActionFlow" }],
  }),
  component: TasksPage,
});

const mockTasks = [
  { id: 1, title: "Review Q3 marketing budget", status: "in-progress", deadline: "Today, 5:00 PM", priority: "High" },
  { id: 2, title: "Update client presentation slides", status: "pending", deadline: "Tomorrow, 12:00 PM", priority: "Medium" },
  { id: 3, title: "Send weekly report to stakeholders", status: "completed", deadline: "Yesterday", priority: "High" },
  { id: 4, title: "Schedule alignment meeting with design team", status: "overdue", deadline: "Mon, 9:00 AM", priority: "Low" },
];

function TasksPage() {
  return (
    <>
      <div className="flex flex-col flex-1 h-full w-full">
        <header className="flex h-16 shrink-0 items-center gap-4 border-b border-border px-6">
          <h1 className="font-display text-xl font-bold tracking-tight">My Tasks</h1>
        </header>
      
      <main className="flex-1 overflow-y-auto p-6 md:p-10">
        <div className="mx-auto max-w-4xl space-y-8">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold font-display">Your Assignments</h2>
              <p className="text-muted-foreground mt-1">Manage and track your responsibilities.</p>
            </div>
          </div>

          <div className="grid gap-4">
            {mockTasks.map((task) => (
              <TaskCard key={task.id} task={task} />
            ))}
          </div>
        </div>
      </main>
      </div>
    </>
  );
}

function TaskCard({ task }: { task: any }) {
  const getStatusConfig = (status: string) => {
    switch(status) {
      case 'completed': return { icon: <CheckCircle2 className="h-5 w-5 text-emerald-500 fill-emerald-500/20" />, text: "text-emerald-600 dark:text-emerald-400", label: "Completed" };
      case 'in-progress': return { icon: <CircleDot className="h-5 w-5 text-amber-500 fill-amber-500/20" />, text: "text-amber-600 dark:text-amber-400", label: "In Progress" };
      case 'overdue': return { icon: <XCircle className="h-5 w-5 text-red-500 fill-red-500/20" />, text: "text-red-600 dark:text-red-400", label: "Overdue" };
      default: return { icon: <CircleDashed className="h-5 w-5 text-slate-400" />, text: "text-slate-500 dark:text-slate-400", label: "Pending" };
    }
  };

  const config = getStatusConfig(task.status);

  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-4 rounded-xl border border-border bg-card p-4 shadow-sm transition-all hover:shadow-md hover:border-primary/30 cursor-pointer">
      <div className="shrink-0 pt-0.5 sm:pt-0">
        {config.icon}
      </div>
      <div className="flex-1 min-w-0">
        <h3 className="text-base font-medium truncate">{task.title}</h3>
        <div className="mt-1 flex items-center gap-3 text-sm text-muted-foreground">
          <div className="flex items-center gap-1">
            <Calendar className="h-3.5 w-3.5" />
            <span>{task.deadline}</span>
          </div>
          <div className="flex items-center gap-1">
            <span className={cn("px-2 py-0.5 rounded-full text-xs font-medium border", 
              task.priority === "High" ? "border-red-200 text-red-600 bg-red-50" :
              task.priority === "Medium" ? "border-amber-200 text-amber-600 bg-amber-50" :
              "border-slate-200 text-slate-600 bg-slate-50"
            )}>
              {task.priority} Priority
            </span>
          </div>
        </div>
      </div>
      <div className="shrink-0">
        <span className={cn("text-sm font-medium", config.text)}>{config.label}</span>
      </div>
    </div>
  );
}
