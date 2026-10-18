import React, { useEffect, useState } from "react";
import {
  Users,
  Shield,
  UserPlus,
  Building2,
  Check,
  Copy,
  Trash2,
  Edit2,
  Plus,
  Loader2,
  AlertCircle,
  Crown,
  ShieldAlert,
  Briefcase,
  UserCheck,
  ExternalLink,
} from "lucide-react";
import { cn } from "../../lib/utils";
import {
  api,
  type WorkspaceMember,
  type WorkspaceInvitation,
  type WorkspaceRole,
} from "../../lib/api";
import { useWorkspace } from "../../context/WorkspaceContext";
import { useAuth } from "../../context/AuthContext";
import { CreateWorkspaceModal } from "./CreateWorkspaceModal";
import { InviteMemberModal } from "./InviteMemberModal";
import { Button } from "../ui/button";
import { Input } from "../ui/input";

export function TeamAndRolesTab() {
  const { user } = useAuth();
  const {
    workspaces,
    activeWorkspace,
    userRole,
    isOwner,
    isAdmin,
    canManageRoles,
    canInviteMembers,
    canManageSettings,
    switchWorkspace,
    updateActiveWorkspace,
    reloadWorkspaces,
  } = useWorkspace();

  const [members, setMembers] = useState<WorkspaceMember[]>([]);
  const [invitations, setInvitations] = useState<WorkspaceInvitation[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // Modals
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);

  // Inline Workspace Name Edit
  const [isEditingName, setIsEditingName] = useState(false);
  const [editedName, setEditedName] = useState("");
  const [savingName, setSavingName] = useState(false);

  // Invitation Acceptance
  const [inviteTokenInput, setInviteTokenInput] = useState("");
  const [acceptingToken, setAcceptingToken] = useState(false);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);

  // Read URL query parameter ?token=... on mount
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const tokenParam = urlParams.get("token");
    if (tokenParam) {
      setInviteTokenInput(tokenParam);
    }
  }, []);

  // Fetch members & invitations when active workspace changes
  const loadMembersAndInvitations = async () => {
    if (!activeWorkspace) {
      setMembers([]);
      setInvitations([]);
      return;
    }

    setLoadingMembers(true);
    setActionError(null);
    try {
      const membersRes = await api.getWorkspaceMembers(activeWorkspace.id);
      setMembers(membersRes.members || []);

      if (canInviteMembers) {
        try {
          const invitesRes = await api.getWorkspaceInvitations(activeWorkspace.id);
          setInvitations(invitesRes.invitations || []);
        } catch {
          // ignore if user doesn't have invite view permission
        }
      } else {
        setInvitations([]);
      }
    } catch (err: any) {
      console.error("[TeamAndRolesTab] Error loading members:", err);
      setActionError(err.message || "Failed to load workspace members");
    } finally {
      setLoadingMembers(false);
    }
  };

  useEffect(() => {
    loadMembersAndInvitations();
  }, [activeWorkspace?.id, canInviteMembers]);

  // Handle Workspace Name Update
  const handleSaveName = async () => {
    if (!editedName.trim() || editedName.trim() === activeWorkspace?.name) {
      setIsEditingName(false);
      return;
    }
    setSavingName(true);
    setActionError(null);
    try {
      await updateActiveWorkspace(editedName.trim());
      setIsEditingName(false);
      setActionSuccess("Workspace name updated successfully");
      setTimeout(() => setActionSuccess(null), 3000);
    } catch (err: any) {
      setActionError(err.message || "Failed to update workspace name");
    } finally {
      setSavingName(false);
    }
  };

  // Handle Member Role Change
  const handleRoleChange = async (memberId: string, newRole: WorkspaceRole) => {
    if (!activeWorkspace) return;
    setActionError(null);
    try {
      await api.updateMemberRole(activeWorkspace.id, memberId, newRole);
      setMembers((prev) =>
        prev.map((m) => (m.id === memberId ? { ...m, role: newRole } : m))
      );
      setActionSuccess(`Role updated to ${newRole}`);
      setTimeout(() => setActionSuccess(null), 3000);
      reloadWorkspaces(); // Refresh in case ownership transferred
    } catch (err: any) {
      setActionError(err.message || "Failed to update member role");
    }
  };

  // Handle Member Removal
  const handleRemoveMember = async (member: WorkspaceMember) => {
    if (!activeWorkspace) return;
    const isSelf = member.userId === user?._id;
    const confirmMsg = isSelf
      ? `Are you sure you want to leave ${activeWorkspace.name}?`
      : `Are you sure you want to remove ${member.displayName} from ${activeWorkspace.name}?`;

    if (!window.confirm(confirmMsg)) return;

    setActionError(null);
    try {
      await api.removeWorkspaceMember(activeWorkspace.id, member.id);
      setMembers((prev) => prev.filter((m) => m.id !== member.id));
      setActionSuccess(isSelf ? "You left the workspace" : "Member removed successfully");
      setTimeout(() => setActionSuccess(null), 3000);
      if (isSelf) {
        reloadWorkspaces();
      }
    } catch (err: any) {
      setActionError(err.message || "Failed to remove member");
    }
  };

  // Handle Invitation Revoke
  const handleRevokeInvitation = async (invitationId: string) => {
    if (!activeWorkspace) return;
    setActionError(null);
    try {
      await api.revokeWorkspaceInvitation(activeWorkspace.id, invitationId);
      setInvitations((prev) => prev.filter((i) => i.id !== invitationId));
      setActionSuccess("Invitation revoked");
      setTimeout(() => setActionSuccess(null), 3000);
    } catch (err: any) {
      setActionError(err.message || "Failed to revoke invitation");
    }
  };

  // Handle Accept Invitation
  const handleAcceptInvitation = async () => {
    if (!inviteTokenInput.trim()) return;
    setAcceptingToken(true);
    setActionError(null);
    try {
      const res = await api.acceptWorkspaceInvitation(inviteTokenInput.trim());
      setActionSuccess(res.message || "Successfully joined workspace!");
      setInviteTokenInput("");
      setTimeout(() => setActionSuccess(null), 4000);
      await reloadWorkspaces();
    } catch (err: any) {
      setActionError(err.message || "Failed to accept invitation");
    } finally {
      setAcceptingToken(false);
    }
  };

  const handleCopyLink = (token: string) => {
    const link = `${window.location.origin}/settings?token=${token}`;
    navigator.clipboard.writeText(link);
    setCopiedToken(token);
    setTimeout(() => setCopiedToken(null), 3000);
  };

  // Role Badge Styling Helper
  const getRoleBadge = (role: WorkspaceRole) => {
    switch (role) {
      case "OWNER":
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-purple-500/15 px-2.5 py-0.5 text-[11px] font-bold text-purple-600 dark:text-purple-400 border border-purple-500/30">
            <Crown className="h-3 w-3" /> Owner
          </span>
        );
      case "ADMIN":
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-blue-500/15 px-2.5 py-0.5 text-[11px] font-bold text-blue-600 dark:text-blue-400 border border-blue-500/30">
            <Shield className="h-3 w-3" /> Admin
          </span>
        );
      case "MANAGER":
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2.5 py-0.5 text-[11px] font-bold text-amber-600 dark:text-amber-400 border border-amber-500/30">
            <Briefcase className="h-3 w-3" /> Manager
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-[11px] font-bold text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
            <UserCheck className="h-3 w-3" /> Member
          </span>
        );
    }
  };

  // If user has NO workspaces at all
  if (workspaces.length === 0) {
    return (
      <div className="p-6 md:p-8 space-y-6">
        <div className="rounded-2xl border border-dashed border-border/80 bg-card/60 p-10 text-center flex flex-col items-center justify-center gap-3 backdrop-blur-sm">
          <div className="grid h-14 w-14 place-items-center rounded-2xl bg-primary/15 text-primary shadow-xs">
            <Building2 className="h-7 w-7" />
          </div>
          <div>
            <h3 className="font-display text-lg font-bold text-foreground">
              No Workspaces Found
            </h3>
            <p className="text-xs text-muted-foreground mt-1 max-w-sm">
              You do not belong to any workspace yet. Create a company workspace or paste an invitation token below.
            </p>
          </div>

          <Button
            onClick={() => setIsCreateModalOpen(true)}
            className="mt-2 text-xs font-semibold gap-1.5 cursor-pointer"
          >
            <Plus className="h-4 w-4" /> Create Company Workspace
          </Button>

          {/* Accept Invitation box */}
          <div className="mt-6 w-full max-w-md pt-6 border-t border-border/60">
            <label className="block text-left text-xs font-semibold text-foreground mb-1.5">
              Have an invitation token?
            </label>
            <div className="flex gap-2">
              <Input
                value={inviteTokenInput}
                onChange={(e) => setInviteTokenInput(e.target.value)}
                placeholder="Paste invitation token here..."
                className="text-xs rounded-xl"
              />
              <Button
                variant="outline"
                disabled={!inviteTokenInput.trim() || acceptingToken}
                onClick={handleAcceptInvitation}
                className="text-xs shrink-0 cursor-pointer"
              >
                {acceptingToken ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Join"}
              </Button>
            </div>
          </div>
        </div>

        <CreateWorkspaceModal
          open={isCreateModalOpen}
          onOpenChange={setIsCreateModalOpen}
        />
      </div>
    );
  }

  return (
    <div className="p-6 md:p-8 space-y-7">
      {/* Notifications / Alerts */}
      {actionSuccess && (
        <div className="flex items-center gap-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 p-3 text-xs font-semibold text-emerald-600 dark:text-emerald-400 animate-in fade-in">
          <Check className="h-4 w-4" />
          <span>{actionSuccess}</span>
        </div>
      )}

      {actionError && (
        <div className="flex items-center gap-2 rounded-xl bg-destructive/10 border border-destructive/20 p-3 text-xs font-semibold text-destructive animate-in fade-in">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{actionError}</span>
        </div>
      )}

      {/* 1. WORKSPACE HEADER & SWITCHER */}
      <div className="rounded-2xl border border-border/80 bg-card/80 p-5 shadow-xs backdrop-blur-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-primary/15 text-primary shadow-xs">
              <Building2 className="h-6 w-6" />
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                {isEditingName ? (
                  <div className="flex items-center gap-2">
                    <Input
                      value={editedName}
                      onChange={(e) => setEditedName(e.target.value)}
                      className="h-8 text-sm font-bold w-48 rounded-lg"
                      autoFocus
                    />
                    <Button
                      size="sm"
                      onClick={handleSaveName}
                      disabled={savingName}
                      className="h-8 text-xs px-2.5 cursor-pointer"
                    >
                      {savingName ? <Loader2 className="h-3 w-3 animate-spin" /> : "Save"}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setIsEditingName(false)}
                      className="h-8 text-xs px-2 cursor-pointer"
                    >
                      Cancel
                    </Button>
                  </div>
                ) : (
                  <>
                    <h3 className="font-display text-lg font-bold text-foreground">
                      {activeWorkspace?.name}
                    </h3>
                    {canManageSettings && (
                      <button
                        onClick={() => {
                          setEditedName(activeWorkspace?.name || "");
                          setIsEditingName(true);
                        }}
                        className="text-muted-foreground/60 hover:text-foreground p-1 transition-colors cursor-pointer"
                        title="Rename workspace"
                      >
                        <Edit2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </>
                )}
              </div>
              <p className="text-xs text-muted-foreground flex items-center gap-2">
                <span>Slug: <strong className="font-mono text-foreground">{activeWorkspace?.slug}</strong></span>
                <span>•</span>
                <span>{members.length} members</span>
              </p>
            </div>
          </div>

          {/* Switcher & Create Workspace Actions */}
          <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
            {workspaces.length > 1 && (
              <select
                value={activeWorkspace?.id}
                onChange={(e) => switchWorkspace(e.target.value)}
                className="h-9 rounded-xl border border-border bg-background px-3 text-xs font-semibold text-foreground cursor-pointer focus:outline-none focus:ring-1 focus:ring-primary"
              >
                {workspaces.map((ws) => (
                  <option key={ws.id} value={ws.id}>
                    {ws.name} ({ws.myRole})
                  </option>
                ))}
              </select>
            )}

            <Button
              size="sm"
              variant="outline"
              onClick={() => setIsCreateModalOpen(true)}
              className="h-9 rounded-xl text-xs gap-1.5 cursor-pointer"
            >
              <Plus className="h-3.5 w-3.5" /> New Workspace
            </Button>
          </div>
        </div>
      </div>

      {/* 2. USER ROLE & CAPABILITY CARD */}
      <div className="rounded-2xl border border-border/80 bg-muted/30 p-4.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="space-y-0.5">
          <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
            <span>Your Scoped Role in {activeWorkspace?.name}:</span>
            {userRole && getRoleBadge(userRole)}
          </div>
          <p className="text-[11px] text-muted-foreground">
            {isOwner
              ? "Full administrative ownership. You can transfer ownership, delete the workspace, and manage all member roles."
              : isAdmin
              ? "Administrative access. You can invite colleagues, modify manager/member roles, and manage workspace settings."
              : userRole === "MANAGER"
              ? "Manager access. You can oversee team operations and assigned tasks. Workspace-level role changes require Admin access."
              : "Standard Member access. You can view the workspace directory and participate in assigned projects."}
          </p>
        </div>

        {canInviteMembers && (
          <Button
            size="sm"
            onClick={() => setIsInviteModalOpen(true)}
            className="shrink-0 text-xs gap-1.5 cursor-pointer"
          >
            <UserPlus className="h-3.5 w-3.5" /> Invite Teammate
          </Button>
        )}
      </div>

      {/* 3. INVITATION ACCEPTANCE BOX (FOR JOINING OTHER WORKSPACES) */}
      <div className="rounded-2xl border border-border/60 bg-card/60 p-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          <div>
            <h4 className="text-xs font-bold text-foreground">Join another workspace with an invitation token</h4>
            <p className="text-[11px] text-muted-foreground">
              If an administrator invited you to their workspace, paste your invitation token below.
            </p>
          </div>
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <Input
              value={inviteTokenInput}
              onChange={(e) => setInviteTokenInput(e.target.value)}
              placeholder="Paste 64-character token..."
              className="h-8 text-xs font-mono w-full sm:w-64 rounded-lg"
            />
            <Button
              size="sm"
              variant="outline"
              disabled={!inviteTokenInput.trim() || acceptingToken}
              onClick={handleAcceptInvitation}
              className="h-8 text-xs shrink-0 cursor-pointer"
            >
              {acceptingToken ? <Loader2 className="h-3 w-3 animate-spin" /> : "Accept"}
            </Button>
          </div>
        </div>
      </div>

      {/* 4. TEAM MEMBERS DIRECTORY & ROLE MANAGEMENT */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="text-base font-bold font-display text-foreground">
              Workspace Members ({members.length})
            </h4>
            <p className="text-xs text-muted-foreground">
              Active members and their assigned permissions in this workspace.
            </p>
          </div>
        </div>

        <div className="rounded-2xl border border-border/80 bg-card/90 overflow-hidden shadow-xs">
          {loadingMembers ? (
            <div className="flex h-36 items-center justify-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
              Loading workspace members...
            </div>
          ) : members.length === 0 ? (
            <div className="p-8 text-center text-xs text-muted-foreground">
              No active members found.
            </div>
          ) : (
            <div className="divide-y divide-border/60">
              {members.map((m) => {
                const isCurrentUser = m.userId === user?._id;
                const isMemberOwner = m.role === "OWNER";
                const isMemberAdmin = m.role === "ADMIN";

                // Can the caller modify this member's role?
                // - Cannot modify own role
                // - If member is OWNER, only OWNER can modify (transfer ownership)
                // - If caller is ADMIN, cannot modify OWNER or another ADMIN
                const canEditThisRole =
                  canManageRoles &&
                  !isCurrentUser &&
                  (isOwner || (!isMemberOwner && !isMemberAdmin));

                const canRemoveThisUser =
                  (canManageRoles && (isOwner || !isMemberOwner)) || isCurrentUser;

                return (
                  <div
                    key={m.id}
                    className="flex flex-col sm:flex-row sm:items-center justify-between p-4 gap-3 hover:bg-muted/30 transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="relative">
                        <div className="grid h-10 w-10 place-items-center rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 font-display text-sm font-bold text-primary ring-1 ring-primary/20">
                          {m.initials || "U"}
                        </div>
                        {m.online && (
                          <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-card bg-emerald-500" />
                        )}
                      </div>

                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold text-foreground truncate">
                            {m.displayName}
                          </span>
                          {isCurrentUser && (
                            <span className="rounded-md bg-muted px-1.5 py-0.2 text-[10px] font-semibold text-muted-foreground">
                              You
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground truncate">{m.email}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 shrink-0 self-end sm:self-auto">
                      {/* Role Selector or Badge */}
                      {canEditThisRole ? (
                        <select
                          value={m.role}
                          onChange={(e) => handleRoleChange(m.id, e.target.value as WorkspaceRole)}
                          className="h-8 rounded-xl border border-border bg-background px-2.5 text-xs font-semibold text-foreground focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer"
                        >
                          {isOwner && <option value="OWNER">Owner (Transfer)</option>}
                          <option value="ADMIN">Admin</option>
                          <option value="MANAGER">Manager</option>
                          <option value="MEMBER">Member</option>
                        </select>
                      ) : (
                        getRoleBadge(m.role)
                      )}

                      {/* Remove / Leave Action Button */}
                      {canRemoveThisUser && (
                        <button
                          onClick={() => handleRemoveMember(m)}
                          className="rounded-lg p-1.5 text-muted-foreground/60 hover:text-destructive hover:bg-destructive/10 transition-colors cursor-pointer"
                          title={isCurrentUser ? "Leave workspace" : "Remove member"}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* 5. PENDING INVITATIONS SECTION (VISIBLE TO OWNERS & ADMINS) */}
      {canInviteMembers && (
        <div className="space-y-3 pt-2">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="text-base font-bold font-display text-foreground">
                Pending Invitations ({invitations.length})
              </h4>
              <p className="text-xs text-muted-foreground">
                Invitations sent to colleagues awaiting acceptance.
              </p>
            </div>
          </div>

          <div className="rounded-2xl border border-border/80 bg-card/90 overflow-hidden shadow-xs">
            {invitations.length === 0 ? (
              <div className="p-8 text-center text-xs text-muted-foreground">
                No pending invitations. Click "Invite Teammate" above to send one.
              </div>
            ) : (
              <div className="divide-y divide-border/60">
                {invitations.map((inv) => (
                  <div
                    key={inv.id}
                    className="flex flex-col sm:flex-row sm:items-center justify-between p-4 gap-3 hover:bg-muted/30 transition-colors"
                  >
                    <div className="space-y-0.5 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-foreground truncate">
                          {inv.email}
                        </span>
                        {getRoleBadge(inv.role as WorkspaceRole)}
                      </div>
                      <p className="text-[11px] text-muted-foreground">
                        Expires: {new Date(inv.expiresAt).toLocaleDateString()}
                      </p>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleCopyLink(inv.token)}
                        className="h-8 text-xs gap-1 cursor-pointer"
                      >
                        {copiedToken === inv.token ? (
                          <Check className="h-3.5 w-3.5 text-emerald-500" />
                        ) : (
                          <Copy className="h-3.5 w-3.5" />
                        )}
                        <span>{copiedToken === inv.token ? "Copied" : "Copy Link"}</span>
                      </Button>

                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleRevokeInvitation(inv.id)}
                        className="h-8 text-xs text-destructive hover:bg-destructive/10 cursor-pointer"
                      >
                        Revoke
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modals */}
      <CreateWorkspaceModal
        open={isCreateModalOpen}
        onOpenChange={setIsCreateModalOpen}
      />
      <InviteMemberModal
        open={isInviteModalOpen}
        onOpenChange={setIsInviteModalOpen}
        onInvited={() => loadMembersAndInvitations()}
      />
    </div>
  );
}
