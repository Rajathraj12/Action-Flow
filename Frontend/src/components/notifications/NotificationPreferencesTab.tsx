import React, { useState, useEffect } from "react";
import { toast } from "sonner";
import {
  Bell,
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
          setPrefs(res.preferences);
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

  const handleToggle = async (key: keyof NotificationPreferences) => {
    const nextValue = !prefs[key];
    const prevValue = prefs[key];

    // Optimistic UI update
    setPrefs((prev) => ({ ...prev, [key]: nextValue }));
    setSavingKey(key);

    try {
      const res = await api.updateNotificationPreferences({ [key]: nextValue });
      setPrefs(res.preferences);
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
      <div className="p-4 mx-6 mt-4 rounded-2xl bg-primary/10 border border-primary/20 flex items-start gap-3">
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
