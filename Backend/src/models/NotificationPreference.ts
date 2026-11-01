import mongoose, { Document, Schema, Types } from "mongoose";

export interface INotificationPreference extends Document {
  userId: Types.ObjectId;
  taskAssigned: boolean;
  taskStatusChanged: boolean;
  taskCompleted: boolean;
  taskReminders: boolean;
  directMessages: boolean;
  groupMessages: boolean;
  browserNotifications: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const NotificationPreferenceSchema = new Schema<INotificationPreference>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
      index: true,
    },
    taskAssigned: {
      type: Boolean,
      default: true,
    },
    taskStatusChanged: {
      type: Boolean,
      default: true,
    },
    taskCompleted: {
      type: Boolean,
      default: true,
    },
    taskReminders: {
      type: Boolean,
      default: true,
    },
    directMessages: {
      type: Boolean,
      default: true,
    },
    groupMessages: {
      type: Boolean,
      default: true,
    },
    browserNotifications: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

export const NotificationPreference = mongoose.model<INotificationPreference>(
  "NotificationPreference",
  NotificationPreferenceSchema
);
