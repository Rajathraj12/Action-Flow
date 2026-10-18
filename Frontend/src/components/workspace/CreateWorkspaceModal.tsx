import React, { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "../ui/dialog";
import { Input } from "../ui/input";
import { Button } from "../ui/button";
import { Building2, Loader2, Sparkles } from "lucide-react";
import { useWorkspace } from "../../context/WorkspaceContext";

interface CreateWorkspaceModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (workspaceId: string) => void;
}

export function CreateWorkspaceModal({
  open,
  onOpenChange,
  onCreated,
}: CreateWorkspaceModalProps) {
  const { createWorkspace } = useWorkspace();
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || name.trim().length < 2) {
      setError("Workspace name must be at least 2 characters.");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const created = await createWorkspace(name.trim());
      setName("");
      onOpenChange(false);
      if (onCreated) {
        onCreated(created.id);
      }
    } catch (err: any) {
      setError(err.message || "Failed to create workspace");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md bg-card/95 border-border/80 shadow-2xl backdrop-blur-xl">
        <form onSubmit={handleSubmit}>
          <DialogHeader className="gap-2.5">
            <div className="flex items-center gap-2.5">
              <div className="grid h-10 w-10 place-items-center rounded-xl bg-primary/15 text-primary shadow-xs">
                <Building2 className="h-5 w-5" />
              </div>
              <div>
                <DialogTitle className="text-lg font-bold font-display text-foreground">
                  Create Workspace
                </DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                  Set up a company workspace for your team. You will be assigned as Owner.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="py-4 space-y-3">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">Workspace Name</label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Acme Corp, Engineering, Product Lab"
                className="text-sm rounded-xl"
                autoFocus
                disabled={loading}
              />
            </div>

            {error && (
              <p className="text-xs font-medium text-destructive bg-destructive/10 p-2.5 rounded-xl border border-destructive/20 animate-in fade-in">
                {error}
              </p>
            )}

            <div className="rounded-xl bg-muted/40 p-3 text-[11px] text-muted-foreground flex items-center gap-2 border border-border/50">
              <Sparkles className="h-4 w-4 text-primary shrink-0" />
              <span>
                As workspace creator, you'll have full administrative control to invite members, manage teams, and configure permissions.
              </span>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={loading}
              className="text-xs"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={loading || !name.trim()}
              className="text-xs font-semibold cursor-pointer"
            >
              {loading ? (
                <>
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  Creating...
                </>
              ) : (
                "Create Workspace"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
