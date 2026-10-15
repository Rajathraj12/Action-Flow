import React, { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "../ui/dialog";
import { Input } from "../ui/input";
import { Button } from "../ui/button";
import { api, type BackendUser } from "../../lib/api";
import { Search, UserCheck, UserPlus, Loader2 } from "lucide-react";
import { cn } from "../../lib/utils";

interface NewConversationModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConversationCreated: (conversationId: string) => void;
}

export function NewConversationModal({
  open,
  onOpenChange,
  onConversationCreated,
}: NewConversationModalProps) {
  const [users, setUsers] = useState<BackendUser[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [startingWith, setStartingWith] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setLoading(true);
      setError(null);
      api
        .getUsers()
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
  }, [open]);

  const filteredUsers = users.filter(
    (u) =>
      u.displayName.toLowerCase().includes(search.toLowerCase()) ||
      u.email.toLowerCase().includes(search.toLowerCase())
  );

  const handleStartChat = async (userId: string) => {
    setStartingWith(userId);
    setError(null);
    try {
      const res = await api.createConversation(userId);
      onConversationCreated(res.conversation.id);
      onOpenChange(false);
    } catch (err: any) {
      setError(err.message || "Failed to start conversation");
    } finally {
      setStartingWith(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg font-bold">
            <UserPlus className="h-5 w-5 text-primary" />
            Start New Conversation
          </DialogTitle>
        </DialogHeader>

        <div className="py-2 space-y-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search people by name or email..."
              className="pl-9 text-sm"
              autoFocus
            />
          </div>

          {error && (
            <p className="text-xs text-destructive font-medium bg-destructive/10 p-2 rounded">
              {error}
            </p>
          )}

          <div className="max-h-72 overflow-y-auto space-y-1 divide-y divide-border/40">
            {loading ? (
              <div className="flex h-32 items-center justify-center text-sm text-muted-foreground gap-2">
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
                Loading teammates...
              </div>
            ) : filteredUsers.length === 0 ? (
              <div className="py-8 text-center text-xs text-muted-foreground">
                {search ? "No teammates match your search." : "No other teammates registered yet. Open another tab to register User B!"}
              </div>
            ) : (
              filteredUsers.map((u) => (
                <button
                  key={u._id}
                  type="button"
                  onClick={() => handleStartChat(u._id)}
                  disabled={startingWith === u._id}
                  className="flex w-full items-center justify-between p-2.5 rounded-lg hover:bg-muted/70 transition-colors text-left"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="relative">
                      <div className="grid h-10 w-10 place-items-center rounded-full bg-primary/12 font-display text-sm font-semibold text-primary">
                        {u.initials || "U"}
                      </div>
                      {u.online && (
                        <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-card bg-emerald-500" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold truncate text-foreground">
                        {u.displayName}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">
                        {u.email}
                      </p>
                    </div>
                  </div>

                  <Button
                    size="sm"
                    variant="outline"
                    className="shrink-0 h-8 px-3 text-xs"
                    disabled={startingWith === u._id}
                  >
                    {startingWith === u._id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      "Chat"
                    )}
                  </Button>
                </button>
              ))
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
