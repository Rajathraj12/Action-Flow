import React, { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "../ui/dialog";
import { Input } from "../ui/input";
import { Button } from "../ui/button";
import {
  api,
  type BackendTask,
  type BackendUser,
  type TaskStatus,
  type TaskPriority,
} from "../../lib/api";
import {
  CheckSquare,
  CheckCircle2,
  CircleDashed,
  CircleDot,
  Clock,
  Calendar,
  AlertCircle,
  User,
  UserCheck,
  MessageSquare,
  Pencil,
  Trash2,
  ExternalLink,
  Loader2,
  X,
  Check,
  ShieldAlert,
} from "lucide-react";
import { cn } from "../../lib/utils";

interface TaskDetailModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  task: BackendTask | null;
  workspaceId?: string;
  currentUserId?: string;
  onTaskUpdated: () => void;
  onTaskDeleted?: () => void;
  onNavigateToSourceMessage?: (conversationId: string, messageId: string) => void;
}

export function TaskDetailModal({
  open,
  onOpenChange,
  task,
  workspaceId,
  currentUserId,
  onTaskUpdated,
  onTaskDeleted,
  onNavigateToSourceMessage,
}: TaskDetailModalProps) {
  const [currentTask, setCurrentTask] = useState<BackendTask | null>(task);
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editPriority, setEditPriority] = useState<TaskPriority>("MEDIUM");
  const [editDueDate, setEditDueDate] = useState("");
  const [colleagues, setColleagues] = useState<BackendUser[]>([]);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open && task) {
      setCurrentTask(task);
      setEditTitle(task.title);
      setEditDescription(task.description || "");
      setEditPriority(task.priority);
      setEditDueDate(task.dueDate ? task.dueDate.slice(0, 16) : "");
      setIsEditing(false);
      setError(null);

      if (workspaceId) {
        api.searchWorkspaceColleagues(workspaceId).then((res) => {
          setColleagues(res.users);
        });
      }
    }
  }, [open, task, workspaceId]);

  if (!currentTask) return null;

  // Handle Quick Status Update
  const handleUpdateStatus = async (newStatus: TaskStatus) => {
    if (!workspaceId) return;
    setError(null);
    try {
      const res = await api.updateTaskStatus(workspaceId, currentTask.id, newStatus);
      setCurrentTask(res.task);
      onTaskUpdated();
    } catch (err: any) {
      setError(err.message || "Failed to update status");
    }
  };

  // Handle Reassignment
  const handleReassign = async (newAssigneeId: string) => {
    if (!workspaceId || newAssigneeId === currentTask.assignee?.id) return;
    setError(null);
    try {
      const res = await api.reassignTask(workspaceId, currentTask.id, newAssigneeId);
      setCurrentTask(res.task);
      onTaskUpdated();
    } catch (err: any) {
      setError(err.message || "Failed to reassign task");
    }
  };

  // Handle Save Edit
  const handleSaveEdit = async () => {
    if (!workspaceId) return;
    const trimmed = editTitle.trim();
    if (!trimmed || trimmed.length < 2) {
      setError("Title must be at least 2 characters");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const res = await api.updateTask(workspaceId, currentTask.id, {
        title: trimmed,
        description: editDescription.trim(),
        priority: editPriority,
        dueDate: editDueDate ? new Date(editDueDate).toISOString() : null,
      });
      setCurrentTask(res.task);
      setIsEditing(false);
      onTaskUpdated();
    } catch (err: any) {
      setError(err.message || "Failed to update task");
    } finally {
      setSaving(false);
    }
  };

  // Handle Delete
  const handleDelete = async () => {
    if (!workspaceId) return;
    if (!confirm("Are you sure you want to delete this task?")) return;

    setDeleting(true);
    setError(null);
    try {
      await api.deleteTask(workspaceId, currentTask.id);
      onOpenChange(false);
      if (onTaskDeleted) onTaskDeleted();
      onTaskUpdated();
    } catch (err: any) {
      setError(err.message || "Failed to delete task");
    } finally {
      setDeleting(false);
    }
  };

  const isCompleted = currentTask.status === "DONE";

  const priorityColors = {
    LOW: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20",
    MEDIUM: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
    HIGH: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
    URGENT: "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20",
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg bg-card/95 border-border/80 shadow-2xl backdrop-blur-xl">
        <DialogHeader>
          <div className="flex items-center justify-between pr-4">
            <DialogTitle className="flex items-center gap-2.5 text-lg font-bold font-display">
              <div
                className={cn(
                  "grid h-9 w-9 place-items-center rounded-xl shadow-xs transition-colors",
                  isCompleted
                    ? "bg-emerald-500/15 text-emerald-500"
                    : "bg-primary/15 text-primary"
                )}
              >
                {isCompleted ? (
                  <CheckCircle2 className="h-5 w-5" />
                ) : (
                  <CheckSquare className="h-5 w-5" />
                )}
              </div>
              <span className="truncate max-w-xs">{isEditing ? "Edit Task" : "Task Details"}</span>
            </DialogTitle>

            {!isEditing && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setIsEditing(true)}
                className="h-8 gap-1.5 text-xs rounded-xl"
              >
                <Pencil className="h-3.5 w-3.5" />
                Edit
              </Button>
            )}
          </div>
        </DialogHeader>

        {error && (
          <div className="text-xs text-destructive font-medium bg-destructive/10 border border-destructive/20 p-2.5 rounded-lg flex items-center gap-2 animate-in fade-in">
            <ShieldAlert className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="py-2 space-y-4">
          {/* Status Lifecycle Stepper */}
          <div className="flex items-center justify-between p-1.5 rounded-xl bg-muted/50 border border-border/60">
            {(["TODO", "IN_PROGRESS", "IN_REVIEW", "DONE"] as TaskStatus[]).map((st) => {
              const active = currentTask.status === st;
              return (
                <button
                  key={st}
                  type="button"
                  onClick={() => handleUpdateStatus(st)}
                  className={cn(
                    "flex-1 py-1.5 px-2 rounded-lg text-[11px] font-semibold transition-all cursor-pointer text-center",
                    active
                      ? "bg-card text-foreground shadow-xs font-bold"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {st === "TODO" && "To Do"}
                  {st === "IN_PROGRESS" && "In Progress"}
                  {st === "IN_REVIEW" && "In Review"}
                  {st === "DONE" && "Done ✓"}
                </button>
              );
            })}
          </div>

          {/* Source Message Link Banner */}
          {currentTask.sourceConversationId && currentTask.sourceMessageId && (
            <div className="p-3 rounded-xl bg-primary/10 border border-primary/25 flex items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2 min-w-0">
                <MessageSquare className="h-4 w-4 text-primary shrink-0" />
                <span className="truncate text-foreground font-medium">
                  {currentTask.sourceSnippet
                    ? `"${currentTask.sourceSnippet.slice(0, 50)}..."`
                    : "Linked to original message"}
                </span>
              </div>
              {onNavigateToSourceMessage && (
                <button
                  type="button"
                  onClick={() => {
                    onOpenChange(false);
                    onNavigateToSourceMessage(
                      currentTask.sourceConversationId!,
                      currentTask.sourceMessageId!
                    );
                  }}
                  className="inline-flex items-center gap-1 shrink-0 text-primary hover:underline font-semibold cursor-pointer"
                >
                  <span>View Message</span>
                  <ExternalLink className="h-3 w-3" />
                </button>
              )}
            </div>
          )}

          {/* Edit Form or Detail Display */}
          {isEditing ? (
            <div className="space-y-3.5 p-3.5 rounded-xl border border-primary/30 bg-primary/5 animate-in fade-in">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-foreground">Title</label>
                <Input
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value.slice(0, 200))}
                  className="text-sm bg-card"
                  autoFocus
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-muted-foreground">Description</label>
                <textarea
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value.slice(0, 5000))}
                  rows={3}
                  className="w-full text-xs bg-card border border-border rounded-xl p-2.5 outline-none resize-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-foreground">Priority</label>
                  <select
                    value={editPriority}
                    onChange={(e) => setEditPriority(e.target.value as TaskPriority)}
                    className="w-full h-9 px-2.5 text-xs bg-card border border-border rounded-xl"
                  >
                    <option value="LOW">Low</option>
                    <option value="MEDIUM">Medium</option>
                    <option value="HIGH">High</option>
                    <option value="URGENT">Urgent ⚡</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-muted-foreground">Due Date</label>
                  <Input
                    type="datetime-local"
                    value={editDueDate}
                    onChange={(e) => setEditDueDate(e.target.value)}
                    className="text-xs bg-card h-9"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-1">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setIsEditing(false)}
                  disabled={saving}
                  className="text-xs"
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={handleSaveEdit}
                  disabled={saving || !editTitle.trim()}
                  className="gap-1.5 text-xs"
                >
                  {saving ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Check className="h-3.5 w-3.5" />
                  )}
                  Save Changes
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <h3 className="text-base font-bold text-foreground font-display leading-snug">
                  {currentTask.title}
                </h3>
                {currentTask.description ? (
                  <p className="text-xs text-muted-foreground mt-2 leading-relaxed whitespace-pre-wrap p-3 rounded-xl bg-muted/30 border border-border/50">
                    {currentTask.description}
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground/60 italic mt-1">No description provided.</p>
                )}
              </div>

              {/* Badges & Meta */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 pt-1 text-xs">
                {/* Priority */}
                <div className="p-2.5 rounded-xl border bg-muted/20 space-y-1">
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">
                    Priority
                  </span>
                  <div>
                    <span
                      className={cn(
                        "inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-bold border",
                        priorityColors[currentTask.priority]
                      )}
                    >
                      {currentTask.priority}
                    </span>
                  </div>
                </div>

                {/* Due Date */}
                <div className="p-2.5 rounded-xl border bg-muted/20 space-y-1">
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">
                    Deadline
                  </span>
                  <div className="flex items-center gap-1.5 font-medium text-foreground">
                    <Calendar className="h-3.5 w-3.5 text-primary shrink-0" />
                    <span className={cn(currentTask.isOverdue && "text-rose-500 font-bold")}>
                      {currentTask.dueDate
                        ? new Date(currentTask.dueDate).toLocaleDateString([], {
                            month: "short",
                            day: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })
                        : "No deadline"}
                    </span>
                  </div>
                </div>

                {/* Creator */}
                <div className="p-2.5 rounded-xl border bg-muted/20 space-y-1 col-span-2 sm:col-span-1">
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">
                    Created By
                  </span>
                  <div className="flex items-center gap-1.5 font-medium text-foreground truncate">
                    <User className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <span className="truncate">{currentTask.createdBy?.displayName || "Colleague"}</span>
                  </div>
                </div>
              </div>

              {/* Assignee Control */}
              <div className="p-3 rounded-xl border border-border/70 bg-card space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-foreground flex items-center gap-1.5">
                    <UserCheck className="h-4 w-4 text-primary" />
                    Assigned To
                  </span>
                  <span className="text-[10px] text-muted-foreground">Change assignee:</span>
                </div>

                <select
                  value={currentTask.assignee?.id || ""}
                  onChange={(e) => handleReassign(e.target.value)}
                  className="w-full h-9 px-2.5 text-xs bg-muted/40 border border-border/80 rounded-xl outline-none focus:border-primary/50 text-foreground cursor-pointer font-medium"
                >
                  {colleagues.map((u) => (
                    <option key={u._id} value={u._id}>
                      {u.displayName} ({u.email})
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="flex sm:justify-between items-center gap-2 pt-2 border-t border-border/50">
          <Button
            type="button"
            variant="ghost"
            onClick={handleDelete}
            disabled={deleting}
            className="text-xs text-destructive hover:text-destructive hover:bg-destructive/10 gap-1.5 h-8"
          >
            {deleting ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Trash2 className="h-3.5 w-3.5" />
            )}
            Delete Task
          </Button>

          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="text-xs h-8"
          >
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
