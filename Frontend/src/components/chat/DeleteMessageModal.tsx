import React, { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "../ui/dialog";
import { Button } from "../ui/button";
import { Trash2, AlertTriangle, Loader2 } from "lucide-react";
import { type BackendMessage } from "../../lib/api";

interface DeleteMessageModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  message: BackendMessage | null;
  onConfirmDelete: (deleteType: "everyone" | "me") => Promise<void>;
}

export function DeleteMessageModal({
  open,
  onOpenChange,
  message,
  onConfirmDelete,
}: DeleteMessageModalProps) {
  const [deleting, setDeleting] = useState<"everyone" | "me" | null>(null);

  if (!message) return null;

  const isSender = message.from === "me";
  const canDeleteForEveryone = isSender && !message.isDeletedForEveryone;

  const handleDelete = async (type: "everyone" | "me") => {
    setDeleting(type);
    try {
      await onConfirmDelete(type);
      onOpenChange(false);
    } catch (err) {
      console.error("[DeleteMessageModal] Failed to delete message:", err);
    } finally {
      setDeleting(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md bg-card/95 border-border/80 shadow-2xl backdrop-blur-xl">
        <DialogHeader className="gap-3">
          <div className="relative mx-auto sm:mx-0">
            <div className="absolute -inset-1 rounded-full bg-destructive/20 blur-sm animate-pulse-soft" />
            <div className="relative grid h-12 w-12 place-items-center rounded-full bg-destructive/15 text-destructive border border-destructive/25 shadow-xs">
              <Trash2 className="h-6 w-6" />
            </div>
          </div>
          <div>
            <DialogTitle className="text-base font-display font-bold">
              Delete message?
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground mt-1">
              {canDeleteForEveryone
                ? "You can delete this message for everyone in this chat or only for yourself."
                : "This message will be deleted from your view. Other participants will still be able to see it."}
            </DialogDescription>
          </div>
        </DialogHeader>

        {/* Message preview snippet */}
        <div className="my-2 rounded-xl border-l-4 border-l-destructive/60 border border-border bg-muted/30 p-3 text-xs italic text-muted-foreground line-clamp-3">
          "{message.text}"
        </div>

        <div className="flex flex-col gap-2 pt-2 sm:flex-row-reverse sm:justify-start">
          {canDeleteForEveryone && (
            <Button
              type="button"
              variant="destructive"
              disabled={deleting !== null}
              onClick={() => handleDelete("everyone")}
              className="w-full sm:w-auto text-xs font-semibold cursor-pointer shadow-sm hover:shadow transition-all active:scale-95"
            >
              {deleting === "everyone" ? (
                <>
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  Deleting...
                </>
              ) : (
                "Delete for everyone"
              )}
            </Button>
          )}

          <Button
            type="button"
            variant="outline"
            disabled={deleting !== null}
            onClick={() => handleDelete("me")}
            className="w-full sm:w-auto text-xs font-semibold cursor-pointer hover:bg-muted/80 transition-all active:scale-95"
          >
            {deleting === "me" ? (
              <>
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                Deleting...
              </>
            ) : (
              "Delete for me"
            )}
          </Button>

          <Button
            type="button"
            variant="ghost"
            disabled={deleting !== null}
            onClick={() => onOpenChange(false)}
            className="w-full sm:w-auto text-xs cursor-pointer text-muted-foreground hover:text-foreground transition-colors"
          >
            Cancel
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
