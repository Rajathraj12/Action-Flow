import mongoose, { Document, Schema, Types } from "mongoose";

export interface IMessage extends Document {
  conversationId: Types.ObjectId;
  sender: Types.ObjectId;
  senderFirebaseUid: string;
  text: string;
  status: "sent" | "delivered" | "read";
  createdAt: Date;
  updatedAt: Date;
}

const MessageSchema = new Schema<IMessage>(
  {
    conversationId: {
      type: Schema.Types.ObjectId,
      ref: "Conversation",
      required: true,
      index: true,
    },
    sender: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    senderFirebaseUid: {
      type: String,
      required: true,
      index: true,
    },
    text: {
      type: String,
      required: true,
      trim: true,
      minlength: 1,
    },
    status: {
      type: String,
      enum: ["sent", "delivered", "read"],
      default: "sent",
    },
  },
  {
    timestamps: true,
  }
);

// Compound index for chronologically ordered messages in a conversation
MessageSchema.index({ conversationId: 1, createdAt: 1 });

export const Message = mongoose.model<IMessage>("Message", MessageSchema);
