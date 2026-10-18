import mongoose, { Document, Schema, Types } from "mongoose";
import { WorkspaceRole } from "./WorkspaceMember.js";

export type InvitationStatus = "PENDING" | "ACCEPTED" | "REVOKED" | "EXPIRED";

export interface IWorkspaceInvitation extends Document {
  workspaceId: Types.ObjectId;
  email: string;
  role: Exclude<WorkspaceRole, "OWNER">;
  token: string;
  invitedBy: Types.ObjectId;
  status: InvitationStatus;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const WorkspaceInvitationSchema = new Schema<IWorkspaceInvitation>(
  {
    workspaceId: {
      type: Schema.Types.ObjectId,
      ref: "Workspace",
      required: true,
      index: true,
    },
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    role: {
      type: String,
      enum: ["ADMIN", "MANAGER", "MEMBER"],
      default: "MEMBER",
      required: true,
    },
    token: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    invitedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    status: {
      type: String,
      enum: ["PENDING", "ACCEPTED", "REVOKED", "EXPIRED"],
      default: "PENDING",
      required: true,
    },
    expiresAt: {
      type: Date,
      required: true,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

WorkspaceInvitationSchema.index({ workspaceId: 1, email: 1, status: 1 });

export const WorkspaceInvitation = mongoose.model<IWorkspaceInvitation>(
  "WorkspaceInvitation",
  WorkspaceInvitationSchema
);
