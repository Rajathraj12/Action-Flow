import React, { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "../ui/dialog";
import { Input } from "../ui/input";
import { Button } from "../ui/button";
import {
  api,
  type BackendConversation,
  type BackendUser,
} from "../../lib/api";
import {
  Users,
  UserPlus,
  Shield,
  ShieldCheck,
  UserMinus,
  LogOut,
  Pencil,
  Check,
  X,
  Loader2,
  Search,
  ShieldAlert,
} from "lucide-react";
import { cn } from "../../lib/utils";

interface GroupInfoModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conversation: BackendConversation | null;
  workspaceId?: string;
  currentUserId?: string;
  onGroupUpdated: () => void;
  onGroupLeft: (conversationId: string) => void;
}

export function GroupInfoModal({
  open,
  onOpenChange,
  conversation,
  workspaceId,
  currentUserId,
  onGroupUpdated,
  onGroupLeft,
}: GroupInfoModalProps) {
  const [groupDetails, setGroupDetails] = useState<BackendConversation | null>(conversation);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Editing metadata
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  // Adding member
  const [isAddingMember, setIsAddingMember] = useState(false);
  const [colleagueSearch, setColleagueSearch] = useState("");
  const [colleagues, setColleagues] = useState<BackendUser[]>([]);
  const [loadingColleagues, setLoadingColleagues] = useState(false);
  const [addingUserId, setAddingUserId] = useState<string | null>(null);

  // Leaving & Removing states
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const isAdmin =
    groupDetails?.myGroupRole === "GROUP_ADMIN" ||
    (currentUserId && groupDetails?.admins?.includes(currentUserId));

  // Fetch fresh group details whenever modal opens
  const refreshDetails = async () => {
    if (!open || !workspaceId || !conversation?.id) return;
    setLoadingDetails(true);
    setError(null);
    try {
      const res = await api.getGroupDetails(workspaceId, conversation.id);
      setGroupDetails(res.conversation);
      setEditName(res.conversation.name || "");
      setEditDescription(res.conversation.description || "");
    } catch (err: any) {
      setError(err.message || "Failed to load group details");
    } finally {
      setLoadingDetails(false);
    }
  };

  useEffect(() => {
    if (open) {
      setGroupDetails(conversation);
      setEditName(conversation?.name || "");
      setEditDescription(conversation?.description || "");
      setIsEditing(false);
      setIsAddingMember(false);
      refreshDetails();
    }
  }, [open, conversation?.id, workspaceId]);

  // Load colleagues for adding members
  useEffect(() => {
    if (isAddingMember && workspaceId) {
      setLoadingColleagues(true);
      api
        .searchWorkspaceColleagues(workspaceId, colleagueSearch)
        .then((res) => {
          // Filter out existing participants
          const currentMemberIds = new Set(
            (groupDetails?.participants || []).map((p) => p.id)
          );
          setColleagues(res.users.filter((u) => !currentMemberIds.has(u._id)));
        })
        .catch((err) => {
          console.error("Failed to search colleagues:", err);
        })
        .finally(() => {
          setLoadingColleagues(false);
        });
    }
  }, [isAddingMember, workspaceId, colleagueSearch, groupDetails]);

  // Handle Save Metadata Edit
  const handleSaveMetadata = async () => {
    if (!workspaceId || !conversation?.id) return;
    const trimmed = editName.trim();
    if (!trimmed) {
      setError("Group name cannot be empty");
      return;
    }
    setSavingEdit(true);
    setError(null);
    try {
      await api.updateGroupDetails(workspaceId, conversation.id, {
        name: trimmed,
        description: editDescription.trim(),
      });
      setIsEditing(false);
      await refreshDetails();
      onGroupUpdated();
    } catch (err: any) {
      setError(err.message || "Failed to update group metadata");
    } finally {
      setSavingEdit(false);
    }
  };

  // Handle Add Member
  const handleAddMember = async (targetUserId: string) => {
    if (!workspaceId || !conversation?.id) return;
    setAddingUserId(targetUserId);
    setError(null);
    try {
      await api.addGroupMember(workspaceId, conversation.id, targetUserId);
      setIsAddingMember(false);
      setColleagueSearch("");
      await refreshDetails();
      onGroupUpdated();
    } catch (err: any) {
      setError(err.message || "Failed to add member");
    } finally {
      setAddingUserId(null);
    }
  };

  // Handle Remove Member
  const handleRemoveMember = async (targetUserId: string, targetName: string) => {
    if (!workspaceId || !conversation?.id) return;
    if (!confirm(`Are you sure you want to remove ${targetName} from this group?`)) return;

    setActionLoading(`remove-${targetUserId}`);
    setError(null);
    try {
      await api.removeGroupMember(workspaceId, conversation.id, targetUserId);
      await refreshDetails();
      onGroupUpdated();
    } catch (err: any) {
      setError(err.message || "Failed to remove member");
    } finally {
      setActionLoading(null);
    }
  };

  // Handle Promote / Demote Admin
  const handleToggleAdminRole = async (
    targetUserId: string,
    currentRole: "GROUP_ADMIN" | "MEMBER"
  ) => {
    if (!workspaceId || !conversation?.id) return;
    const nextRole = currentRole === "GROUP_ADMIN" ? "MEMBER" : "GROUP_ADMIN";

    setActionLoading(`role-${targetUserId}`);
    setError(null);
    try {
      await api.updateGroupMemberRole(workspaceId, conversation.id, targetUserId, nextRole);
      await refreshDetails();
      onGroupUpdated();
    } catch (err: any) {
      setError(err.message || "Failed to update role");
    } finally {
      setActionLoading(null);
    }
  };

  // Handle Leave Group
  const handleLeaveGroup = async () => {
    if (!workspaceId || !conversation?.id) return;
    if (!confirm("Are you sure you want to leave this group chat?")) return;

    setActionLoading("leave");
    setError(null);
    try {
      await api.leaveGroup(workspaceId, conversation.id);
      onOpenChange(false);
      onGroupLeft(conversation.id);
    } catch (err: any) {
      setError(err.message || "Failed to leave group");
    } finally {
      setActionLoading(null);
    }
  };

  if (!conversation) return null;

  const participants = groupDetails?.participants || [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg bg-card/95 border-border/80 shadow-2xl backdrop-blur-xl">
        <DialogHeader>
          <div className="flex items-center justify-between pr-4">
            <DialogTitle className="flex items-center gap-2.5 text-lg font-bold font-display">
              <div className="grid h-9 w-9 place-items-center rounded-xl bg-primary/15 text-primary shadow-xs">
                <Users className="h-5 w-5" />
              </div>
              <span>Group Info</span>
            </DialogTitle>

            {isAdmin && !isEditing && (
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
          {/* Metadata Display / Edit Section */}
          {isEditing ? (
            <div className="space-y-3 p-3.5 rounded-xl border border-primary/30 bg-primary/5 animate-in fade-in">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-foreground">Group Name</label>
                <Input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value.slice(0, 80))}
                  placeholder="Group Name"
                  className="text-sm bg-card"
                  autoFocus
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-muted-foreground">Description</label>
                <Input
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value.slice(0, 300))}
                  placeholder="Optional description"
                  className="text-sm bg-card"
                />
              </div>

              <div className="flex justify-end gap-2 pt-1">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setIsEditing(false)}
                  disabled={savingEdit}
                  className="text-xs"
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={handleSaveMetadata}
                  disabled={savingEdit || !editName.trim()}
                  className="gap-1.5 text-xs"
                >
                  {savingEdit ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Check className="h-3.5 w-3.5" />
                  )}
                  Save Changes
                </Button>
              </div>
            </div>
          ) : (
            <div className="p-3.5 rounded-2xl bg-muted/30 border border-border/60 space-y-1.5">
              <h3 className="text-base font-bold text-foreground font-display">
                {groupDetails?.name || conversation.name}
              </h3>
              {groupDetails?.description && (
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {groupDetails.description}
                </p>
              )}
              <div className="pt-2 flex items-center gap-3 text-[11px] text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Users className="h-3.5 w-3.5 text-primary" />
                  {participants.length} member{participants.length !== 1 ? "s" : ""}
                </span>
                {groupDetails?.myGroupRole && (
                  <span className="flex items-center gap-1 font-semibold text-primary">
                    <ShieldCheck className="h-3.5 w-3.5" />
                    Your role: {groupDetails.myGroupRole === "GROUP_ADMIN" ? "Admin" : "Member"}
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Members Header & Add Member Trigger */}
          <div className="flex items-center justify-between pt-1">
            <h4 className="text-xs font-bold text-foreground uppercase tracking-wider">
              Members ({participants.length})
            </h4>

            {isAdmin && !isAddingMember && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setIsAddingMember(true)}
                className="h-7 gap-1 text-xs rounded-lg text-primary border-primary/30 hover:bg-primary/10"
              >
                <UserPlus className="h-3 w-3" />
                Add Member
              </Button>
            )}
          </div>

          {/* Inline Add Member Search */}
          {isAddingMember && (
            <div className="p-3 rounded-xl border border-border/80 bg-muted/40 space-y-2 animate-in fade-in">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-foreground">Add Teammate</span>
                <button
                  type="button"
                  onClick={() => setIsAddingMember(false)}
                  className="text-muted-foreground hover:text-foreground text-xs"
                >
                  ✕
                </button>
              </div>

              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={colleagueSearch}
                  onChange={(e) => setColleagueSearch(e.target.value)}
                  placeholder="Search workspace members..."
                  className="pl-8 text-xs bg-card h-8"
                  autoFocus
                />
              </div>

              <div className="max-h-36 overflow-y-auto space-y-1 custom-scrollbar">
                {loadingColleagues ? (
                  <div className="py-2 text-center text-xs text-muted-foreground">
                    <Loader2 className="h-3.5 w-3.5 animate-spin mx-auto mb-1 text-primary" />
                    Searching...
                  </div>
                ) : colleagues.length === 0 ? (
                  <p className="text-center text-xs text-muted-foreground py-2">
                    {colleagueSearch ? "No colleagues match search." : "All workspace members are in this group."}
                  </p>
                ) : (
                  colleagues.map((u) => (
                    <div
                      key={u._id}
                      className="flex items-center justify-between p-1.5 rounded-lg hover:bg-card border border-transparent hover:border-border/60 transition-all text-xs"
                    >
                      <div className="min-w-0 pr-2">
                        <p className="font-semibold truncate text-foreground">{u.displayName}</p>
                        <p className="text-[10px] text-muted-foreground truncate">{u.email}</p>
                      </div>
                      <Button
                        size="sm"
                        onClick={() => handleAddMember(u._id)}
                        disabled={addingUserId === u._id}
                        className="h-6 px-2.5 text-[11px] gap-1"
                      >
                        {addingUserId === u._id ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          "Add"
                        )}
                      </Button>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* Members List */}
          <div className="max-h-56 overflow-y-auto space-y-1.5 custom-scrollbar pr-1">
            {loadingDetails && participants.length === 0 ? (
              <div className="py-8 text-center text-xs text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2 text-primary" />
                Loading members...
              </div>
            ) : (
              participants.map((m) => {
                const isMe = currentUserId && m.id === currentUserId;
                const isMemberAdmin =
                  m.groupRole === "GROUP_ADMIN" ||
                  (groupDetails?.admins && groupDetails.admins.includes(m.id));
                const isCreator = groupDetails?.createdBy === m.id;

                return (
                  <div
                    key={m.id}
                    className="flex items-center justify-between p-2 rounded-xl bg-card border border-border/60 hover:border-border transition-all"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="relative">
                        <div className="grid h-8 w-8 place-items-center rounded-full bg-gradient-to-br from-primary/20 to-primary/5 font-display text-xs font-bold text-primary ring-1 ring-primary/20">
                          {m.initials || "U"}
                        </div>
                        {m.online && (
                          <span className="absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full border border-card bg-emerald-500" />
                        )}
                      </div>

                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p className="text-xs font-semibold truncate text-foreground">
                            {m.displayName}
                          </p>
                          {isMe && (
                            <span className="text-[10px] text-muted-foreground font-mono">
                              (You)
                            </span>
                          )}
                        </div>
                        <p className="text-[10px] text-muted-foreground truncate">{m.email}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {/* Role Badge */}
                      {isMemberAdmin ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-primary/15 text-primary border border-primary/25">
                          <ShieldCheck className="h-3 w-3" />
                          Admin
                        </span>
                      ) : (
                        <span className="text-[10px] text-muted-foreground font-medium px-1">
                          Member
                        </span>
                      )}

                      {/* Admin Management Actions for Other Members */}
                      {isAdmin && !isMe && (
                        <div className="flex items-center gap-1 pl-1">
                          {/* Toggle Admin Role */}
                          <button
                            type="button"
                            onClick={() =>
                              handleToggleAdminRole(
                                m.id,
                                isMemberAdmin ? "GROUP_ADMIN" : "MEMBER"
                              )
                            }
                            disabled={actionLoading === `role-${m.id}`}
                            className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted text-xs cursor-pointer transition-colors"
                            title={
                              isMemberAdmin
                                ? "Demote from Admin"
                                : "Promote to Group Admin"
                            }
                          >
                            {actionLoading === `role-${m.id}` ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Shield className="h-3.5 w-3.5" />
                            )}
                          </button>

                          {/* Remove Member */}
                          <button
                            type="button"
                            onClick={() => handleRemoveMember(m.id, m.displayName)}
                            disabled={actionLoading === `remove-${m.id}`}
                            className="p-1 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 text-xs cursor-pointer transition-colors"
                            title="Remove from group"
                          >
                            {actionLoading === `remove-${m.id}` ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <UserMinus className="h-3.5 w-3.5" />
                            )}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        <DialogFooter className="flex sm:justify-between items-center gap-2 pt-2 border-t border-border/50">
          <Button
            type="button"
            variant="ghost"
            onClick={handleLeaveGroup}
            disabled={actionLoading === "leave"}
            className="text-xs text-destructive hover:text-destructive hover:bg-destructive/10 gap-1.5 h-8"
          >
            {actionLoading === "leave" ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <LogOut className="h-3.5 w-3.5" />
            )}
            Leave Group
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
