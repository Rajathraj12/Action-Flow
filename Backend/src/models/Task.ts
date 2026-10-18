import mongoose, { Document, Schema, Types } from "mongoose";

export type TaskStatus = "TODO" | "IN_PROGRESS" | "IN_REVIEW" | "DONE";
export type TaskPriority = "LOW" | "MEDIUM" | "HIGH" | "URGENT";

export interface ITask extends Document {
  workspaceId: Types.ObjectId;
  title: string;
  description?: string;
  createdBy: Types.ObjectId;
  assigneeId: Types.ObjectId;
  priority: TaskPriority;
  status: TaskStatus;
  dueDate?: Date;
  completedAt?: Date;
  sourceMessageId?: Types.ObjectId;
  sourceConversationId?: Types.ObjectId;
  sourceSnippet?: string;
  createdAt: Date;
  updatedAt: Date;
}

const TaskSchema = new Schema<ITask>(
  {
    workspaceId: {
      type: Schema.Types.ObjectId,
      ref: "Workspace",
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
      trim: true,
      maxlength: 5000,
      default: "",
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    assigneeId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    priority: {
      type: String,
      enum: ["LOW", "MEDIUM", "HIGH", "URGENT"],
      default: "MEDIUM",
      index: true,
    },
    status: {
      type: String,
      enum: ["TODO", "IN_PROGRESS", "IN_REVIEW", "DONE"],
      default: "TODO",
      index: true,
    },
    dueDate: {
      type: Date,
      index: true,
    },
    completedAt: {
      type: Date,
    },
    sourceMessageId: {
      type: Schema.Types.ObjectId,
      ref: "Message",
      index: true,
    },
    sourceConversationId: {
      type: Schema.Types.ObjectId,
      ref: "Conversation",
      index: true,
    },
    sourceSnippet: {
      type: String,
      maxlength: 500,
    },
  },
  {
    timestamps: true,
  }
);

// Compound indexes for high performance workspace filtering
TaskSchema.index({ workspaceId: 1, status: 1 });
TaskSchema.index({ workspaceId: 1, assigneeId: 1, status: 1 });
TaskSchema.index({ workspaceId: 1, createdBy: 1 });
TaskSchema.index({ workspaceId: 1, dueDate: 1 });
TaskSchema.index({ workspaceId: 1, createdAt: -1 });

export const Task = mongoose.model<ITask>("Task", TaskSchema);
