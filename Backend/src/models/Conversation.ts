import mongoose, { Document, Schema, Types } from "mongoose";

export type ConversationType = "DIRECT" | "direct" | "GROUP" | "group";

export interface IConversation extends Document {
  workspaceId: Types.ObjectId;
  type: ConversationType;
  name?: string;
  description?: string;
  participants: Types.ObjectId[];
  participantIds?: Types.ObjectId[];
  createdBy?: Types.ObjectId;
  admins?: Types.ObjectId[];
  dmKey?: string;
  lastMessage?: Types.ObjectId;
  lastMessageId?: Types.ObjectId;
  lastMessageText?: string;
  lastMessageAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export function getDirectDmKey(
  workspaceId: string | Types.ObjectId,
  userA: string | Types.ObjectId,
  userB: string | Types.ObjectId
): string {
  const sorted = [userA.toString(), userB.toString()].sort();
  return `${workspaceId.toString()}:${sorted[0]}:${sorted[1]}`;
}

const ConversationSchema = new Schema<IConversation>(
  {
    workspaceId: {
      type: Schema.Types.ObjectId,
      ref: "Workspace",
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: ["DIRECT", "direct", "GROUP", "group"],
      default: "DIRECT",
      index: true,
    },
    name: {
      type: String,
      trim: true,
      maxlength: 100,
      default: "",
    },
    description: {
      type: String,
      trim: true,
      maxlength: 500,
      default: "",
    },
    participants: [
      {
        type: Schema.Types.ObjectId,
        ref: "User",
        required: true,
      },
    ],
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
    admins: [
      {
        type: Schema.Types.ObjectId,
        ref: "User",
        default: [],
      },
    ],
    dmKey: {
      type: String,
      unique: true,
      sparse: true,
      index: true,
    },
    lastMessage: {
      type: Schema.Types.ObjectId,
      ref: "Message",
    },
    lastMessageId: {
      type: Schema.Types.ObjectId,
      ref: "Message",
    },
    lastMessageText: {
      type: String,
      default: "",
    },
    lastMessageAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Virtual alias participantIds -> participants
ConversationSchema.virtual("participantIds").get(function (this: IConversation) {
  return this.participants;
});

// Indexes for workspace conversations, sorting, and participant lookups
ConversationSchema.index({ workspaceId: 1, updatedAt: -1 });
ConversationSchema.index({ workspaceId: 1, lastMessageAt: -1 });
ConversationSchema.index({ workspaceId: 1, type: 1, updatedAt: -1 });
ConversationSchema.index({ workspaceId: 1, participants: 1 });
ConversationSchema.index({ participants: 1 });

export const Conversation = mongoose.model<IConversation>("Conversation", ConversationSchema);
