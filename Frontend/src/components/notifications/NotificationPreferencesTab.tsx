import React, { useState, useEffect } from "react";
import { toast } from "sonner";
import {
  Bell,
  BellRing,
  BellOff,
  CheckCircle2,
  Clock,
  MessageSquare,
  Users,
  Shield,
  RefreshCw,
  Sparkles,
  Smartphone,
} from "lucide-react";
import { api, type NotificationPreferences } from "@/lib/api";
import { cn } from "@/lib/utils";
import { notifyDesktop } from "@/lib/notifications";

export function NotificationPreferencesTab() {
  const [prefs, setPrefs] = useState<NotificationPreferences>({
    taskAssigned: true,
    taskStatusChanged: true,
    taskCompleted: true,
    dueDateReminders: true,
    directMessages: true,
    groupMessages: true,
    emailNotifications: false,
    browserNotifications: false,
  });
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    api
      .getNotificationPreferences()
      .then((res) => {
        if (mounted && res.preferences) {
          const raw = res.preferences as any;
          setPrefs({
            ...raw,
            dueDateReminders: raw.dueDateReminders ?? raw.taskReminders ?? true,
          });
        }
      })
      .catch((err) => {
        console.error("[NotificationPreferences] Failed to load preferences:", err);
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, []);

  const masterKeys: (keyof NotificationPreferences)[] = [
    "taskAssigned",
    "taskStatusChanged",
    "taskCompleted",
    "dueDateReminders",
    "directMessages",
    "groupMessages",
    "browserNotifications",
  ];

  const activeCount = masterKeys.filter((k) => Boolean(prefs[k])).length;
  const totalCount = masterKeys.length;
  const isMasterOn = activeCount > 0;
  const isAllOn = activeCount === totalCount;

  const handleSetAll = async (targetState: boolean) => {
    const prevPrefs = { ...prefs };
    const nextPrefs: NotificationPreferences = {
      ...prefs,
      taskAssigned: targetState,
      taskStatusChanged: targetState,
      taskCompleted: targetState,
      dueDateReminders: targetState,
      directMessages: targetState,
      groupMessages: targetState,
      browserNotifications: targetState,
    };

    setPrefs(nextPrefs);
    setSavingKey("master");

    try {
      if (
        targetState &&
        typeof window !== "undefined" &&
        "Notification" in window &&
        Notification.permission === "default"
      ) {
        Notification.requestPermission().catch(() => {});
      }

      const res = await api.updateNotificationPreferences({
        taskAssigned: targetState,
        taskStatusChanged: targetState,
        taskCompleted: targetState,
        dueDateReminders: targetState,
        directMessages: targetState,
        groupMessages: targetState,
        browserNotifications: targetState,
      });

      if (res.preferences) {
        const raw = res.preferences as any;
        setPrefs({
          ...raw,
          dueDateReminders: raw.dueDateReminders ?? raw.taskReminders ?? targetState,
        });
      }
      toast.success(
        targetState
          ? "All notifications turned ON"
          : "All notifications turned OFF (Muted)"
      );
    } catch (err: any) {
      setPrefs(prevPrefs);
      toast.error(err.message || "Failed to update notification settings");
    } finally {
      setSavingKey(null);
    }
  };

  const handleToggle = async (key: keyof NotificationPreferences) => {
    const nextValue = !prefs[key];
    const prevValue = prefs[key];

    // Optimistic UI update
    setPrefs((prev) => ({ ...prev, [key]: nextValue }));
    setSavingKey(key);

    try {
      const res = await api.updateNotificationPreferences({ [key]: nextValue });
      if (res.preferences) {
        const raw = res.preferences as any;
        setPrefs((current) => ({
          ...raw,
          dueDateReminders: raw.dueDateReminders ?? raw.taskReminders ?? (key === "dueDateReminders" ? nextValue : current.dueDateReminders),
        }));
      }
      toast.success("Preferences updated");
    } catch (err: any) {
      // Revert on error
      setPrefs((prev) => ({ ...prev, [key]: prevValue }));
      toast.error(err.message || "Failed to save preference");
    } finally {
      setSavingKey(null);
    }
  };

  const handleRequestBrowserPermission = async () => {
    if (!("Notification" in window)) {
      toast.error("Your browser does not support desktop notifications.");
      return;
    }

    try {
      const permission = await Notification.requestPermission();
      if (permission === "granted") {
        handleToggle("browserNotifications");
        toast.success("Browser notifications enabled!");
      } else {
        toast.error("Browser notification permission denied.");
      }
    } catch (err: any) {
      toast.error(err.message || "Could not request browser permission");
    }
  };

  if (loading) {
    return (
      <div className="py-20 flex flex-col items-center justify-center gap-2 text-muted-foreground text-xs">
        <RefreshCw className="h-6 w-6 animate-spin text-primary" />
        <span>Loading notification preferences...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-8">
      {/* Overview Card */}
      <div className="p-4 mx-6 mt-4 rounded-2xl bg-primary/10 border border-primary/20 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-start gap-3 min-w-0">
          <div className="grid h-9 w-9 place-items-center rounded-xl bg-primary/20 text-primary shrink-0">
            <Bell className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0">
            <h4 className="text-sm font-bold text-foreground">Notification Preferences</h4>
            <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
              Configure how and when you receive real-time notifications, task reminders, and direct message alerts in ActionFlow.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => {
            notifyDesktop({
              title: "ActionFlow Desktop Alert",
              body: "This is a test notification from ActionFlow! Notifications are functioning properly.",
            });
            toast.success("Dispatched test notification to your system!");
          }}
          className="shrink-0 px-3.5 py-2 text-xs font-semibold rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 transition shadow-sm flex items-center gap-1.5"
        >
          <Sparkles className="h-3.5 w-3.5" />
          <span>Test OS Notification</span>
        </button>
      </div>

      {/* Master Notifications Hero Card */}
      <div className="mx-6 p-4 sm:p-5 rounded-2xl bg-card border border-border/80 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5 min-w-0">
          <div
            className={cn(
              "grid h-12 w-12 place-items-center rounded-2xl shrink-0 transition-all duration-300",
              isMasterOn
                ? "bg-primary text-primary-foreground shadow-md shadow-primary/20"
                : "bg-muted text-muted-foreground"
            )}
          >
            {isMasterOn ? (
              <BellRing className="h-6 w-6 animate-pulse" />
            ) : (
              <BellOff className="h-6 w-6" />
            )}
          </div>
          <div className="flex flex-col gap-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm sm:text-base font-bold text-foreground">
                Master Notifications
              </span>
              <span
                className={cn(
                  "text-[10px] font-bold px-2.5 py-0.5 rounded-full uppercase tracking-wider inline-flex items-center gap-1.5",
                  isAllOn
                    ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/25"
                    : isMasterOn
                    ? "bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/25"
                    : "bg-muted text-muted-foreground border border-border"
                )}
              >
                <span
                  className={cn(
                    "h-1.5 w-1.5 rounded-full",
                    isAllOn
                      ? "bg-emerald-500 animate-ping"
                      : isMasterOn
                      ? "bg-amber-500"
                      : "bg-muted-foreground"
                  )}
                />
                {isAllOn
                  ? "All ON (7/7)"
                  : isMasterOn
                  ? `Partially ON (${activeCount}/${totalCount})`
                  : "All OFF (Muted)"}
              </span>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              {isMasterOn
                ? "Turn off to silence all task updates, direct chat messages, and Windows desktop popups."
                : "Turn on to enable all alerts across tasks, direct messages, and system notifications."}
            </p>
          </div>
        </div>

        {/* Master Action Buttons & Big Switch */}
        <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-end shrink-0 pt-2 sm:pt-0 border-t sm:border-0 border-border/60">
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={savingKey === "master"}
              onClick={() => handleSetAll(false)}
              className={cn(
                "px-3 py-1.5 text-xs font-semibold rounded-xl transition flex items-center gap-1.5 border cursor-pointer",
                !isMasterOn
                  ? "bg-destructive/15 text-destructive border-destructive/30 font-bold"
                  : "bg-muted/70 hover:bg-muted text-muted-foreground border-border/60 hover:text-foreground"
              )}
              title="Turn all notifications OFF"
            >
              <BellOff className="h-3.5 w-3.5" />
              <span>Turn OFF</span>
            </button>
            <button
              type="button"
              disabled={savingKey === "master"}
              onClick={() => handleSetAll(true)}
              className={cn(
                "px-3 py-1.5 text-xs font-semibold rounded-xl transition flex items-center gap-1.5 border cursor-pointer",
                isAllOn
                  ? "bg-primary text-primary-foreground border-primary shadow-xs font-bold"
                  : "bg-primary/10 hover:bg-primary/20 text-primary border-primary/20"
              )}
              title="Turn all notifications ON"
            >
              <BellRing className="h-3.5 w-3.5" />
              <span>Turn ON</span>
            </button>
          </div>

          <div className="h-6 w-px bg-border/60 hidden sm:block" />

          {/* Master Toggle Switch */}
          <div
            onClick={() => {
              if (savingKey !== "master") {
                handleSetAll(!isMasterOn);
              }
            }}
            className="flex items-center gap-2 cursor-pointer select-none"
            title={isMasterOn ? "Click to turn all OFF" : "Click to turn all ON"}
          >
            {savingKey === "master" && (
              <RefreshCw className="h-4 w-4 animate-spin text-primary" />
            )}
            <div
              className={cn(
                "relative inline-flex h-7 w-13 shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out cursor-pointer",
                isMasterOn ? "bg-primary" : "bg-muted"
              )}
            >
              <div
                className={cn(
                  "pointer-events-none inline-block h-6 w-6 transform rounded-full bg-background shadow-md transition duration-200 ease-in-out",
                  isMasterOn ? "translate-x-6" : "translate-x-0"
                )}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Tasks & Workflow Section */}
      <div>
        <h3 className="px-6 pb-2 text-xs font-bold text-muted-foreground uppercase tracking-wider">
          Tasks & Deadlines
        </h3>
        <div className="divide-y divide-border/60 border-y border-border/60 bg-card">
          <PreferenceRow
            icon={<CheckCircle2 className="h-5 w-5 text-emerald-500" />}
            title="Task Assignments"
            description="Receive an alert when a colleague assigns or reassigns a task to you"
            checked={prefs.taskAssigned}
            isSaving={savingKey === "taskAssigned"}
            onChange={() => handleToggle("taskAssigned")}
          />
          <PreferenceRow
            icon={<Clock className="h-5 w-5 text-sky-500" />}
            title="Task Status Updates"
            description="Notify when the status of tasks you are assigned to or tracking changes"
            checked={prefs.taskStatusChanged}
            isSaving={savingKey === "taskStatusChanged"}
            onChange={() => handleToggle("taskStatusChanged")}
          />
          <PreferenceRow
            icon={<Sparkles className="h-5 w-5 text-purple-500" />}
            title="Task Completion Alerts"
            description="Notify when a task you created is completed by another user"
            checked={prefs.taskCompleted}
            isSaving={savingKey === "taskCompleted"}
            onChange={() => handleToggle("taskCompleted")}
          />
          <PreferenceRow
            icon={<Clock className="h-5 w-5 text-amber-500" />}
            title="Due-Date Reminders"
            description="Automatic reminders 24 hours before a deadline and when a task becomes overdue"
            checked={prefs.dueDateReminders}
            isSaving={savingKey === "dueDateReminders"}
            onChange={() => handleToggle("dueDateReminders")}
          />
        </div>
      </div>

      {/* Messaging Section */}
      <div>
        <h3 className="px-6 pb-2 text-xs font-bold text-muted-foreground uppercase tracking-wider">
          Direct & Group Messages
        </h3>
        <div className="divide-y divide-border/60 border-y border-border/60 bg-card">
          <PreferenceRow
            icon={<MessageSquare className="h-5 w-5 text-blue-500" />}
            title="Direct Messages"
            description="Notify when colleagues send you one-to-one messages"
            checked={prefs.directMessages}
            isSaving={savingKey === "directMessages"}
            onChange={() => handleToggle("directMessages")}
          />
          <PreferenceRow
            icon={<Users className="h-5 w-5 text-indigo-500" />}
            title="Group Conversations"
            description="Notify for incoming messages in team and project group chats"
            checked={prefs.groupMessages}
            isSaving={savingKey === "groupMessages"}
            onChange={() => handleToggle("groupMessages")}
          />
        </div>
      </div>

      {/* Delivery Channels */}
      <div>
        <h3 className="px-6 pb-2 text-xs font-bold text-muted-foreground uppercase tracking-wider">
          Delivery Channels
        </h3>
        <div className="divide-y divide-border/60 border-y border-border/60 bg-card">
          <PreferenceRow
            icon={<Smartphone className="h-5 w-5 text-teal-500" />}
            title="Browser Desktop Notifications"
            description="Show native desktop alerts when ActionFlow is minimized or in background"
            checked={prefs.browserNotifications}
            isSaving={savingKey === "browserNotifications"}
            onChange={() => {
              if (!prefs.browserNotifications && typeof window !== "undefined" && "Notification" in window && Notification.permission !== "granted") {
                handleRequestBrowserPermission();
              } else {
                handleToggle("browserNotifications");
              }
            }}
          />
        </div>
      </div>
    </div>
  );
}

function PreferenceRow({
  icon,
  title,
  description,
  checked,
  isSaving,
  onChange,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  checked: boolean;
  isSaving?: boolean;
  onChange: () => void;
}) {
  return (
    <div
      onClick={onChange}
      className="flex w-full items-center justify-between px-6 py-4 cursor-pointer hover:bg-muted/40 transition-colors select-none"
    >
      <div className="flex items-center gap-3 min-w-0 pr-4">
        <div className="shrink-0">{icon}</div>
        <div className="flex flex-col gap-0.5 min-w-0">
          <span className="text-sm font-semibold text-foreground">{title}</span>
          <span className="text-xs text-muted-foreground leading-relaxed">{description}</span>
        </div>
      </div>
      <div className="shrink-0 flex items-center gap-2">
        {isSaving && <RefreshCw className="h-3 w-3 animate-spin text-muted-foreground" />}
        <div
          className={cn(
            "h-6 w-11 rounded-full border-2 border-transparent transition-colors duration-200",
            checked ? "bg-primary" : "bg-muted"
          )}
        >
          <div
            className={cn(
              "h-5 w-5 rounded-full bg-background shadow-sm transition-transform duration-200",
              checked ? "translate-x-5" : "translate-x-0"
            )}
          />
        </div>
      </div>
    </div>
  );
}
