import mongoose, { Document, Schema, Types } from "mongoose";

export interface IMessage extends Document {
  conversationId: Types.ObjectId;
  sender: Types.ObjectId;
  senderFirebaseUid: string;
  text: string;
  status: "sent" | "delivered" | "read";
  isEdited: boolean;
  editedAt?: Date;
  isDeletedForEveryone: boolean;
  deletedForUsers: Types.ObjectId[];
  deliveredAt?: Date;
  readAt?: Date;
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
    isEdited: {
      type: Boolean,
      default: false,
    },
    editedAt: {
      type: Date,
    },
    isDeletedForEveryone: {
      type: Boolean,
      default: false,
    },
    deletedForUsers: [
      {
        type: Schema.Types.ObjectId,
        ref: "User",
        default: [],
      },
    ],
    deliveredAt: {
      type: Date,
    },
    readAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

// Compound index for chronologically ordered messages in a conversation
MessageSchema.index({ conversationId: 1, createdAt: 1 });
MessageSchema.index({ conversationId: 1, deletedForUsers: 1 });

export const Message = mongoose.model<IMessage>("Message", MessageSchema);
