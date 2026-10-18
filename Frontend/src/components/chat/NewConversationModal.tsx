import React, { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "../ui/dialog";
import { Input } from "../ui/input";
import { Button } from "../ui/button";
import { api, type BackendUser } from "../../lib/api";
import { Search, UserPlus, Users, Loader2, Check, X, ShieldAlert } from "lucide-react";
import { cn } from "../../lib/utils";

interface NewConversationModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConversationCreated: (conversationId: string) => void;
  workspaceId?: string;
}

export function NewConversationModal({
  open,
  onOpenChange,
  onConversationCreated,
  workspaceId,
}: NewConversationModalProps) {
  const [activeTab, setActiveTab] = useState<"direct" | "group">("direct");
  const [users, setUsers] = useState<BackendUser[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [startingWith, setStartingWith] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Group form state
  const [groupName, setGroupName] = useState("");
  const [groupDescription, setGroupDescription] = useState("");
  const [selectedParticipants, setSelectedParticipants] = useState<BackendUser[]>([]);
  const [creatingGroup, setCreatingGroup] = useState(false);

  useEffect(() => {
    if (open) {
      setLoading(true);
      setError(null);
      setGroupName("");
      setGroupDescription("");
      setSelectedParticipants([]);
      setSearch("");

      const fetchPromise = workspaceId
        ? api.searchWorkspaceColleagues(workspaceId, search)
        : api.getUsers();

      fetchPromise
        .then((res) => {
          setUsers(res.users);
        })
        .catch((err) => {
          setError(err.message || "Failed to load directory");
        })
        .finally(() => {
          setLoading(false);
        });
    }
  }, [open, workspaceId]);

  const filteredUsers = users.filter(
    (u) =>
      u.displayName.toLowerCase().includes(search.toLowerCase()) ||
      u.email.toLowerCase().includes(search.toLowerCase())
  );

  const handleStartDirectChat = async (userId: string) => {
    setStartingWith(userId);
    setError(null);
    try {
      const res = workspaceId
        ? await api.createDirectConversation(workspaceId, userId)
        : await api.createConversation(userId);

      onConversationCreated(res.conversation.id);
      onOpenChange(false);
    } catch (err: any) {
      setError(err.message || "Failed to start direct conversation");
    } finally {
      setStartingWith(null);
    }
  };

  const handleToggleSelectParticipant = (user: BackendUser) => {
    if (selectedParticipants.some((p) => p._id === user._id)) {
      setSelectedParticipants((prev) => prev.filter((p) => p._id !== user._id));
    } else {
      setSelectedParticipants((prev) => [...prev, user]);
    }
  };

  const handleCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!workspaceId) {
      setError("Active workspace is required to create a group chat.");
      return;
    }
    const trimmedName = groupName.trim();
    if (!trimmedName) {
      setError("Please provide a group name.");
      return;
    }
    if (trimmedName.length > 80) {
      setError("Group name cannot exceed 80 characters.");
      return;
    }
    if (selectedParticipants.length === 0) {
      setError("Please select at least one colleague to invite into the group.");
      return;
    }

    setCreatingGroup(true);
    setError(null);
    try {
      const participantIds = selectedParticipants.map((p) => p._id);
      const res = await api.createGroupConversation(
        workspaceId,
        trimmedName,
        groupDescription.trim() || undefined,
        participantIds
      );
      onConversationCreated(res.conversation.id);
      onOpenChange(false);
    } catch (err: any) {
      setError(err.message || "Failed to create group conversation.");
    } finally {
      setCreatingGroup(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg bg-card/95 border-border/80 shadow-2xl backdrop-blur-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2.5 text-lg font-bold font-display">
            <div className="grid h-8 w-8 place-items-center rounded-lg bg-primary/15 text-primary shadow-xs">
              {activeTab === "direct" ? (
                <UserPlus className="h-4.5 w-4.5" />
              ) : (
                <Users className="h-4.5 w-4.5" />
              )}
            </div>
            <span>New Conversation</span>
          </DialogTitle>

          {/* Mode Switcher Tabs */}
          <div className="flex items-center rounded-xl bg-muted/60 p-1 mt-2 border border-border/50">
            <button
              type="button"
              onClick={() => {
                setActiveTab("direct");
                setError(null);
              }}
              className={cn(
                "flex-1 flex items-center justify-center gap-2 py-1.5 px-3 rounded-lg text-xs font-semibold transition-all cursor-pointer",
                activeTab === "direct"
                  ? "bg-card text-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <UserPlus className="h-3.5 w-3.5" />
              Direct Message
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveTab("group");
                setError(null);
              }}
              className={cn(
                "flex-1 flex items-center justify-center gap-2 py-1.5 px-3 rounded-lg text-xs font-semibold transition-all cursor-pointer",
                activeTab === "group"
                  ? "bg-card text-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Users className="h-3.5 w-3.5" />
              New Group Chat
            </button>
          </div>
        </DialogHeader>

        {error && (
          <div className="text-xs text-destructive font-medium bg-destructive/10 border border-destructive/20 p-2.5 rounded-lg flex items-center gap-2 animate-in fade-in">
            <ShieldAlert className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {activeTab === "direct" ? (
          /* ================= DIRECT MESSAGE TAB ================= */
          <div className="py-2 space-y-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/70" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search colleagues in this workspace..."
                className="pl-9 pr-8 text-sm bg-muted/30 border-border/70 focus-visible:ring-primary/40 focus-visible:border-primary/50 transition-all rounded-xl"
                autoFocus
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground/60 hover:text-foreground text-xs p-1 rounded-full cursor-pointer"
                >
                  ✕
                </button>
              )}
            </div>

            <div className="max-h-72 overflow-y-auto space-y-1.5 custom-scrollbar pr-1">
              {loading ? (
                <div className="space-y-2 py-2">
                  {[1, 2, 3].map((i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between p-2.5 rounded-xl border border-border/40 bg-muted/20"
                    >
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-full shimmer-effect" />
                        <div className="space-y-1.5">
                          <div className="h-3.5 w-24 rounded-md shimmer-effect" />
                          <div className="h-2.5 w-36 rounded-md shimmer-effect" />
                        </div>
                      </div>
                      <div className="h-8 w-14 rounded-lg shimmer-effect" />
                    </div>
                  ))}
                </div>
              ) : filteredUsers.length === 0 ? (
                <div className="py-10 text-center text-xs text-muted-foreground flex flex-col items-center justify-center gap-2">
                  <Search className="h-8 w-8 text-muted-foreground/30 mb-1" />
                  <p className="font-medium text-foreground">
                    {search ? "No colleagues match your search." : "No other colleagues in this workspace yet."}
                  </p>
                  <p className="text-[11px] text-muted-foreground/70 max-w-xs">
                    {search
                      ? "Try searching by their name or email address."
                      : "Invite colleagues under Settings → Team & Roles!"}
                  </p>
                </div>
              ) : (
                filteredUsers.map((u) => (
                  <button
                    key={u._id}
                    type="button"
                    onClick={() => handleStartDirectChat(u._id)}
                    disabled={startingWith === u._id}
                    className="group flex w-full items-center justify-between p-2.5 rounded-xl border border-transparent hover:border-border/60 hover:bg-muted/50 transition-all duration-200 text-left hover:scale-[1.01] active:scale-[0.99] cursor-pointer"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="relative">
                        <div className="grid h-10 w-10 place-items-center rounded-full bg-gradient-to-br from-primary/20 to-primary/5 font-display text-sm font-bold text-primary ring-1 ring-primary/20 group-hover:ring-primary/40 transition-all">
                          {u.initials || "U"}
                        </div>
                        {u.online ? (
                          <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-card bg-emerald-500 shadow-xs" />
                        ) : (
                          <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-card bg-muted-foreground/40" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold truncate text-foreground group-hover:text-primary transition-colors">
                          {u.displayName}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                      </div>
                    </div>

                    <span
                      className={cn(
                        "inline-flex items-center justify-center shrink-0 h-8 px-3 text-xs font-semibold rounded-lg border border-border bg-background shadow-2xs group-hover:bg-primary group-hover:text-primary-foreground group-hover:border-primary transition-all",
                        startingWith === u._id && "opacity-60 cursor-not-allowed"
                      )}
                    >
                      {startingWith === u._id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        "Chat"
                      )}
                    </span>
                  </button>
                ))
              )}
            </div>
          </div>
        ) : (
          /* ================= GROUP CHAT TAB ================= */
          <form onSubmit={handleCreateGroup} className="py-2 space-y-3.5">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground flex items-center justify-between">
                <span>Group Name <span className="text-destructive">*</span></span>
                <span className="text-[10px] text-muted-foreground font-mono">
                  {groupName.length}/80
                </span>
              </label>
              <Input
                value={groupName}
                onChange={(e) => setGroupName(e.target.value.slice(0, 80))}
                placeholder="e.g. Product Development, Launch Marketing"
                className="text-sm bg-muted/30 border-border/70 rounded-xl"
                autoFocus
                required
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground flex items-center justify-between">
                <span>Description (Optional)</span>
                <span className="text-[10px] text-muted-foreground font-mono">
                  {groupDescription.length}/300
                </span>
              </label>
              <Input
                value={groupDescription}
                onChange={(e) => setGroupDescription(e.target.value.slice(0, 300))}
                placeholder="Brief purpose of this group conversation..."
                className="text-sm bg-muted/30 border-border/70 rounded-xl"
              />
            </div>

            {/* Selected Participants Chips */}
            {selectedParticipants.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs font-semibold text-foreground">
                  Selected Members ({selectedParticipants.length}):
                </p>
                <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto p-1.5 rounded-xl bg-muted/40 border border-border/50">
                  {selectedParticipants.map((p) => (
                    <span
                      key={p._id}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-primary/15 text-primary border border-primary/25 shadow-2xs animate-in zoom-in-95"
                    >
                      <span className="truncate max-w-[120px]">{p.displayName}</span>
                      <button
                        type="button"
                        onClick={() => handleToggleSelectParticipant(p)}
                        className="hover:text-destructive text-primary/70 cursor-pointer rounded-full p-0.5"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Colleague Search & Multi-Select List */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-foreground flex items-center justify-between">
                <span>Add Workspace Members <span className="text-destructive">*</span></span>
                <span className="text-[11px] text-muted-foreground">Select at least 1</span>
              </label>

              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/70" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search colleagues to add..."
                  className="pl-9 text-xs bg-muted/30 border-border/70 rounded-xl h-9"
                />
              </div>

              <div className="max-h-48 overflow-y-auto space-y-1 custom-scrollbar pr-1">
                {loading ? (
                  <div className="py-4 text-center text-xs text-muted-foreground flex items-center justify-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin text-primary" />
                    <span>Loading members...</span>
                  </div>
                ) : filteredUsers.length === 0 ? (
                  <p className="text-center text-xs text-muted-foreground py-4">
                    {search ? "No colleagues match your search." : "No other colleagues available."}
                  </p>
                ) : (
                  filteredUsers.map((u) => {
                    const isSelected = selectedParticipants.some((p) => p._id === u._id);
                    return (
                      <button
                        key={u._id}
                        type="button"
                        onClick={() => handleToggleSelectParticipant(u)}
                        className={cn(
                          "w-full flex items-center justify-between p-2 rounded-xl border text-left transition-all cursor-pointer",
                          isSelected
                            ? "border-primary/40 bg-primary/10"
                            : "border-transparent hover:bg-muted/40"
                        )}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="grid h-8 w-8 place-items-center rounded-full bg-primary/15 font-display text-xs font-bold text-primary shrink-0">
                            {u.initials || "U"}
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs font-semibold truncate text-foreground">
                              {u.displayName}
                            </p>
                            <p className="text-[11px] text-muted-foreground truncate">{u.email}</p>
                          </div>
                        </div>

                        <div
                          className={cn(
                            "h-5 w-5 rounded-md border flex items-center justify-center transition-all",
                            isSelected
                              ? "bg-primary border-primary text-primary-foreground"
                              : "border-muted-foreground/40 bg-background"
                          )}
                        >
                          {isSelected && <Check className="h-3.5 w-3.5" />}
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </div>

            <DialogFooter className="pt-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => onOpenChange(false)}
                disabled={creatingGroup}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={creatingGroup || !groupName.trim() || selectedParticipants.length === 0}
                className="gap-2 shadow-sm cursor-pointer"
              >
                {creatingGroup ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Creating Group...
                  </>
                ) : (
                  <>
                    <Users className="h-4 w-4" />
                    Create Group Chat
                  </>
                )}
              </Button>
            </DialogFooter>
          </form>
        )}

        {activeTab === "direct" && (
          <DialogFooter>
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
