import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  Bell,
  Check,
  CheckCheck,
  Clock,
  AlertTriangle,
  AlertCircle,
  CheckCircle2,
  MessageSquare,
  Users,
  UserCheck,
  ArrowRightCircle,
  Activity,
  X,
  ExternalLink,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  api,
  type BackendNotification,
  type ActivityItem,
  type NotificationType,
} from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useWorkspace } from "@/context/WorkspaceContext";
import { getSocket } from "@/lib/socket";
import { cn } from "@/lib/utils";

function formatRelativeTime(dateString: string): string {
  try {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHour = Math.floor(diffMin / 60);
    const diffDay = Math.floor(diffHour / 24);

    if (diffSec < 30) return "Just now";
    if (diffSec < 60) return `${diffSec}s ago`;
    if (diffMin < 60) return `${diffMin}m ago`;
    if (diffHour < 24) return `${diffHour}h ago`;
    if (diffDay === 1) return "Yesterday";
    if (diffDay < 7) return `${diffDay}d ago`;
    return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  } catch {
    return "";
  }
}

function getNotificationIcon(type: NotificationType) {
  switch (type) {
    case "TASK_ASSIGNED":
    case "TASK_REASSIGNED":
      return <UserCheck className="h-4 w-4 text-emerald-400" />;
    case "TASK_STATUS_CHANGED":
      return <ArrowRightCircle className="h-4 w-4 text-sky-400" />;
    case "TASK_COMPLETED":
      return <CheckCircle2 className="h-4 w-4 text-emerald-400" />;
    case "TASK_DUE_SOON":
      return <Clock className="h-4 w-4 text-amber-400" />;
    case "TASK_OVERDUE":
      return <AlertTriangle className="h-4 w-4 text-rose-400" />;
    case "MESSAGE_RECEIVED":
      return <MessageSquare className="h-4 w-4 text-blue-400" />;
    case "GROUP_MESSAGE_RECEIVED":
      return <Users className="h-4 w-4 text-indigo-400" />;
    default:
      return <Bell className="h-4 w-4 text-primary" />;
  }
}

export function NotificationCenter({ isSidebarExpanded = false }: { isSidebarExpanded?: boolean }) {
  const { user, token } = useAuth();
  const { activeWorkspace } = useWorkspace();
  const navigate = useNavigate();

  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"all" | "unread" | "activity">("all");
  const [notifications, setNotifications] = useState<BackendNotification[]>([]);
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadingActivity, setLoadingActivity] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  // Fetch unread count & initial list
  const fetchUnreadCount = useCallback(async () => {
    if (!token) return;
    try {
      const res = await api.getUnreadNotificationCount(activeWorkspace?.id);
      setUnreadCount(res.count);
    } catch (err) {
      console.error("[NotificationCenter] Failed to fetch unread count:", err);
    }
  }, [token, activeWorkspace?.id]);

  const fetchNotifications = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await api.getNotifications({
        workspaceId: activeWorkspace?.id,
        limit: 50,
      });
      setNotifications(res.notifications);
      setUnreadCount(res.unreadCount);
    } catch (err) {
      console.error("[NotificationCenter] Failed to fetch notifications:", err);
    } finally {
      setLoading(false);
    }
  }, [token, activeWorkspace?.id]);

  const fetchActivities = useCallback(async () => {
    if (!token || !activeWorkspace?.id) return;
    setLoadingActivity(true);
    try {
      const res = await api.getActivityFeed(activeWorkspace.id, 40);
      setActivities(res.activities);
    } catch (err) {
      console.error("[NotificationCenter] Failed to fetch activity feed:", err);
    } finally {
      setLoadingActivity(false);
    }
  }, [token, activeWorkspace?.id]);

  useEffect(() => {
    fetchUnreadCount();
  }, [fetchUnreadCount]);

  useEffect(() => {
    if (isOpen) {
      fetchNotifications();
      if (activeWorkspace?.id) {
        fetchActivities();
      }
    }
  }, [isOpen, fetchNotifications, fetchActivities, activeWorkspace?.id]);

  // Real-time Socket.IO delivery
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    const handleNewNotification = (notification: BackendNotification) => {
      // Add to list and bump unread count
      setNotifications((prev) => [notification, ...prev]);
      setUnreadCount((prev) => prev + 1);

      // Playful toast alert
      toast.info(notification.title, {
        description: notification.description,
        action: notification.navigationUrl
          ? {
              label: "View",
              onClick: () => handleNavigate(notification),
            }
          : undefined,
      });
    };

    const handleUnreadCount = (data: { count: number }) => {
      if (typeof data.count === "number") {
        setUnreadCount(data.count);
      }
    };

    const handleReadNotification = (data: { notificationId: string; unreadCount: number }) => {
      setNotifications((prev) =>
        prev.map((n) => (n.id === data.notificationId ? { ...n, read: true } : n))
      );
      if (typeof data.unreadCount === "number") {
        setUnreadCount(data.unreadCount);
      }
    };

    const handleReadAllNotifications = () => {
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
      setUnreadCount(0);
    };

    socket.on("notification:new", handleNewNotification);
    socket.on("notification:unread_count", handleUnreadCount);
    socket.on("notification:read", handleReadNotification);
    socket.on("notification:read_all", handleReadAllNotifications);

    return () => {
      socket.off("notification:new", handleNewNotification);
      socket.off("notification:unread_count", handleUnreadCount);
      socket.off("notification:read", handleReadNotification);
      socket.off("notification:read_all", handleReadAllNotifications);
    };
  }, []);

  // Close panel on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        panelRef.current &&
        !panelRef.current.contains(event.target as Node) &&
        !(event.target as HTMLElement)?.closest(".notification-trigger-btn")
      ) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  const handleMarkAsRead = async (e: React.MouseEvent, notificationId: string) => {
    e.stopPropagation();
    try {
      const res = await api.markNotificationRead(notificationId);
      setNotifications((prev) =>
        prev.map((n) => (n.id === notificationId ? { ...n, read: true } : n))
      );
      setUnreadCount(res.unreadCount);
    } catch (err: any) {
      toast.error(err.message || "Failed to mark as read");
    }
  };

  const handleMarkAllAsRead = async () => {
    try {
      await api.markAllNotificationsRead(activeWorkspace?.id);
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
      setUnreadCount(0);
      toast.success("All notifications marked as read");
    } catch (err: any) {
      toast.error(err.message || "Failed to mark all as read");
    }
  };

  const handleNavigate = async (notification: BackendNotification) => {
    // Mark as read immediately if unread
    if (!notification.read) {
      api.markNotificationRead(notification.id).catch(console.error);
      setNotifications((prev) =>
        prev.map((n) => (n.id === notification.id ? { ...n, read: true } : n))
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
    }

    setIsOpen(false);

    // Deep navigation
    if (notification.navigationUrl) {
      if (notification.navigationUrl.startsWith("/tasks")) {
        window.location.href = notification.navigationUrl;
      } else if (notification.navigationUrl.startsWith("/?")) {
        window.location.href = notification.navigationUrl;
      } else {
        window.location.href = notification.navigationUrl;
      }
    } else if (notification.taskId) {
      window.location.href = `/tasks?taskId=${notification.taskId}`;
    } else if (notification.conversationId) {
      const msgParam = notification.messageId ? `&messageId=${notification.messageId}` : "";
      window.location.href = `/?conversationId=${notification.conversationId}${msgParam}`;
    }
  };

  const filteredNotifications =
    activeTab === "unread" ? notifications.filter((n) => !n.read) : notifications;

  return (
    <div className="relative w-full">
      {/* Bell Trigger Button */}
      {isSidebarExpanded ? (
        <button
          type="button"
          onClick={() => setIsOpen((prev) => !prev)}
          aria-label="Notification Center"
          className={cn(
            "notification-trigger-btn group flex w-full items-center justify-between rounded-xl px-3 py-2 text-xs font-semibold transition-all duration-200 cursor-pointer",
            isOpen
              ? "bg-primary text-primary-foreground shadow-sm"
              : "text-rail-foreground/75 hover:bg-rail-foreground/10 hover:text-rail-foreground"
          )}
        >
          <div className="flex items-center gap-2.5">
            <Bell className="h-4.5 w-4.5 transition-transform duration-200 group-hover:rotate-12" />
            <span>Notifications</span>
          </div>

          {/* Unread Badge Counter */}
          {unreadCount > 0 && (
            <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-rose-500 px-1.5 text-[10px] font-black text-white shadow-xs">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </button>
      ) : (
        <div className="flex items-center justify-center w-full">
          <button
            type="button"
            onClick={() => setIsOpen((prev) => !prev)}
            aria-label="Notification Center"
            className={cn(
              "notification-trigger-btn group relative flex h-10 w-10 items-center justify-center rounded-xl transition-all duration-200 cursor-pointer shadow-xs",
              isOpen
                ? "bg-primary text-primary-foreground shadow-[0_0_15px_rgba(0,168,132,0.4)]"
                : "text-rail-foreground/75 hover:bg-white/10 hover:text-white"
            )}
          >
            <Bell className="h-4.5 w-4.5 transition-transform duration-200 group-hover:rotate-12" />

            {/* Unread Badge Counter */}
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 flex h-4.5 min-w-[18px] items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-black text-white shadow-md animate-in zoom-in-50">
                {unreadCount > 99 ? "99+" : unreadCount}
                <span className="absolute -inset-0.5 rounded-full bg-rose-500/30 animate-ping pointer-events-none" />
              </span>
            )}
          </button>
        </div>
      )}

      {/* Flyout Popover Panel */}
      {isOpen && (
        <div
          ref={panelRef}
          className={cn(
            "fixed bottom-14 w-[24rem] sm:w-[26rem] max-h-[82vh] flex flex-col rounded-2xl bg-card/95 backdrop-blur-xl border border-border/80 shadow-2xl z-50 overflow-hidden animate-in fade-in slide-in-from-left-3 duration-200",
            isSidebarExpanded ? "left-[16.5rem]" : "left-[4.75rem]"
          )}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3.5 border-b border-border/70 bg-card/60 shrink-0">
            <div className="flex items-center gap-2">
              <div className="grid h-7 w-7 place-items-center rounded-lg bg-primary/20 text-primary">
                <Bell className="h-4 w-4" />
              </div>
              <span className="font-display font-bold text-base text-foreground">
                Notification Center
              </span>
              {unreadCount > 0 && (
                <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[11px] font-bold text-primary">
                  {unreadCount} new
                </span>
              )}
            </div>

            <div className="flex items-center gap-1">
              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={handleMarkAllAsRead}
                  title="Mark all as read"
                  className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors cursor-pointer"
                >
                  <CheckCheck className="h-3.5 w-3.5" />
                  <span>Mark all read</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="grid h-7 w-7 place-items-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors cursor-pointer"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Navigation Tabs */}
          <div className="flex items-center gap-1 px-4 py-2 border-b border-border/50 bg-muted/20 shrink-0">
            <button
              type="button"
              onClick={() => setActiveTab("all")}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer",
                activeTab === "all"
                  ? "bg-card text-foreground shadow-xs border border-border"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <span>All</span>
              <span className="rounded-full bg-muted px-1.5 py-0.2 text-[10px] text-muted-foreground">
                {notifications.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("unread")}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer",
                activeTab === "unread"
                  ? "bg-card text-foreground shadow-xs border border-border"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <span>Unread</span>
              {unreadCount > 0 && (
                <span className="rounded-full bg-rose-500/15 px-1.5 py-0.2 text-[10px] font-bold text-rose-500">
                  {unreadCount}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("activity")}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ml-auto",
                activeTab === "activity"
                  ? "bg-card text-primary shadow-xs border border-border"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Activity className="h-3.5 w-3.5" />
              <span>Activity Feed</span>
            </button>
          </div>

          {/* Content Body */}
          <div className="flex-1 overflow-y-auto divide-y divide-border/40 custom-scrollbar max-h-[58vh]">
            {activeTab === "activity" ? (
              // Activity Feed View
              <div>
                {loadingActivity ? (
                  <div className="py-12 flex flex-col items-center justify-center gap-2 text-muted-foreground text-xs">
                    <RefreshCw className="h-5 w-5 animate-spin text-primary" />
                    <span>Loading workspace activity...</span>
                  </div>
                ) : activities.length === 0 ? (
                  <div className="py-12 px-6 text-center text-xs text-muted-foreground">
                    <Activity className="h-8 w-8 mx-auto mb-2 text-muted-foreground/40" />
                    <p className="font-semibold text-foreground">No recent activity</p>
                    <p className="mt-1">Workspace collaboration events will appear here in real time.</p>
                  </div>
                ) : (
                  <div className="p-3 space-y-2.5">
                    {activities.map((act) => (
                      <div
                        key={act.id}
                        className="flex items-start gap-3 p-2.5 rounded-xl bg-card/60 border border-border/50 hover:bg-muted/40 transition-colors"
                      >
                        <div className="grid h-8 w-8 place-items-center rounded-lg bg-primary/10 text-primary shrink-0 font-bold text-xs">
                          {act.actor?.initials || "AF"}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-bold text-foreground truncate">
                              {act.title}
                            </span>
                            <span className="text-[10px] text-muted-foreground shrink-0">
                              {formatRelativeTime(act.createdAt)}
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                            {act.description}
                          </p>
                          {act.navigationUrl && (
                            <a
                              href={act.navigationUrl}
                              onClick={(e) => {
                                e.preventDefault();
                                setIsOpen(false);
                                window.location.href = act.navigationUrl!;
                              }}
                              className="inline-flex items-center gap-1 mt-1.5 text-[11px] font-semibold text-primary hover:underline"
                            >
                              <span>View details</span>
                              <ExternalLink className="h-2.5 w-2.5" />
                            </a>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              // Notifications View
              <div>
                {loading ? (
                  <div className="py-12 flex flex-col items-center justify-center gap-2 text-muted-foreground text-xs">
                    <RefreshCw className="h-5 w-5 animate-spin text-primary" />
                    <span>Loading notifications...</span>
                  </div>
                ) : filteredNotifications.length === 0 ? (
                  <div className="py-12 px-6 text-center text-xs text-muted-foreground">
                    <Sparkles className="h-8 w-8 mx-auto mb-2 text-primary/40" />
                    <p className="font-semibold text-foreground">
                      {activeTab === "unread" ? "All caught up!" : "No notifications yet"}
                    </p>
                    <p className="mt-1">
                      {activeTab === "unread"
                        ? "You have zero unread notifications."
                        : "Task reminders and message alerts will appear here."}
                    </p>
                  </div>
                ) : (
                  filteredNotifications.map((notif) => (
                    <div
                      key={notif.id}
                      onClick={() => handleNavigate(notif)}
                      className={cn(
                        "group relative flex items-start gap-3 p-3.5 transition-all cursor-pointer hover:bg-muted/50",
                        !notif.read && "bg-primary/5 font-medium"
                      )}
                    >
                      {/* Left unread bar indicator */}
                      {!notif.read && (
                        <span className="absolute left-0 top-3 bottom-3 w-1 rounded-r-full bg-primary" />
                      )}

                      {/* Icon */}
                      <div className="grid h-8 w-8 place-items-center rounded-xl bg-card border border-border shadow-xs shrink-0">
                        {getNotificationIcon(notif.type)}
                      </div>

                      {/* Details */}
                      <div className="flex-1 min-w-0 pr-6">
                        <div className="flex items-center justify-between gap-1 mb-0.5">
                          <span
                            className={cn(
                              "text-xs truncate",
                              !notif.read ? "font-bold text-foreground" : "text-foreground/90 font-medium"
                            )}
                          >
                            {notif.title}
                          </span>
                          <span className="text-[10px] text-muted-foreground shrink-0">
                            {formatRelativeTime(notif.createdAt)}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                          {notif.description}
                        </p>
                        {notif.actor && (
                          <div className="flex items-center gap-1.5 mt-1.5 text-[10px] text-muted-foreground/80">
                            <span className="inline-block h-3.5 w-3.5 rounded-full bg-primary/20 text-primary font-bold text-[8px] text-center leading-3.5">
                              {notif.actor.initials}
                            </span>
                            <span>{notif.actor.displayName}</span>
                          </div>
                        )}
                      </div>

                      {/* Right Mark as Read Button */}
                      {!notif.read && (
                        <button
                          type="button"
                          onClick={(e) => handleMarkAsRead(e, notif.id)}
                          title="Mark as read"
                          className="absolute right-3 top-3.5 grid h-6 w-6 place-items-center rounded-md text-muted-foreground/50 hover:text-primary hover:bg-primary/10 transition-colors cursor-pointer"
                        >
                          <Check className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  ))
                )}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between px-4 py-2.5 border-t border-border/70 bg-card/60 text-[11px] text-muted-foreground shrink-0">
            <span>ActionFlow Notifications</span>
            <a
              href="/settings?tab=Notifications"
              onClick={() => setIsOpen(false)}
              className="font-semibold text-primary hover:underline cursor-pointer"
            >
              Preferences
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
