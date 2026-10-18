import React, { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "../ui/dialog";
import { Input } from "../ui/input";
import { Button } from "../ui/button";
import {
  api,
  type BackendUser,
  type BackendTask,
  type TaskPriority,
} from "../../lib/api";
import {
  CheckSquare,
  User,
  Calendar,
  AlertCircle,
  Loader2,
  Sparkles,
  MessageSquare,
  ShieldAlert,
} from "lucide-react";
import { cn } from "../../lib/utils";

interface CreateTaskModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceId?: string;
  currentUserId?: string;
  sourceMessage?: {
    id: string;
    conversationId: string;
    text: string;
    senderName?: string;
  } | null;
  onTaskCreated?: (task: BackendTask) => void;
}

export function CreateTaskModal({
  open,
  onOpenChange,
  workspaceId,
  currentUserId,
  sourceMessage,
  onTaskCreated,
}: CreateTaskModalProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("MEDIUM");
  const [dueDate, setDueDate] = useState("");
  const [assigneeId, setAssigneeId] = useState("");
  const [colleagues, setColleagues] = useState<BackendUser[]>([]);
  const [loadingColleagues, setLoadingColleagues] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Initialize form fields whenever modal opens
  useEffect(() => {
    if (open) {
      setError(null);

      if (sourceMessage) {
        // Derive clean initial title from message text
        const snippet = sourceMessage.text.trim();
        const firstLine = snippet.split("\n")[0].slice(0, 80);
        setTitle(firstLine || "Task from conversation");
        setDescription(snippet);
      } else {
        setTitle("");
        setDescription("");
      }

      setPriority("MEDIUM");
      setDueDate("");
      setAssigneeId(currentUserId || "");

      // Load workspace colleagues
      if (workspaceId) {
        setLoadingColleagues(true);
        api
          .searchWorkspaceColleagues(workspaceId)
          .then((res) => {
            setColleagues(res.users);
            if (!currentUserId && res.users.length > 0) {
              setAssigneeId(res.users[0]._id);
            }
          })
          .catch((err) => {
            console.error("Failed to load workspace members:", err);
          })
          .finally(() => {
            setLoadingColleagues(false);
          });
      }
    }
  }, [open, workspaceId, sourceMessage, currentUserId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!workspaceId) {
      setError("Active workspace is required to create a task.");
      return;
    }

    const trimmedTitle = title.trim();
    if (!trimmedTitle || trimmedTitle.length < 2) {
      setError("Task title must be at least 2 characters.");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      let res;
      if (sourceMessage) {
        res = await api.createTaskFromMessage(workspaceId, {
          conversationId: sourceMessage.conversationId,
          messageId: sourceMessage.id,
          title: trimmedTitle,
          description: description.trim() || undefined,
          assigneeId: assigneeId || undefined,
          priority,
          dueDate: dueDate ? new Date(dueDate).toISOString() : undefined,
        });
      } else {
        res = await api.createTask(workspaceId, {
          title: trimmedTitle,
          description: description.trim() || undefined,
          assigneeId: assigneeId || undefined,
          priority,
          dueDate: dueDate ? new Date(dueDate).toISOString() : undefined,
        });
      }

      if (onTaskCreated) {
        onTaskCreated(res.task);
      }
      onOpenChange(false);
    } catch (err: any) {
      setError(err.message || "Failed to create task");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg bg-card/95 border-border/80 shadow-2xl backdrop-blur-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2.5 text-lg font-bold font-display">
            <div className="grid h-9 w-9 place-items-center rounded-xl bg-primary/15 text-primary shadow-xs">
              <CheckSquare className="h-5 w-5" />
            </div>
            <span>{sourceMessage ? "Create Task from Message" : "Create New Task"}</span>
          </DialogTitle>
        </DialogHeader>

        {sourceMessage && (
          <div className="p-3 rounded-xl bg-primary/10 border border-primary/20 flex items-start gap-2.5 text-xs text-foreground animate-in fade-in">
            <MessageSquare className="h-4 w-4 text-primary shrink-0 mt-0.5" />
            <div className="min-w-0 flex-1">
              <span className="font-semibold text-primary">
                Source Message ({sourceMessage.senderName || "Colleague"}):
              </span>
              <p className="line-clamp-2 text-muted-foreground mt-0.5 italic">
                "{sourceMessage.text}"
              </p>
            </div>
          </div>
        )}

        {error && (
          <div className="text-xs text-destructive font-medium bg-destructive/10 border border-destructive/20 p-2.5 rounded-lg flex items-center gap-2 animate-in fade-in">
            <ShieldAlert className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="py-2 space-y-4">
          {/* Title */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-foreground flex items-center justify-between">
              <span>Task Title <span className="text-destructive">*</span></span>
              <span className="text-[10px] text-muted-foreground font-mono">{title.length}/200</span>
            </label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value.slice(0, 200))}
              placeholder="e.g. Follow up on database connection timeout"
              className="text-sm bg-muted/30 border-border/70 rounded-xl"
              autoFocus
              required
            />
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground flex items-center justify-between">
              <span>Description / Notes</span>
              <span className="text-[10px] text-muted-foreground font-mono">{description.length}/5000</span>
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value.slice(0, 5000))}
              placeholder="Additional task requirements or context..."
              rows={3}
              className="w-full text-sm bg-muted/30 border border-border/70 rounded-xl p-2.5 outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/40 resize-none transition-all"
            />
          </div>

          {/* Assignee & Priority Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Assignee */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <User className="h-3.5 w-3.5 text-primary" />
                <span>Assignee</span>
              </label>
              <select
                value={assigneeId}
                onChange={(e) => setAssigneeId(e.target.value)}
                disabled={loadingColleagues}
                className="w-full h-10 px-3 text-xs bg-muted/30 border border-border/70 rounded-xl outline-none focus:border-primary/50 text-foreground cursor-pointer"
              >
                {colleagues.map((u) => (
                  <option key={u._id} value={u._id}>
                    {u.displayName} ({u.email})
                  </option>
                ))}
              </select>
            </div>

            {/* Priority */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <AlertCircle className="h-3.5 w-3.5 text-primary" />
                <span>Priority</span>
              </label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as TaskPriority)}
                className="w-full h-10 px-3 text-xs bg-muted/30 border border-border/70 rounded-xl outline-none focus:border-primary/50 text-foreground cursor-pointer font-medium"
              >
                <option value="LOW">Low</option>
                <option value="MEDIUM">Medium</option>
                <option value="HIGH">High</option>
                <option value="URGENT">Urgent ⚡</option>
              </select>
            </div>
          </div>

          {/* Due Date */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
              <Calendar className="h-3.5 w-3.5 text-primary" />
              <span>Due Date (Optional)</span>
            </label>
            <Input
              type="datetime-local"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="text-xs bg-muted/30 border-border/70 rounded-xl h-10"
            />
          </div>

          <DialogFooter className="pt-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={submitting || !title.trim()}
              className="gap-2 shadow-sm cursor-pointer"
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Creating Task...
                </>
              ) : (
                <>
                  <CheckSquare className="h-4 w-4" />
                  Create Task
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
