import mongoose, { Document, Schema, Types } from "mongoose";

export type GroupMemberRole = "GROUP_ADMIN" | "MEMBER";
export type MembershipStatus = "ACTIVE" | "LEFT" | "REMOVED";

export interface IConversationMembership extends Document {
  conversationId: Types.ObjectId;
  workspaceId: Types.ObjectId;
  userId: Types.ObjectId;
  firebaseUid: string;
  role: GroupMemberRole;
  status: MembershipStatus;
  joinedAt: Date;
  leftAt?: Date;
  unreadCount: number;
  lastReadAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const ConversationMembershipSchema = new Schema<IConversationMembership>(
  {
    conversationId: {
      type: Schema.Types.ObjectId,
      ref: "Conversation",
      required: true,
      index: true,
    },
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
    firebaseUid: {
      type: String,
      required: true,
      index: true,
    },
    role: {
      type: String,
      enum: ["GROUP_ADMIN", "MEMBER"],
      default: "MEMBER",
    },
    status: {
      type: String,
      enum: ["ACTIVE", "LEFT", "REMOVED"],
      default: "ACTIVE",
      index: true,
    },
    joinedAt: {
      type: Date,
      default: Date.now,
    },
    leftAt: {
      type: Date,
    },
    unreadCount: {
      type: Number,
      default: 0,
    },
    lastReadAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

// Enforce unique membership per user per conversation
ConversationMembershipSchema.index({ conversationId: 1, userId: 1 }, { unique: true });
ConversationMembershipSchema.index({ workspaceId: 1, userId: 1, status: 1 });
ConversationMembershipSchema.index({ conversationId: 1, status: 1 });

export const ConversationMembership = mongoose.model<IConversationMembership>(
  "ConversationMembership",
  ConversationMembershipSchema
);
