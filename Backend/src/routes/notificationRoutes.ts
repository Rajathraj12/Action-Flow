import { Router, Response } from "express";
import mongoose, { Types } from "mongoose";
import { requireAuth, AuthenticatedRequest } from "../middleware/auth.js";
import { requireWorkspaceMember, WorkspaceAuthenticatedRequest } from "../middleware/rbac.js";
import {
  getUserNotifications,
  getUnreadNotificationCount,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  getUserNotificationPreferences,
  updateUserNotificationPreferences,
} from "../services/notificationService.js";
import { runDueTaskReminders } from "../services/reminderScheduler.js";
import { Task } from "../models/Task.js";
import { Conversation } from "../models/Conversation.js";
import { IUser } from "../models/User.js";

const router = Router();

// ==========================================
// 1. LIST NOTIFICATIONS
// GET /api/notifications
// ==========================================
router.get(
  "/",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const currentUserId = req.user!._id;
      const { workspaceId, unreadOnly, limit, page } = req.query;

      const result = await getUserNotifications(currentUserId, {
        workspaceId: workspaceId as string | undefined,
        unreadOnly: unreadOnly === "true",
        limit: limit ? parseInt(limit as string, 10) : 50,
        page: page ? parseInt(page as string, 10) : 1,
      });

      res.json(result);
    } catch (error: any) {
      console.error("[NotificationRoutes] Error fetching notifications:", error);
      res.status(500).json({ error: error?.message || "Failed to load notifications" });
    }
  }
);

// ==========================================
// 2. UNREAD COUNT
// GET /api/notifications/unread-count
// ==========================================
router.get(
  "/unread-count",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const currentUserId = req.user!._id;
      const { workspaceId } = req.query;

      const count = await getUnreadNotificationCount(
        currentUserId,
        workspaceId as string | undefined
      );

      res.json({
        unreadCount: count,
        workspaceId: workspaceId || null,
      });
    } catch (error: any) {
      console.error("[NotificationRoutes] Error fetching unread count:", error);
      res.status(500).json({ error: error?.message || "Failed to get unread count" });
    }
  }
);

// ==========================================
// 3. MARK NOTIFICATION AS READ
// PATCH /api/notifications/:notificationId/read
// ==========================================
router.patch(
  "/:notificationId/read",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const currentUserId = req.user!._id;
      const { notificationId } = req.params;

      if (!mongoose.Types.ObjectId.isValid(notificationId)) {
        res.status(400).json({ error: "Invalid notification ID format" });
        return;
      }

      const updated = await markNotificationAsRead(notificationId, currentUserId);
      if (!updated) {
        res.status(404).json({ error: "Notification not found or access denied" });
        return;
      }

      res.json({
        success: true,
        notification: updated,
      });
    } catch (error: any) {
      console.error("[NotificationRoutes] Error marking notification read:", error);
      res.status(500).json({ error: error?.message || "Failed to mark notification as read" });
    }
  }
);

// ==========================================
// 4. MARK ALL NOTIFICATIONS AS READ
// PATCH /api/notifications/read-all
// ==========================================
router.patch(
  "/read-all",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const currentUserId = req.user!._id;
      const workspaceId = req.body?.workspaceId || (req.query?.workspaceId as string | undefined);

      const modifiedCount = await markAllNotificationsAsRead(currentUserId, workspaceId);

      res.json({
        success: true,
        count: modifiedCount,
      });
    } catch (error: any) {
      console.error("[NotificationRoutes] Error marking all notifications read:", error);
      res.status(500).json({ error: error?.message || "Failed to mark notifications as read" });
    }
  }
);

// ==========================================
// 5. GET NOTIFICATION PREFERENCES
// GET /api/notifications/preferences
// ==========================================
router.get(
  "/preferences",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const currentUserId = req.user!._id;
      const preferences = await getUserNotificationPreferences(currentUserId);
      res.json({ preferences });
    } catch (error: any) {
      console.error("[NotificationRoutes] Error getting preferences:", error);
      res.status(500).json({ error: error?.message || "Failed to get notification preferences" });
    }
  }
);

// ==========================================
// 6. UPDATE NOTIFICATION PREFERENCES
// PATCH /api/notifications/preferences
// ==========================================
router.patch(
  "/preferences",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const currentUserId = req.user!._id;
      const updates = req.body || {};

      const updated = await updateUserNotificationPreferences(currentUserId, updates);
      res.json({
        success: true,
        preferences: updated,
      });
    } catch (error: any) {
      console.error("[NotificationRoutes] Error updating preferences:", error);
      res.status(500).json({ error: error?.message || "Failed to update notification preferences" });
    }
  }
);

// ==========================================
// 7. WORKSPACE ACTIVITY FEED
// GET /api/notifications/activity
// ==========================================
router.get(
  "/activity",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const currentUserId = req.user!._id;
      const workspaceId = (req.query.workspaceId as string) || (req.headers["x-workspace-id"] as string);

      if (!workspaceId || !mongoose.Types.ObjectId.isValid(workspaceId)) {
        res.status(400).json({ error: "Valid workspaceId required" });
        return;
      }

      const wsObjId = new Types.ObjectId(workspaceId);

      // Fetch recent workspace tasks
      const recentTasks = await Task.find({ workspaceId: wsObjId })
        .populate<{ createdBy: IUser }>("createdBy", "displayName initials email avatarUrl")
        .populate<{ assigneeId: IUser }>("assigneeId", "displayName initials email avatarUrl")
        .sort({ updatedAt: -1 })
        .limit(20)
        .lean();

      // Fetch recent group conversations
      const recentGroups = await Conversation.find({
        workspaceId: wsObjId,
        type: "GROUP",
        participants: currentUserId,
      })
        .sort({ createdAt: -1 })
        .limit(10)
        .lean();

      const activities: any[] = [];

      for (const t of recentTasks) {
        if (t.status === "DONE") {
          activities.push({
            id: `act-task-done-${t._id}`,
            type: "TASK_COMPLETED",
            title: `Task completed: "${t.title}"`,
            actor: t.assigneeId || t.createdBy,
            timestamp: t.completedAt || t.updatedAt,
            target: { type: "task", id: t._id.toString() },
          });
        } else if (t.status === "IN_PROGRESS" || t.status === "IN_REVIEW") {
          activities.push({
            id: `act-task-status-${t._id}`,
            type: "TASK_STATUS_CHANGED",
            title: `Task moved to ${t.status.replace("_", " ")}: "${t.title}"`,
            actor: t.assigneeId || t.createdBy,
            timestamp: t.updatedAt,
            target: { type: "task", id: t._id.toString() },
          });
        } else {
          activities.push({
            id: `act-task-create-${t._id}`,
            type: "TASK_CREATED",
            title: `New task created: "${t.title}"`,
            actor: t.createdBy,
            timestamp: t.createdAt,
            target: { type: "task", id: t._id.toString() },
          });
        }
      }

      for (const g of recentGroups) {
        activities.push({
          id: `act-group-${g._id}`,
          type: "GROUP_CREATED",
          title: `Group conversation "${g.name}" created`,
          actor: null,
          timestamp: g.createdAt,
          target: { type: "conversation", id: g._id.toString() },
        });
      }

      // Sort by timestamp descending
      activities.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

      res.json({
        activities: activities.slice(0, 30),
      });
    } catch (error: any) {
      console.error("[NotificationRoutes] Error fetching activity feed:", error);
      res.status(500).json({ error: error?.message || "Failed to load activity feed" });
    }
  }
);

// ==========================================
// 8. TRIGGER DUE DATE REMINDERS (Admin / Testing / Scheduler)
// POST /api/notifications/run-reminders
// ==========================================
router.post(
  "/run-reminders",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const summary = await runDueTaskReminders();
      res.json({
        success: true,
        summary,
      });
    } catch (error: any) {
      console.error("[NotificationRoutes] Error running reminders:", error);
      res.status(500).json({ error: error?.message || "Failed to run due date reminders" });
    }
  }
);

export default router;
