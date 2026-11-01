import React, { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "../ui/dialog";
import { Input } from "../ui/input";
import { Button } from "../ui/button";
import {
  api,
  type BackendUser,
  type BackendTask,
  type TaskPriority,
  type AiDetectionResponse,
} from "../../lib/api";
import {
  Sparkles,
  Calendar,
  User,
  AlertTriangle,
  CheckCircle2,
  Trash2,
  Plus,
  Loader2,
  Info,
  Clock,
  Flag,
} from "lucide-react";
import { cn } from "../../lib/utils";

interface EditableTaskCard {
  title: string;
  assigneeId: string;
  dueDate: string;
  priority: TaskPriority;
  originalDeadlineText?: string | null;
  confidence: number;
}

interface AiTaskReviewModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceId?: string;
  currentUserId?: string;
  detectionData: AiDetectionResponse | null;
  onTasksCreated?: (tasks: BackendTask[]) => void;
  onManualCreateRequested?: () => void;
}

const CATEGORY_LABELS: Record<string, { label: string; color: string; desc: string }> = {
  clear_task: {
    label: "Clear Task",
    color: "bg-emerald-500/15 text-emerald-500 border-emerald-500/25",
    desc: "Single unambiguous task assignment detected.",
  },
  multi_task: {
    label: "Multiple Tasks",
    color: "bg-blue-500/15 text-blue-500 border-blue-500/25",
    desc: "Multiple tasks detected within this single message.",
  },
  self_commitment: {
    label: "Self Commitment",
    color: "bg-indigo-500/15 text-indigo-500 border-indigo-500/25",
    desc: "Sender committed to completing this task themselves.",
  },
  ambiguous: {
    label: "Ambiguous Assignee",
    color: "bg-amber-500/15 text-amber-500 border-amber-500/25",
    desc: "Name matches multiple team members. Human selection required.",
  },
  missing_info: {
    label: "Missing Information",
    color: "bg-orange-500/15 text-orange-500 border-orange-500/25",
    desc: "Actionable item found, but assignee or deadline is unspecified.",
  },
  looks_like_task: {
    label: "Status / Possible Task",
    color: "bg-purple-500/15 text-purple-500 border-purple-500/25",
    desc: "Appears to be a status update or passive wish rather than an assignment.",
  },
  not_task: {
    label: "Non-Task Message",
    color: "bg-muted text-muted-foreground border-border",
    desc: "General conversation, greeting, or small talk with no work item.",
  },
};

export function AiTaskReviewModal({
  open,
  onOpenChange,
  workspaceId,
  currentUserId,
  detectionData,
  onTasksCreated,
  onManualCreateRequested,
}: AiTaskReviewModalProps) {
  const [tasks, setTasks] = useState<EditableTaskCard[]>([]);
  const [colleagues, setColleagues] = useState<BackendUser[]>([]);
  const [loadingColleagues, setLoadingColleagues] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Initialize form state when detectionData changes
  useEffect(() => {
    if (open && detectionData) {
      setError(null);

      // Convert suggestions to editable task cards
      if (detectionData.tasks && detectionData.tasks.length > 0) {
        setTasks(
          detectionData.tasks.map((t) => ({
            title: t.title || "New Task",
            assigneeId: t.assigneeId || "",
            dueDate: t.deadlineDate ? t.deadlineDate.slice(0, 10) : "",
            priority: t.priority || "MEDIUM",
            originalDeadlineText: t.deadlineText,
            confidence: t.confidence || 0.85,
          }))
        );
      } else {
        setTasks([]);
      }

      // Load active workspace colleagues
      if (workspaceId) {
        setLoadingColleagues(true);
        api
          .searchWorkspaceColleagues(workspaceId)
          .then((res) => {
            setColleagues(res.users || []);
          })
          .catch((err) => {
            console.error("Failed to load workspace colleagues:", err);
          })
          .finally(() => {
            setLoadingColleagues(false);
          });
      }
    }
  }, [open, detectionData, workspaceId]);

  if (!detectionData) return null;

  const categoryMeta =
    CATEGORY_LABELS[detectionData.category] || CATEGORY_LABELS["clear_task"];
  const isNoTask = !detectionData.isTaskCandidate && tasks.length === 0;

  const handleTaskChange = (
    index: number,
    field: keyof EditableTaskCard,
    value: any
  ) => {
    setTasks((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  };

  const handleRemoveTask = (index: number) => {
    setTasks((prev) => prev.filter((_, i) => i !== index));
  };

  const handleAddTask = () => {
    setTasks((prev) => [
      ...prev,
      {
        title: "",
        assigneeId: currentUserId || (colleagues[0]?._id ?? ""),
        dueDate: "",
        priority: "MEDIUM",
        originalDeadlineText: null,
        confidence: 1.0,
      },
    ]);
  };

  const handleConfirm = async () => {
    if (!workspaceId) {
      setError("Workspace ID is required.");
      return;
    }

    if (tasks.length === 0) {
      setError("No tasks to create.");
      return;
    }

    // Validate titles
    for (let i = 0; i < tasks.length; i++) {
      if (!tasks[i].title.trim() || tasks[i].title.trim().length < 2) {
        setError(`Task #${i + 1} title must be at least 2 characters.`);
        return;
      }
    }

    setSubmitting(true);
    setError(null);

    const createdTasks: BackendTask[] = [];

    try {
      for (const t of tasks) {
        const res = await api.createTask(workspaceId, {
          title: t.title.trim(),
          description: `Auto-extracted from message: "${detectionData.sourceMessage.text}"`,
          assigneeId: t.assigneeId || undefined,
          priority: t.priority,
          dueDate: t.dueDate ? new Date(t.dueDate).toISOString() : undefined,
          sourceMessageId: detectionData.sourceMessage.id,
          sourceConversationId: detectionData.sourceMessage.conversationId,
        });
        createdTasks.push(res.task);
      }

      if (onTasksCreated) {
        onTasksCreated(createdTasks);
      }
      onOpenChange(false);
    } catch (err: any) {
      setError(err?.message || "Failed to create task(s).");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto p-0 gap-0 rounded-2xl bg-card border-border shadow-2xl">
        {/* Header */}
        <div className="p-5 border-b border-border/60 bg-muted/30">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="h-9 w-9 rounded-xl bg-primary/10 text-primary grid place-items-center shadow-xs">
                <Sparkles className="h-5 w-5" />
              </div>
              <div>
                <DialogTitle className="text-base font-bold text-foreground">
                  AI Task Suggestion Review
                </DialogTitle>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Review and edit tasks detected by the Linear SVM model before creating.
                </p>
              </div>
            </div>

            {/* Model Category Badge */}
            <div
              className={cn(
                "px-2.5 py-1 rounded-xl text-xs font-semibold border flex items-center gap-1.5 shadow-2xs",
                categoryMeta.color
              )}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-current" />
              <span>{categoryMeta.label}</span>
              <span className="text-[10px] opacity-75 font-mono">
                ({Math.round(detectionData.confidence * 100)}%)
              </span>
            </div>
          </div>
        </div>

        <div className="p-5 space-y-4">
          {/* Original Message Card */}
          <div className="rounded-xl p-3.5 bg-muted/40 border border-border/50 text-xs space-y-1.5">
            <div className="flex items-center justify-between text-muted-foreground font-medium">
              <span>Source Message from {detectionData.sourceMessage.senderName}</span>
              <span>
                {new Date(detectionData.sourceMessage.timestamp).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            </div>
            <p className="text-sm text-foreground italic border-l-2 border-primary/50 pl-2.5 py-0.5">
              "{detectionData.sourceMessage.text}"
            </p>
          </div>

          {/* Ambiguity or Incomplete Details Warning */}
          {detectionData.warnings && detectionData.warnings.length > 0 && (
            <div className="rounded-xl p-3 bg-amber-500/10 border border-amber-500/25 text-amber-500 text-xs flex items-start gap-2.5">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="font-semibold">Review Required</p>
                <ul className="list-disc list-inside space-y-0.5 text-foreground/80">
                  {detectionData.warnings.map((w, idx) => (
                    <li key={idx}>{w}</li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {/* Non-Task State */}
          {isNoTask && (
            <div className="text-center py-8 px-4 space-y-3">
              <div className="h-12 w-12 rounded-2xl bg-muted/60 text-muted-foreground grid place-items-center mx-auto">
                <Info className="h-6 w-6" />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-semibold text-foreground">
                  No task detected in this message
                </p>
                <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                  {categoryMeta.desc}
                </p>
              </div>
              <div className="pt-2 flex justify-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onOpenChange(false)}
                  className="rounded-xl text-xs"
                >
                  Dismiss
                </Button>
                {onManualCreateRequested && (
                  <Button
                    size="sm"
                    onClick={() => {
                      onOpenChange(false);
                      onManualCreateRequested();
                    }}
                    className="rounded-xl text-xs gap-1.5"
                  >
                    <span>Create Task Manually</span>
                  </Button>
                )}
              </div>
            </div>
          )}

          {/* Editable Task Cards */}
          {!isNoTask && (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground">
                <span>
                  {tasks.length > 1
                    ? `Suggested Tasks (${tasks.length})`
                    : "Suggested Task Details"}
                </span>
                <button
                  type="button"
                  onClick={handleAddTask}
                  className="text-primary hover:underline flex items-center gap-1 cursor-pointer font-medium"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>Add another task</span>
                </button>
              </div>

              {tasks.map((task, idx) => (
                <div
                  key={idx}
                  className="rounded-2xl border border-border/80 bg-card p-4 space-y-3 shadow-xs relative group"
                >
                  {/* Task Card Header */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-xs font-bold text-foreground">
                      <span className="h-5 w-5 rounded-full bg-primary/10 text-primary grid place-items-center text-[10px]">
                        {idx + 1}
                      </span>
                      <span>Task #{idx + 1}</span>
                      {task.originalDeadlineText && (
                        <span className="text-[11px] font-normal text-muted-foreground bg-muted px-2 py-0.5 rounded-md flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          <span>Detected "{task.originalDeadlineText}"</span>
                        </span>
                      )}
                    </div>

                    {tasks.length > 1 && (
                      <button
                        type="button"
                        onClick={() => handleRemoveTask(idx)}
                        className="text-muted-foreground hover:text-destructive p-1 rounded-md transition-colors cursor-pointer"
                        title="Remove this task"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>

                  {/* Title */}
                  <div className="space-y-1">
                    <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                      Task Title *
                    </label>
                    <Input
                      value={task.title}
                      onChange={(e) => handleTaskChange(idx, "title", e.target.value)}
                      placeholder="e.g. Prepare release report"
                      className="rounded-xl text-sm"
                    />
                  </div>

                  {/* Assignee, Due Date, Priority grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {/* Assignee */}
                    <div className="space-y-1">
                      <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                        <User className="h-3 w-3" />
                        <span>Assignee</span>
                      </label>
                      <select
                        value={task.assigneeId}
                        onChange={(e) => handleTaskChange(idx, "assigneeId", e.target.value)}
                        className="w-full rounded-xl border border-input bg-background px-3 py-2 text-xs focus:ring-2 focus:ring-primary focus:outline-none"
                      >
                        <option value="">Unassigned</option>
                        {colleagues.map((c) => (
                          <option key={c._id} value={c._id}>
                            {c.displayName} {c._id === currentUserId ? "(You)" : ""}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Due Date */}
                    <div className="space-y-1">
                      <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        <span>Due Date</span>
                      </label>
                      <input
                        type="date"
                        value={task.dueDate}
                        onChange={(e) => handleTaskChange(idx, "dueDate", e.target.value)}
                        className="w-full rounded-xl border border-input bg-background px-3 py-1.5 text-xs focus:ring-2 focus:ring-primary focus:outline-none"
                      />
                    </div>

                    {/* Priority */}
                    <div className="space-y-1">
                      <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                        <Flag className="h-3 w-3" />
                        <span>Priority</span>
                      </label>
                      <select
                        value={task.priority}
                        onChange={(e) =>
                          handleTaskChange(idx, "priority", e.target.value as TaskPriority)
                        }
                        className="w-full rounded-xl border border-input bg-background px-3 py-2 text-xs focus:ring-2 focus:ring-primary focus:outline-none"
                      >
                        <option value="LOW">Low</option>
                        <option value="MEDIUM">Medium</option>
                        <option value="HIGH">High</option>
                        <option value="URGENT">Urgent</option>
                      </select>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {error && (
            <div className="rounded-xl p-3 bg-destructive/10 border border-destructive/20 text-destructive text-xs">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        {!isNoTask && (
          <div className="p-4 border-t border-border/60 bg-muted/20 flex items-center justify-between">
            <span className="text-xs text-muted-foreground">
              Review before saving • Task will be created in workspace
            </span>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => onOpenChange(false)}
                disabled={submitting}
                className="rounded-xl text-xs"
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleConfirm}
                disabled={submitting || tasks.length === 0}
                className="rounded-xl text-xs gap-1.5 bg-primary text-primary-foreground font-semibold shadow-xs"
              >
                {submitting ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    <span>Creating...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    <span>
                      {tasks.length > 1
                        ? `Confirm & Create ${tasks.length} Tasks`
                        : "Confirm & Create Task"}
                    </span>
                  </>
                )}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

