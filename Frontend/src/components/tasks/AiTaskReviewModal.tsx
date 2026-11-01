import React, { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { Input } from "../ui/input";
import {
  api,
  type BackendUser,
  type BackendTask,
  type TaskPriority,
  type AiDetectionResponse,
} from "../../lib/api";
import {
  Sparkles,
  Clock,
  User,
  Check,
  Pencil,
  X,
  MessageSquare,
  AlertTriangle,
  Loader2,
  Calendar,
  Flag,
} from "lucide-react";
import { cn } from "../../lib/utils";
import { toast } from "sonner";

interface EditableTaskCard {
  title: string;
  assigneeId: string;
  assigneeName: string;
  assigneeInitials: string;
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

export function AiTaskReviewModal({
  open,
  onOpenChange,
  workspaceId,
  currentUserId,
  detectionData,
  onTasksCreated,
}: AiTaskReviewModalProps) {
  const [tasks, setTasks] = useState<EditableTaskCard[]>([]);
  const [colleagues, setColleagues] = useState<BackendUser[]>([]);
  const [loadingColleagues, setLoadingColleagues] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [submittingIndex, setSubmittingIndex] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Initialize tasks when modal opens
  useEffect(() => {
    if (open && detectionData) {
      setError(null);
      setEditingIndex(null);

      if (workspaceId) {
        setLoadingColleagues(true);
        api
          .searchWorkspaceColleagues(workspaceId)
          .then((res) => {
            const list = res.users || [];
            setColleagues(list);

            // Populate tasks with colleague resolution
            if (detectionData.tasks && detectionData.tasks.length > 0) {
              setTasks(
                detectionData.tasks.map((t) => {
                  let matchedUser = list.find((u) => u._id === t.assigneeId);
                  if (!matchedUser && t.assigneeName) {
                    const norm = t.assigneeName.toLowerCase();
                    matchedUser = list.find(
                      (u) =>
                        u.displayName.toLowerCase().includes(norm) ||
                        norm.includes(u.displayName.toLowerCase())
                    );
                  }

                  const assignedName = matchedUser
                    ? matchedUser.displayName
                    : t.assigneeName || "Unassigned";

                  const assignedInitials = matchedUser?.initials ||
                    assignedName
                      .split(" ")
                      .map((n) => n[0])
                      .join("")
                      .toUpperCase()
                      .slice(0, 2) ||
                    "U";

                  return {
                    title: t.title || "New Task",
                    assigneeId: matchedUser ? matchedUser._id : t.assigneeId || "",
                    assigneeName: assignedName,
                    assigneeInitials: assignedInitials,
                    dueDate: t.deadlineDate ? t.deadlineDate.slice(0, 10) : "",
                    priority: t.priority || "MEDIUM",
                    originalDeadlineText: t.deadlineText,
                    confidence: t.confidence || detectionData.confidence || 0.92,
                  };
                })
              );
            } else {
              setTasks([]);
            }
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

  const handleTaskFieldChange = (
    index: number,
    field: keyof EditableTaskCard,
    value: any
  ) => {
    setTasks((prev) => {
      const updated = [...prev];
      const item = { ...updated[index], [field]: value };

      if (field === "assigneeId") {
        const found = colleagues.find((c) => c._id === value);
        if (found) {
          item.assigneeName = found.displayName;
          item.assigneeInitials = found.initials || found.displayName[0] || "U";
        } else {
          item.assigneeName = "Unassigned";
          item.assigneeInitials = "U";
        }
      }

      updated[index] = item;
      return updated;
    });
  };

  const handleApprove = async (index: number) => {
    if (!workspaceId) {
      setError("Workspace ID is required.");
      return;
    }

    const t = tasks[index];
    if (!t || !t.title.trim()) {
      setError("Task title cannot be empty.");
      return;
    }

    setSubmittingIndex(index);
    setError(null);

    try {
      const res = await api.createTask(workspaceId, {
        title: t.title.trim(),
        description: `Auto-extracted from message: "${detectionData.sourceMessage.text}"`,
        assigneeId: t.assigneeId || undefined,
        priority: t.priority,
        dueDate: t.dueDate ? new Date(t.dueDate).toISOString() : undefined,
        sourceMessageId: detectionData.sourceMessage.id,
        sourceConversationId: detectionData.sourceMessage.conversationId,
      });

      toast.success(`Task "${t.title}" approved and created!`, {
        description: t.assigneeName !== "Unassigned"
          ? `Assigned to ${t.assigneeName}`
          : "Created in workspace tasks",
      });

      if (onTasksCreated) {
        onTasksCreated([res.task]);
      }

      onOpenChange(false);
    } catch (err: any) {
      setError(err?.message || "Failed to create task.");
    } finally {
      setSubmittingIndex(null);
    }
  };

  const handleReject = (index: number) => {
    toast.info("Task suggestion rejected");
    onOpenChange(false);
  };

  const isNoTask = !detectionData.isTaskCandidate && tasks.length === 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto p-0 gap-0 rounded-2xl bg-card border-border shadow-2xl">
        {/* Header - Styled exactly like ActionFlow AI Extractions */}
        <div className="p-5 border-b border-border/80 bg-card/60 backdrop-blur-md">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="grid h-8 w-8 place-items-center rounded-lg bg-purple-500/15 text-purple-600 dark:text-purple-400">
                <Sparkles className="h-4 w-4" />
              </div>
              <div>
                <DialogTitle className="text-base font-bold font-display text-foreground">
                  ActionFlow AI Extractions
                </DialogTitle>
                <p className="text-xs text-muted-foreground">
                  Tasks automatically detected from recent conversation context.
                </p>
              </div>
            </div>

            <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-purple-500/10 text-purple-600 dark:text-purple-400 flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-purple-500 animate-pulse" />
              AI Detected
            </span>
          </div>
        </div>

        <div className="p-5 space-y-4">
          {error && (
            <div className="rounded-xl p-3 bg-destructive/10 border border-destructive/20 text-destructive text-xs flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {isNoTask ? (
            <div className="py-8 text-center space-y-2">
              <p className="text-sm font-semibold text-foreground">
                No actionable task detected in this message
              </p>
              <p className="text-xs text-muted-foreground">
                "{detectionData.sourceMessage.text}"
              </p>
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                className="mt-3 inline-flex items-center rounded-xl border border-border px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-muted"
              >
                Close
              </button>
            </div>
          ) : (
            tasks.map((task, idx) => {
              const isEditingThis = editingIndex === idx;
              const isSubmittingThis = submittingIndex === idx;
              const confidencePercent = Math.round(task.confidence > 1 ? task.confidence : task.confidence * 100);

              return (
                <div
                  key={idx}
                  className="group relative flex flex-col justify-between gap-4 rounded-2xl border border-border bg-card p-5 transition-all hover:border-primary/40 hover:shadow-md md:flex-row md:items-center"
                >
                  {/* Left Side: Metadata, Title, Assignee, Deadline & Context */}
                  <div className="space-y-2.5 flex-1 min-w-0">
                    {/* Confidence & Source */}
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-center gap-1 rounded-full bg-purple-500/10 px-2.5 py-0.5 text-xs font-semibold text-purple-600 dark:text-purple-400">
                        <Sparkles className="h-3 w-3" />
                        {confidencePercent}% confidence
                      </span>
                      <span className="text-xs text-muted-foreground flex items-center gap-1 font-medium">
                        <MessageSquare className="h-3 w-3" />
                        Chat with {detectionData.sourceMessage.senderName}
                      </span>
                    </div>

                    {/* Task Title (or Title Input in Edit Mode) */}
                    {isEditingThis ? (
                      <div className="space-y-1">
                        <label className="text-[11px] font-semibold text-muted-foreground">
                          Task Title
                        </label>
                        <Input
                          value={task.title}
                          onChange={(e) =>
                            handleTaskFieldChange(idx, "title", e.target.value)
                          }
                          placeholder="Task title"
                          className="h-8 rounded-lg text-sm font-semibold"
                        />
                      </div>
                    ) : (
                      <h3 className="text-base font-bold text-foreground group-hover:text-primary transition-colors break-words">
                        {task.title}
                      </h3>
                    )}

                    {/* Details Row: Assignee, Deadline, Priority */}
                    {isEditingThis ? (
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
                        {/* Assignee select */}
                        <div className="space-y-1">
                          <label className="text-[11px] font-semibold text-muted-foreground">
                            Assignee
                          </label>
                          <select
                            value={task.assigneeId}
                            onChange={(e) =>
                              handleTaskFieldChange(idx, "assigneeId", e.target.value)
                            }
                            className="w-full h-8 rounded-lg border border-border bg-background px-2 text-xs font-medium focus:ring-1 focus:ring-primary"
                          >
                            <option value="">Unassigned</option>
                            {colleagues.map((c) => (
                              <option key={c._id} value={c._id}>
                                {c.displayName}
                              </option>
                            ))}
                          </select>
                        </div>

                        {/* Deadline input */}
                        <div className="space-y-1">
                          <label className="text-[11px] font-semibold text-muted-foreground">
                            Deadline
                          </label>
                          <input
                            type="date"
                            value={task.dueDate}
                            onChange={(e) =>
                              handleTaskFieldChange(idx, "dueDate", e.target.value)
                            }
                            className="w-full h-8 rounded-lg border border-border bg-background px-2 text-xs font-medium focus:ring-1 focus:ring-primary"
                          />
                        </div>

                        {/* Priority select */}
                        <div className="space-y-1">
                          <label className="text-[11px] font-semibold text-muted-foreground">
                            Priority
                          </label>
                          <select
                            value={task.priority}
                            onChange={(e) =>
                              handleTaskFieldChange(idx, "priority", e.target.value as TaskPriority)
                            }
                            className="w-full h-8 rounded-lg border border-border bg-background px-2 text-xs font-medium focus:ring-1 focus:ring-primary"
                          >
                            <option value="LOW">Low</option>
                            <option value="MEDIUM">Medium</option>
                            <option value="HIGH">High</option>
                            <option value="URGENT">Urgent</option>
                          </select>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
                        <div className="flex items-center gap-1.5">
                          <div className="grid h-5 w-5 place-items-center rounded-full bg-primary/20 text-[10px] font-bold text-primary">
                            {task.assigneeInitials}
                          </div>
                          <span>
                            Assignee:{" "}
                            <strong className="text-foreground">
                              {task.assigneeName}
                            </strong>
                          </span>
                        </div>

                        <div className="flex items-center gap-1">
                          <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                          <span>
                            Deadline:{" "}
                            <strong className="text-foreground">
                              {task.dueDate || task.originalDeadlineText || "No deadline"}
                            </strong>
                          </span>
                        </div>

                        <div className="flex items-center gap-1">
                          <Flag className="h-3.5 w-3.5 text-muted-foreground" />
                          <span>
                            Priority:{" "}
                            <strong className="text-foreground">
                              {task.priority}
                            </strong>
                          </span>
                        </div>
                      </div>
                    )}

                    {/* Quoted context message */}
                    <div className="rounded-xl bg-muted/40 p-3 text-xs italic text-muted-foreground border-l-2 border-primary/40 leading-relaxed break-words">
                      "{detectionData.sourceMessage.text}"
                    </div>
                  </div>

                  {/* Right Side: Action Buttons */}
                  <div className="flex shrink-0 items-center gap-2 md:flex-col md:w-32 pt-2 md:pt-0">
                    <button
                      type="button"
                      onClick={() => handleApprove(idx)}
                      disabled={isSubmittingThis}
                      className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground shadow-xs hover:bg-primary/90 transition-all active:scale-95 md:w-full cursor-pointer disabled:opacity-50"
                      title="Approve and create task in My Tasks"
                    >
                      {isSubmittingThis ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Check className="h-3.5 w-3.5" />
                      )}
                      <span>Approve</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setEditingIndex(isEditingThis ? null : idx)}
                      disabled={isSubmittingThis}
                      className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-border bg-card px-3 py-2 text-xs font-semibold text-foreground hover:bg-muted hover:border-primary/40 transition-all active:scale-95 md:w-full cursor-pointer"
                      title={isEditingThis ? "Close edit mode" : "Edit task parameters"}
                    >
                      <Pencil className="h-3.5 w-3.5 text-amber-500" />
                      <span>{isEditingThis ? "Done Editing" : "Edit"}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleReject(idx)}
                      disabled={isSubmittingThis}
                      className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-border bg-card px-3 py-2 text-xs font-semibold text-muted-foreground hover:bg-destructive/10 hover:text-destructive hover:border-destructive/30 transition-all active:scale-95 md:w-full cursor-pointer"
                      title="Dismiss suggestion"
                    >
                      <X className="h-3.5 w-3.5" />
                      <span>Reject</span>
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
