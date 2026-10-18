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
import { UserPlus, Loader2, Check, Copy, AlertCircle } from "lucide-react";
import { api, type WorkspaceInvitation, type WorkspaceRole } from "../../lib/api";
import { useWorkspace } from "../../context/WorkspaceContext";

interface InviteMemberModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onInvited?: (invitation: WorkspaceInvitation) => void;
}

export function InviteMemberModal({
  open,
  onOpenChange,
  onInvited,
}: InviteMemberModalProps) {
  const { activeWorkspace } = useWorkspace();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"ADMIN" | "MANAGER" | "MEMBER">("MEMBER");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdInvite, setCreatedInvite] = useState<WorkspaceInvitation | null>(null);
  const [copied, setCopied] = useState(false);

  const handleReset = () => {
    setEmail("");
    setRole("MEMBER");
    setError(null);
    setCreatedInvite(null);
    setCopied(false);
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      handleReset();
    }
    onOpenChange(nextOpen);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeWorkspace) return;
    if (!email.trim() || !email.includes("@")) {
      setError("Please enter a valid email address.");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const res = await api.inviteWorkspaceMember(activeWorkspace.id, email.trim(), role);
      setCreatedInvite(res.invitation);
      if (onInvited) {
        onInvited(res.invitation);
      }
    } catch (err: any) {
      setError(err.message || "Failed to create invitation");
    } finally {
      setLoading(false);
    }
  };

  const handleCopyLink = () => {
    if (!createdInvite) return;
    const inviteUrl = `${window.location.origin}/settings?tab=Team%20%26%20Roles&token=${createdInvite.token}`;
    navigator.clipboard.writeText(inviteUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 3000);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md bg-card/95 border-border/80 shadow-2xl backdrop-blur-xl">
        <DialogHeader className="gap-2">
          <div className="flex items-center gap-2.5">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-primary/15 text-primary shadow-xs">
              <UserPlus className="h-5 w-5" />
            </div>
            <div>
              <DialogTitle className="text-lg font-bold font-display text-foreground">
                Invite Teammate
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                Invite a colleague to join <strong>{activeWorkspace?.name}</strong>.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {createdInvite ? (
          <div className="py-3 space-y-4 animate-in fade-in">
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3.5 text-xs text-emerald-700 dark:text-emerald-400">
              <p className="font-semibold">Invitation generated successfully!</p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                An invitation token has been created for <strong>{createdInvite.email}</strong> with role <strong>{createdInvite.role}</strong>.
              </p>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">Invitation Link / Token</label>
              <div className="flex items-center gap-2">
                <Input
                  readOnly
                  value={`${window.location.origin}/settings?tab=Team%20%26%20Roles&token=${createdInvite.token}`}
                  className="text-xs font-mono bg-muted/50 rounded-xl"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleCopyLink}
                  className="shrink-0 text-xs gap-1.5 cursor-pointer"
                >
                  {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                  {copied ? "Copied" : "Copy"}
                </Button>
              </div>
              <p className="text-[11px] text-muted-foreground mt-1">
                Colleague can open this link to accept their invitation and join this workspace.
              </p>
            </div>

            <DialogFooter>
              <Button
                type="button"
                onClick={() => handleOpenChange(false)}
                className="w-full text-xs cursor-pointer"
              >
                Done
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div className="py-4 space-y-3.5">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">Teammate's Email</label>
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="colleague@actionflow.com"
                  className="text-sm rounded-xl"
                  autoFocus
                  disabled={loading}
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">Workspace Role</label>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value as any)}
                  disabled={loading}
                  className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer"
                >
                  <option value="MEMBER">Member (Read team directory, collaborate in workspace)</option>
                  <option value="MANAGER">Manager (Team lead view, manage team tasks in Phase 2)</option>
                  <option value="ADMIN">Admin (Manage settings, invite members, change roles)</option>
                </select>
                <p className="text-[11px] text-muted-foreground">
                  Role is strictly scoped to this workspace and enforced by server-side RBAC.
                </p>
              </div>

              {error && (
                <div className="flex items-start gap-2 rounded-xl bg-destructive/10 border border-destructive/20 p-2.5 text-xs text-destructive">
                  <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}
            </div>

            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                type="button"
                variant="ghost"
                onClick={() => handleOpenChange(false)}
                disabled={loading}
                className="text-xs"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={loading || !email.trim()}
                className="text-xs font-semibold cursor-pointer"
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    Inviting...
                  </>
                ) : (
                  "Send Invitation"
                )}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
