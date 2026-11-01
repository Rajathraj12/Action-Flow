import mongoose, { Types } from "mongoose";
import { Notification, INotification, NotificationType, INotificationDestination } from "../models/Notification.js";
import { NotificationPreference, INotificationPreference } from "../models/NotificationPreference.js";
import { User, IUser } from "../models/User.js";
import { getIO } from "../socket/socketHandler.js";

export interface CreateNotificationParams {
  recipientId: string | Types.ObjectId;
  workspaceId: string | Types.ObjectId;
  type: NotificationType;
  title: string;
  description: string;
  actorId?: string | Types.ObjectId;
  taskId?: string | Types.ObjectId;
  conversationId?: string | Types.ObjectId;
  messageId?: string | Types.ObjectId;
  destination?: INotificationDestination;
}

export interface FormattedNotification {
  id: string;
  recipientId: string;
  workspaceId: string;
  type: NotificationType;
  title: string;
  description: string;
  read: boolean;
  readAt?: string;
  actor?: {
    id: string;
    displayName: string;
    initials: string;
    avatarUrl?: string;
  };
  taskId?: string;
  conversationId?: string;
  messageId?: string;
  destination?: INotificationDestination;
  createdAt: string;
}

function formatNotification(doc: any): FormattedNotification {
  const actor = doc.actorId
    ? typeof doc.actorId === "object" && doc.actorId.displayName
      ? {
          id: doc.actorId._id?.toString() || doc.actorId.id?.toString(),
          displayName: doc.actorId.displayName,
          initials: doc.actorId.initials || "U",
          avatarUrl: doc.actorId.avatarUrl || "",
        }
      : undefined
    : undefined;

  return {
    id: doc._id.toString(),
    recipientId: doc.recipientId?.toString(),
    workspaceId: doc.workspaceId?.toString(),
    type: doc.type,
    title: doc.title,
    description: doc.description,
    read: !!doc.read,
    readAt: doc.readAt ? new Date(doc.readAt).toISOString() : undefined,
    actor,
    taskId: doc.taskId ? doc.taskId.toString() : undefined,
    conversationId: doc.conversationId ? doc.conversationId.toString() : undefined,
    messageId: doc.messageId ? doc.messageId.toString() : undefined,
    destination: doc.destination
      ? {
          type: doc.destination.type,
          id: doc.destination.id,
          extraId: doc.destination.extraId,
        }
      : undefined,
    createdAt: new Date(doc.createdAt).toISOString(),
  };
}

/**
 * Creates and persists a notification, respecting user preferences and deduplication,
 * and emits real-time Socket.IO events to the recipient.
 */
export async function createNotification(
  params: CreateNotificationParams
): Promise<FormattedNotification | null> {
  const {
    recipientId,
    workspaceId,
    type,
    title,
    description,
    actorId,
    taskId,
    conversationId,
    messageId,
    destination,
  } = params;

  const recipientObjId = new Types.ObjectId(recipientId.toString());
  const workspaceObjId = new Types.ObjectId(workspaceId.toString());
  const actorObjId = actorId ? new Types.ObjectId(actorId.toString()) : undefined;

  // 1. Never notify the actor about their own actions (anti-self-notification guard)
  if (actorObjId && recipientObjId.equals(actorObjId)) {
    return null;
  }

  // 2. Check recipient notification preferences
  const preferences = await getUserNotificationPreferences(recipientObjId);
  if (!isNotificationTypeEnabled(type, preferences)) {
    return null;
  }

  // 3. Deduplication check (prevents duplicate triggers within 15 seconds for the same task/message)
  const recentWindow = new Date(Date.now() - 15000);
  const dupQuery: any = {
    recipientId: recipientObjId,
    type,
    createdAt: { $gte: recentWindow },
    isDeleted: { $ne: true },
  };

  if (taskId) {
    dupQuery.taskId = new Types.ObjectId(taskId.toString());
  }
  if (messageId) {
    dupQuery.messageId = new Types.ObjectId(messageId.toString());
  }

  if (taskId || messageId) {
    const existing = await Notification.findOne(dupQuery);
    if (existing) {
      return formatNotification(existing);
    }
  }

  // 4. Save notification to MongoDB
  const notification = await Notification.create({
    recipientId: recipientObjId,
    workspaceId: workspaceObjId,
    type,
    title,
    description,
    read: false,
    actorId: actorObjId,
    taskId: taskId ? new Types.ObjectId(taskId.toString()) : undefined,
    conversationId: conversationId ? new Types.ObjectId(conversationId.toString()) : undefined,
    messageId: messageId ? new Types.ObjectId(messageId.toString()) : undefined,
    destination,
  });

  const populated = await Notification.findById(notification._id).populate<{ actorId: IUser }>(
    "actorId",
    "displayName initials email avatarUrl"
  );

  const formatted = formatNotification(populated);

  // 5. Emit real-time Socket.IO notification to user's personal room
  try {
    const io = getIO();
    if (io) {
      const recipientRoom = `user:${recipientObjId.toString()}`;
      io.to(recipientRoom).emit("notification:new", formatted);

      // Also compute and emit new unread count
      const unreadCount = await getUnreadNotificationCount(recipientObjId, workspaceObjId);
      io.to(recipientRoom).emit("notification:unread_count", {
        unreadCount,
        workspaceId: workspaceObjId.toString(),
      });
    }
  } catch (err) {
    // Graceful socket failure
  }

  return formatted;
}

function isNotificationTypeEnabled(
  type: NotificationType,
  prefs: INotificationPreference
): boolean {
  switch (type) {
    case "TASK_ASSIGNED":
    case "TASK_REASSIGNED":
      return prefs.taskAssigned !== false;
    case "TASK_STATUS_CHANGED":
      return prefs.taskStatusChanged !== false;
    case "TASK_COMPLETED":
      return prefs.taskCompleted !== false;
    case "TASK_DUE_SOON":
    case "TASK_OVERDUE":
      return prefs.taskReminders !== false;
    case "MESSAGE_RECEIVED":
      return prefs.directMessages !== false;
    case "GROUP_MESSAGE_RECEIVED":
      return prefs.groupMessages !== false;
    default:
      return true;
  }
}

/**
 * Retrieves unread notification count for a user.
 */
export async function getUnreadNotificationCount(
  userId: string | Types.ObjectId,
  workspaceId?: string | Types.ObjectId
): Promise<number> {
  const query: any = {
    recipientId: new Types.ObjectId(userId.toString()),
    read: false,
    isDeleted: { $ne: true },
  };
  if (workspaceId) {
    query.workspaceId = new Types.ObjectId(workspaceId.toString());
  }
  return Notification.countDocuments(query);
}

/**
 * Lists notifications visible to the authenticated user.
 */
export async function getUserNotifications(
  userId: string | Types.ObjectId,
  options: {
    workspaceId?: string | Types.ObjectId;
    unreadOnly?: boolean;
    limit?: number;
    page?: number;
  } = {}
) {
  const userObjId = new Types.ObjectId(userId.toString());
  const limit = Math.min(100, Math.max(1, options.limit || 50));
  const page = Math.max(1, options.page || 1);
  const skip = (page - 1) * limit;

  const query: any = {
    recipientId: userObjId,
    isDeleted: { $ne: true },
  };

  if (options.workspaceId) {
    query.workspaceId = new Types.ObjectId(options.workspaceId.toString());
  }
  if (options.unreadOnly) {
    query.read = false;
  }

  const [notifications, total, unreadCount] = await Promise.all([
    Notification.find(query)
      .populate<{ actorId: IUser }>("actorId", "displayName initials email avatarUrl")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Notification.countDocuments(query),
    getUnreadNotificationCount(userObjId, options.workspaceId),
  ]);

  return {
    notifications: notifications.map(formatNotification),
    total,
    unreadCount,
    page,
    limit,
  };
}

/**
 * Marks a single notification as read if owned by the user.
 */
export async function markNotificationAsRead(
  notificationId: string | Types.ObjectId,
  userId: string | Types.ObjectId
): Promise<FormattedNotification | null> {
  const notifObjId = new Types.ObjectId(notificationId.toString());
  const userObjId = new Types.ObjectId(userId.toString());

  const notification = await Notification.findOne({
    _id: notifObjId,
    recipientId: userObjId,
    isDeleted: { $ne: true },
  });

  if (!notification) {
    return null;
  }

  if (!notification.read) {
    notification.read = true;
    notification.readAt = new Date();
    await notification.save();

    // Emit real-time unread count update
    try {
      const io = getIO();
      if (io) {
        const unreadCount = await getUnreadNotificationCount(userObjId, notification.workspaceId);
        io.to(`user:${userObjId.toString()}`).emit("notification:read", {
          notificationId: notification._id.toString(),
          readAt: notification.readAt.toISOString(),
        });
        io.to(`user:${userObjId.toString()}`).emit("notification:unread_count", {
          unreadCount,
          workspaceId: notification.workspaceId.toString(),
        });
      }
    } catch {}
  }

  const populated = await Notification.findById(notification._id).populate<{ actorId: IUser }>(
    "actorId",
    "displayName initials email avatarUrl"
  );
  return formatNotification(populated);
}

/**
 * Marks all notifications as read for a user (optionally scoped to a workspace).
 */
export async function markAllNotificationsAsRead(
  userId: string | Types.ObjectId,
  workspaceId?: string | Types.ObjectId
): Promise<number> {
  const userObjId = new Types.ObjectId(userId.toString());
  const query: any = {
    recipientId: userObjId,
    read: false,
    isDeleted: { $ne: true },
  };

  if (workspaceId) {
    query.workspaceId = new Types.ObjectId(workspaceId.toString());
  }

  const result = await Notification.updateMany(query, {
    $set: { read: true, readAt: new Date() },
  });

  try {
    const io = getIO();
    if (io) {
      const unreadCount = await getUnreadNotificationCount(userObjId, workspaceId);
      io.to(`user:${userObjId.toString()}`).emit("notification:read_all", {
        workspaceId: workspaceId?.toString(),
      });
      io.to(`user:${userObjId.toString()}`).emit("notification:unread_count", {
        unreadCount,
        workspaceId: workspaceId?.toString(),
      });
    }
  } catch {}

  return result.modifiedCount;
}

/**
 * Retrieves or creates user notification preferences.
 */
export async function getUserNotificationPreferences(
  userId: string | Types.ObjectId
): Promise<INotificationPreference> {
  const userObjId = new Types.ObjectId(userId.toString());
  let prefs = await NotificationPreference.findOne({ userId: userObjId });
  if (!prefs) {
    prefs = await NotificationPreference.create({
      userId: userObjId,
      taskAssigned: true,
      taskStatusChanged: true,
      taskCompleted: true,
      taskReminders: true,
      directMessages: true,
      groupMessages: true,
      browserNotifications: false,
    });
  }
  return prefs;
}

/**
 * Updates user notification preferences.
 */
export async function updateUserNotificationPreferences(
  userId: string | Types.ObjectId,
  updates: Partial<INotificationPreference>
): Promise<INotificationPreference> {
  const userObjId = new Types.ObjectId(userId.toString());
  const validFields = [
    "taskAssigned",
    "taskStatusChanged",
    "taskCompleted",
    "taskReminders",
    "directMessages",
    "groupMessages",
    "browserNotifications",
  ];

  const sanitized: any = {};
  for (const field of validFields) {
    if ((updates as any)[field] !== undefined) {
      sanitized[field] = Boolean((updates as any)[field]);
    }
  }

  const prefs = await NotificationPreference.findOneAndUpdate(
    { userId: userObjId },
    { $set: sanitized },
    { new: true, upsert: true }
  );
  return prefs;
}
