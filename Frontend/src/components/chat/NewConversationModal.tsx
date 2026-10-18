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
      <DialogContent className="sm:max-w-md bg-card/95 border-border/80 shadow-2xl backdrop-blur-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2.5 text-lg font-bold font-display">
            <div className="grid h-8 w-8 place-items-center rounded-lg bg-primary/15 text-primary shadow-xs">
              <UserPlus className="h-4.5 w-4.5" />
            </div>
            Start New Conversation
          </DialogTitle>
        </DialogHeader>

        <div className="py-2 space-y-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/70" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search people by name or email..."
              className="pl-9 pr-8 text-sm bg-muted/30 border-border/70 focus-visible:ring-primary/40 focus-visible:border-primary/50 transition-all rounded-xl"
              autoFocus
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground/60 hover:text-foreground text-xs p-1 rounded-full"
              >
                ✕
              </button>
            )}
          </div>

          {error && (
            <p className="text-xs text-destructive font-medium bg-destructive/10 border border-destructive/20 p-2.5 rounded-lg animate-in fade-in">
              {error}
            </p>
          )}

          <div className="max-h-72 overflow-y-auto space-y-1.5 custom-scrollbar pr-1">
            {loading ? (
              <div className="space-y-2 py-2">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="flex items-center justify-between p-2.5 rounded-xl border border-border/40 bg-muted/20">
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
                  {search ? "No teammates match your search." : "No other teammates registered yet."}
                </p>
                <p className="text-[11px] text-muted-foreground/70 max-w-xs">
                  {search ? "Try searching by their first name or company email address." : "Open another browser window to register a second account!"}
                </p>
              </div>
            ) : (
              filteredUsers.map((u) => (
                <button
                  key={u._id}
                  type="button"
                  onClick={() => handleStartChat(u._id)}
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
                      <p className="text-xs text-muted-foreground truncate">
                        {u.email}
                      </p>
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

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
