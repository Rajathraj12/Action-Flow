import React, { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { api, type MessageInfoResponse, type BackendMessage } from "../../lib/api";
import { Check, CheckCheck, Loader2, Info, Pencil, Clock } from "lucide-react";
import { cn } from "../../lib/utils";

interface MessageInfoModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conversationId: string;
  messageId: string | null;
  cachedMessage?: BackendMessage | null;
}

function formatFullTime(dateString?: string | null): string {
  if (!dateString) return "—";
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return "—";

    const isToday = new Date().toDateString() === date.toDateString();
    const timeStr = date.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });

    if (isToday) {
      return `Today at ${timeStr}`;
    }
    return `${date.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" })} at ${timeStr}`;
  } catch {
    return "—";
  }
}

export function MessageInfoModal({
  open,
  onOpenChange,
  conversationId,
  messageId,
  cachedMessage,
}: MessageInfoModalProps) {
  const [loading, setLoading] = useState(false);
  const [info, setInfo] = useState<MessageInfoResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open && messageId && conversationId) {
      setLoading(true);
      setError(null);
      api
        .getMessageInfo(conversationId, messageId)
        .then((res) => {
          setInfo(res.info);
        })
        .catch((err) => {
          console.error("[MessageInfoModal] Error loading info:", err);
          setError(err.message || "Failed to load message info");
        })
        .finally(() => {
          setLoading(false);
        });
    } else {
      setInfo(null);
    }
  }, [open, conversationId, messageId]);

  const displayMessageText = info?.text || cachedMessage?.text || "";
  const displayStatus = info?.status || cachedMessage?.status || "sent";
  const isEdited = info?.isEdited ?? cachedMessage?.isEdited ?? false;
  const isDeleted = info?.isDeletedForEveryone ?? cachedMessage?.isDeletedForEveryone ?? false;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md p-0 overflow-hidden bg-card border-border">
        {/* Header */}
        <DialogHeader className="px-5 pt-5 pb-3 border-b border-border bg-muted/40">
          <DialogTitle className="flex items-center gap-2 text-base font-display font-semibold">
            <Info className="h-4.5 w-4.5 text-primary" />
            Message Info
          </DialogTitle>
        </DialogHeader>

        <div className="p-5 flex flex-col gap-5">
          {/* Message Preview Bubble */}
          <div className="rounded-xl border border-border bg-background p-4 shadow-xs">
            <div className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase mb-2">
              Message Preview
            </div>
            <div
              className={cn(
                "rounded-2xl px-4 py-2.5 text-sm leading-relaxed max-w-[90%]",
                cachedMessage?.from === "them"
                  ? "bg-bubble-in text-bubble-in-foreground"
                  : "bg-bubble-out text-bubble-out-foreground"
              )}
            >
              {isDeleted ? (
                <p className="italic text-muted-foreground text-xs">🚫 This message was deleted</p>
              ) : (
                <p className="whitespace-pre-wrap break-words">{displayMessageText}</p>
              )}
              <div className="mt-1 flex items-center justify-end gap-1.5 text-[10px] text-muted-foreground">
                {isEdited && <span>edited •</span>}
                <span>{cachedMessage?.time || (info?.sentAt ? formatFullTime(info.sentAt) : "")}</span>
                {displayStatus === "read" ? (
                  <CheckCheck className="h-3.5 w-3.5 text-primary" />
                ) : displayStatus === "delivered" ? (
                  <CheckCheck className="h-3.5 w-3.5 text-muted-foreground" />
                ) : (
                  <Check className="h-3.5 w-3.5 text-muted-foreground" />
                )}
              </div>
            </div>
          </div>

          {loading ? (
            <div className="flex h-36 items-center justify-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-4.5 w-4.5 animate-spin text-primary" />
              Loading delivery & read status...
            </div>
          ) : error ? (
            <div className="rounded-lg bg-destructive/10 p-3 text-xs text-destructive border border-destructive/20">
              {error}
            </div>
          ) : info ? (
            <div className="flex flex-col divide-y divide-border rounded-xl border border-border bg-background overflow-hidden">
              {/* READ SECTION */}
              <div className="flex items-start gap-3.5 p-3.5 transition-colors hover:bg-muted/30">
                <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary/10">
                  <CheckCheck className="h-5 w-5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-foreground">Read</span>
                    <span className="text-[11px] font-medium text-muted-foreground">
                      {info.readAt ? (
                        <span className="text-primary font-semibold">Read</span>
                      ) : (
                        <span className="text-muted-foreground">Unread</span>
                      )}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {info.readAt ? formatFullTime(info.readAt) : "Not read yet"}
                  </p>
                  {info.recipient && (
                    <p className="text-[11px] text-muted-foreground/80 mt-1">
                      Recipient: <strong className="text-foreground">{info.recipient.displayName}</strong> ({info.recipient.email})
                    </p>
                  )}
                </div>
              </div>

              {/* DELIVERED SECTION */}
              <div className="flex items-start gap-3.5 p-3.5 transition-colors hover:bg-muted/30">
                <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-muted">
                  <CheckCheck className="h-5 w-5 text-muted-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-foreground">Delivered</span>
                    <span className="text-[11px] font-medium text-muted-foreground">
                      {info.deliveredAt ? "Delivered" : "Pending"}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {info.deliveredAt ? formatFullTime(info.deliveredAt) : "Pending delivery to recipient's device"}
                  </p>
                </div>
              </div>

              {/* SENT SECTION */}
              <div className="flex items-start gap-3.5 p-3.5 transition-colors hover:bg-muted/30">
                <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-muted">
                  <Check className="h-5 w-5 text-muted-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-foreground">Sent</span>
                    <span className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                      Saved to Cloud
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {formatFullTime(info.sentAt)}
                  </p>
                </div>
              </div>

              {/* EDITED SECTION (IF APPLICABLE) */}
              {info.isEdited && (
                <div className="flex items-start gap-3.5 p-3.5 transition-colors hover:bg-muted/30">
                  <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-amber-500/10">
                    <Pencil className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-foreground">Edited</span>
                      <span className="text-[11px] font-medium text-amber-600 dark:text-amber-400">
                        Modified
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {formatFullTime(info.editedAt)}
                    </p>
                  </div>
                </div>
              )}
            </div>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
