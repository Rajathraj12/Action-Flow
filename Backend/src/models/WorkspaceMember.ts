import mongoose, { Document, Schema, Types } from "mongoose";

export type WorkspaceRole = "OWNER" | "ADMIN" | "MANAGER" | "MEMBER";
export type WorkspaceMemberStatus = "ACTIVE" | "INVITED" | "SUSPENDED";

export interface IWorkspaceMember extends Document {
  workspaceId: Types.ObjectId;
  userId: Types.ObjectId;
  role: WorkspaceRole;
  status: WorkspaceMemberStatus;
  joinedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const WorkspaceMemberSchema = new Schema<IWorkspaceMember>(
  {
    workspaceId: {
      type: Schema.Types.ObjectId,
      ref: "Workspace",
      required: true,
      index: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    role: {
      type: String,
      enum: ["OWNER", "ADMIN", "MANAGER", "MEMBER"],
      default: "MEMBER",
      required: true,
    },
    status: {
      type: String,
      enum: ["ACTIVE", "INVITED", "SUSPENDED"],
      default: "ACTIVE",
      required: true,
    },
    joinedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

// Enforce unique membership per user per workspace
WorkspaceMemberSchema.index({ workspaceId: 1, userId: 1 }, { unique: true });
// Optimize listing a user's workspaces
WorkspaceMemberSchema.index({ userId: 1, status: 1 });
// Optimize role-based queries within a workspace (e.g. checking owner count)
WorkspaceMemberSchema.index({ workspaceId: 1, role: 1 });

export const WorkspaceMember = mongoose.model<IWorkspaceMember>(
  "WorkspaceMember",
  WorkspaceMemberSchema
);
