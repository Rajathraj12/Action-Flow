import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowLeft, Check, X, Sparkles, Users, LayoutDashboard, MessageSquare } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/dashboard")({
  head: () => ({
    meta: [{ title: "Manager Dashboard — ActionFlow" }],
  }),
  component: DashboardPage,
});

function DashboardPage() {
  const [aiSuggestions, setAiSuggestions] = useState<any[]>([]);
  return (
    <>
      <div className="flex flex-col flex-1 h-full w-full">
        <header className="flex h-16 shrink-0 items-center gap-4 border-b border-border px-6">
          <h1 className="font-display text-xl font-bold tracking-tight">Manager Dashboard</h1>
        </header>
      
      <main className="flex-1 overflow-y-auto p-6 md:p-10">
        <div className="mx-auto max-w-5xl space-y-8">
          
          {/* Overview Stats */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <StatCard icon={<LayoutDashboard />} title="Total Active Tasks" value="0" />
            <StatCard icon={<Users />} title="Team Members" value="0" />
            <StatCard icon={<Sparkles className="text-purple-500" />} title="AI Extractions Pending" value={aiSuggestions.length.toString()} />
          </div>

          <div className="space-y-4">
            <div className="flex items-center gap-2 border-b border-border pb-2">
              <Sparkles className="h-5 w-5 text-purple-500" />
              <h2 className="text-xl font-bold font-display">Needs Approval</h2>
            </div>
            <p className="text-sm text-muted-foreground">ActionFlow AI has detected the following potential tasks from recent conversations. Review and approve to create official tasks.</p>
            
            <div className="grid gap-4 mt-4">
              {aiSuggestions.map(suggestion => (
                <ApprovalCard key={suggestion.id} suggestion={suggestion} />
              ))}
              {aiSuggestions.length === 0 && (
                <div className="rounded-xl border border-dashed border-border p-8 text-center text-muted-foreground">
                  No pending task extractions.
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
      </div>
    </>
  );
}

function StatCard({ icon, title, value }: { icon: React.ReactNode, title: string, value: string }) {
  return (
    <div className="flex items-center gap-4 rounded-xl border border-border bg-card p-6 shadow-sm">
      <div className="grid h-12 w-12 place-items-center rounded-full bg-primary/10 text-primary">
        {icon}
      </div>
      <div>
        <div className="text-sm font-medium text-muted-foreground">{title}</div>
        <div className="text-2xl font-bold font-display mt-1">{value}</div>
      </div>
    </div>
  );
}

function ApprovalCard({ suggestion }: { suggestion: any }) {
  return (
    <div className="flex flex-col gap-4 rounded-xl border border-border bg-card p-5 shadow-sm transition-shadow hover:shadow-md md:flex-row md:items-start md:justify-between">
      <div className="space-y-3 flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1 rounded-md bg-purple-500/10 px-2 py-1 text-xs font-medium text-purple-600">
            <Sparkles className="h-3 w-3" />
            AI Suggestion
          </span>
          <span className="text-xs text-muted-foreground flex items-center gap-1">
            <MessageSquare className="h-3 w-3" />
            {suggestion.source}
          </span>
        </div>
        
        <h3 className="text-lg font-semibold">{suggestion.title}</h3>
        
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
          <div className="flex items-center gap-1 text-muted-foreground">
            <span className="font-medium text-foreground">Assignee:</span> {suggestion.assignee}
          </div>
          <div className="flex items-center gap-1 text-muted-foreground">
            <span className="font-medium text-foreground">Deadline:</span> {suggestion.deadline}
          </div>
        </div>
        
        <div className="rounded-md bg-muted/50 p-3 text-sm italic text-muted-foreground border-l-2 border-primary/30">
          "{suggestion.context}"
        </div>
      </div>
      
      <div className="flex shrink-0 items-center gap-2 md:flex-col md:w-32">
        <button className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 md:w-full">
          <Check className="h-4 w-4" />
          Approve
        </button>
        <button className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-input bg-background px-4 py-2 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground md:w-full">
          <X className="h-4 w-4" />
          Reject
        </button>
      </div>
    </div>
  );
}
