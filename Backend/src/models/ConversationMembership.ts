import mongoose, { Document, Schema, Types } from "mongoose";

export interface IConversationMembership extends Document {
  conversationId: Types.ObjectId;
  userId: Types.ObjectId;
  firebaseUid: string;
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

export const ConversationMembership = mongoose.model<IConversationMembership>(
  "ConversationMembership",
  ConversationMembershipSchema
);
