import mongoose, { Document, Schema, Types } from "mongoose";

export type NotificationType =
  | "TASK_ASSIGNED"
  | "TASK_REASSIGNED"
  | "TASK_STATUS_CHANGED"
  | "TASK_COMPLETED"
  | "TASK_DUE_SOON"
  | "TASK_OVERDUE"
  | "MESSAGE_RECEIVED"
  | "GROUP_MESSAGE_RECEIVED";

export interface INotificationDestination {
  type: "task" | "conversation";
  id: string;
  extraId?: string;
}

export interface INotification extends Document {
  recipientId: Types.ObjectId;
  workspaceId: Types.ObjectId;
  type: NotificationType;
  title: string;
  description: string;
  read: boolean;
  readAt?: Date;
  actorId?: Types.ObjectId;
  taskId?: Types.ObjectId;
  conversationId?: Types.ObjectId;
  messageId?: Types.ObjectId;
  destination?: INotificationDestination;
  isDeleted: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const NotificationSchema = new Schema<INotification>(
  {
    recipientId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    workspaceId: {
      type: Schema.Types.ObjectId,
      ref: "Workspace",
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: [
        "TASK_ASSIGNED",
        "TASK_REASSIGNED",
        "TASK_STATUS_CHANGED",
        "TASK_COMPLETED",
        "TASK_DUE_SOON",
        "TASK_OVERDUE",
        "MESSAGE_RECEIVED",
        "GROUP_MESSAGE_RECEIVED",
      ],
      required: true,
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },
    description: {
      type: String,
      required: true,
      trim: true,
      maxlength: 1000,
    },
    read: {
      type: Boolean,
      default: false,
      index: true,
    },
    readAt: {
      type: Date,
    },
    actorId: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
    taskId: {
      type: Schema.Types.ObjectId,
      ref: "Task",
      index: true,
    },
    conversationId: {
      type: Schema.Types.ObjectId,
      ref: "Conversation",
    },
    messageId: {
      type: Schema.Types.ObjectId,
      ref: "Message",
    },
    destination: {
      type: {
        type: String,
        enum: ["task", "conversation"],
      },
      id: { type: String },
      extraId: { type: String },
    },
    isDeleted: {
      type: Boolean,
      default: false,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

// Compound indexes for recipient queries, unread counts, and workspace filtering
NotificationSchema.index({ recipientId: 1, read: 1, isDeleted: 1, createdAt: -1 });
NotificationSchema.index({ recipientId: 1, workspaceId: 1, createdAt: -1 });
NotificationSchema.index({ recipientId: 1, type: 1, taskId: 1, createdAt: -1 });
NotificationSchema.index({ workspaceId: 1, createdAt: -1 });

export const Notification = mongoose.model<INotification>("Notification", NotificationSchema);
