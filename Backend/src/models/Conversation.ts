import mongoose, { Document, Schema, Types } from "mongoose";

export interface IConversation extends Document {
  type: "direct";
  participants: Types.ObjectId[];
  lastMessage?: Types.ObjectId;
  lastMessageText?: string;
  lastMessageAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const ConversationSchema = new Schema<IConversation>(
  {
    type: {
      type: String,
      enum: ["direct"],
      default: "direct",
    },
    participants: [
      {
        type: Schema.Types.ObjectId,
        ref: "User",
        required: true,
      },
    ],
    lastMessage: {
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
  }
);

// Index to quickly search user's conversations and prevent duplicates
ConversationSchema.index({ participants: 1 });
ConversationSchema.index({ updatedAt: -1 });

export const Conversation = mongoose.model<IConversation>("Conversation", ConversationSchema);
