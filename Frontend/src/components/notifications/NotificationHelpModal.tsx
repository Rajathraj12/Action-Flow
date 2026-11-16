"use client";

import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Bell,
  Volume2,
  SlidersHorizontal,
  Moon,
  Laptop,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  ExternalLink,
} from "lucide-react";
import {
  playNotificationChime,
  sendTestNotification,
  requestNotificationPermission,
  getNotificationPermissionStatus,
  isDesktopApp,
} from "@/lib/notifications";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface NotificationHelpModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function NotificationHelpModal({ open, onOpenChange }: NotificationHelpModalProps) {
  const [currentPermission, setCurrentPermission] = useState<NotificationPermission | "unsupported">("default");

  useEffect(() => {
    if (open) {
      setCurrentPermission(getNotificationPermissionStatus());
    }
  }, [open]);

  const handleRequest = async () => {
    const perm = await requestNotificationPermission();
    if (perm) {
      setCurrentPermission(perm);
      if (perm === "granted") {
        toast.success("Permission Granted! Windows alerts are active.");
      } else if (perm === "denied") {
        toast.error("Still blocked. Follow Step 1 below to allow in URL bar.");
      }
    }
  };

  const handleTestChime = () => {
    playNotificationChime();
    toast.info("Playing notification audio chime 🔔");
  };

  const handleTestDesktop = () => {
    sendTestNotification();
    toast.success("Test notification dispatched to Windows Action Center!");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto custom-scrollbar p-6">
        <DialogHeader>
          <div className="flex items-center gap-2.5">
            <div className="grid h-9 w-9 place-items-center rounded-xl bg-primary/10 text-primary">
              <Bell className="h-5 w-5" />
            </div>
            <div>
              <DialogTitle className="text-lg font-bold">
                Enable Windows Desktop Notifications
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                Troubleshooting guide to receive WhatsApp-style alerts on Windows
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* Live Status Pill */}
        <div className="rounded-xl border border-border/80 bg-muted/30 p-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div
              className={cn(
                "h-2.5 w-2.5 rounded-full animate-pulse",
                isDesktopApp() || currentPermission === "granted"
                  ? "bg-emerald-500"
                  : currentPermission === "denied"
                  ? "bg-rose-500"
                  : "bg-amber-500"
              )}
            />
            <div>
              <span className="text-xs font-semibold">
                {isDesktopApp() ? "App Mode: " : "Browser Status: "}
              </span>
              <span
                className={cn(
                  "text-xs font-bold uppercase tracking-wider",
                  isDesktopApp() || currentPermission === "granted"
                    ? "text-emerald-500"
                    : currentPermission === "denied"
                    ? "text-rose-500"
                    : "text-amber-500"
                )}
              >
                {isDesktopApp()
                  ? "Windows Desktop App (Native Alerts Active)"
                  : currentPermission === "granted"
                  ? "Allowed (Granted)"
                  : currentPermission === "denied"
                  ? "Blocked (Denied)"
                  : "Not Prompted Yet"}
              </span>
            </div>
          </div>

          {!isDesktopApp() && currentPermission !== "granted" && (
            <button
              type="button"
              onClick={handleRequest}
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition-all cursor-pointer shadow-2xs"
            >
              <Bell className="h-3 w-3" />
              <span>Prompt Permission</span>
            </button>
          )}
        </div>

        {/* 3 Crucial Steps for Windows */}
        <div className="space-y-3.5 text-xs text-muted-foreground">
          {/* Step 1: Browser address bar */}
          <div className="rounded-xl border border-border/70 bg-card p-3.5 space-y-2">
            <div className="flex items-center gap-2 font-bold text-foreground">
              <SlidersHorizontal className="h-4 w-4 text-primary" />
              <span>Step 1: Allow Notifications in Browser Address Bar</span>
            </div>
            <p className="leading-relaxed">
              If the browser blocked notifications, click the <strong>Tune / Padlock icon</strong> (left of <code className="bg-muted px-1.5 py-0.5 rounded text-foreground font-mono">localhost:8080</code> in your browser address bar) &rarr; toggle <strong>Notifications</strong> to <strong className="text-emerald-600 dark:text-emerald-400">Allow</strong>.
            </p>
            {currentPermission === "denied" && (
              <div className="flex items-center gap-2 p-2 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 font-medium">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                <span>Your browser has set Notifications to &quot;Block&quot; for this site. You must toggle it in the address bar lock icon.</span>
              </div>
            )}
          </div>

          {/* Step 2: Windows Focus Assist / Do Not Disturb */}
          <div className="rounded-xl border border-border/70 bg-card p-3.5 space-y-2">
            <div className="flex items-center gap-2 font-bold text-foreground">
              <Moon className="h-4 w-4 text-indigo-500" />
              <span>Step 2: Turn OFF Windows &quot;Do Not Disturb&quot; (Focus Assist)</span>
            </div>
            <p className="leading-relaxed">
              In Windows 10 & 11, if <strong>Do Not Disturb / Focus Assist</strong> is turned on, Windows silences all banner popups and sends them directly to the Action Center tray without popping up on screen.
            </p>
            <p className="text-[11px] bg-muted/60 p-2 rounded-lg text-foreground/80">
              👉 Press <kbd className="px-1.5 py-0.5 rounded bg-card border border-border font-mono text-[10px]">Win</kbd> + <kbd className="px-1.5 py-0.5 rounded bg-card border border-border font-mono text-[10px]">N</kbd> (or click clock/date in bottom right) and verify the <strong>bell / moon icon</strong> is turned OFF.
            </p>
          </div>

          {/* Step 3: Windows System Notification Setting */}
          <div className="rounded-xl border border-border/70 bg-card p-3.5 space-y-2">
            <div className="flex items-center gap-2 font-bold text-foreground">
              <Laptop className="h-4 w-4 text-sky-500" />
              <span>Step 3: Check Windows System Notifications</span>
            </div>
            <p className="leading-relaxed">
              Open Windows <strong>Settings</strong> (<kbd className="px-1.5 py-0.5 rounded bg-card border border-border font-mono text-[10px]">Win</kbd> + <kbd className="px-1.5 py-0.5 rounded bg-card border border-border font-mono text-[10px]">I</kbd>) &rarr; <strong>System</strong> &rarr; <strong>Notifications</strong>. Ensure <strong>Notifications</strong> is toggled <strong>ON</strong>, and verify <strong>Google Chrome</strong> (or Microsoft Edge) is permitted to show notification banners.
            </p>
          </div>
        </div>

        {/* Action Testing Bar */}
        <div className="flex flex-wrap items-center justify-between gap-2.5 pt-2 border-t border-border/80">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleTestChime}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-border/80 bg-muted/40 text-xs font-semibold hover:bg-muted transition-all cursor-pointer"
            >
              <Volume2 className="h-3.5 w-3.5 text-primary" />
              <span>Test Audio Chime</span>
            </button>

            <button
              type="button"
              onClick={handleTestDesktop}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-border/80 bg-muted/40 text-xs font-semibold hover:bg-muted transition-all cursor-pointer"
            >
              <Bell className="h-3.5 w-3.5 text-primary" />
              <span>Send Windows Toast</span>
            </button>
          </div>

          <button
            type="button"
            onClick={() => window.location.reload()}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-primary text-primary-foreground text-xs font-bold hover:bg-primary/90 transition-all cursor-pointer shadow-xs"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            <span>Reload Site</span>
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
