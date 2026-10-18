import mongoose, { Types } from "mongoose";
import { Conversation } from "../models/Conversation.js";
import { ConversationMembership } from "../models/ConversationMembership.js";
import { Message, IMessage } from "../models/Message.js";
import { WorkspaceMember } from "../models/WorkspaceMember.js";
import { User, IUser } from "../models/User.js";
import { getIO, isUserOnline, isUserInRoom } from "../socket/socketHandler.js";

export interface SendMessageParams {
  conversationId: string | Types.ObjectId;
  workspaceId: string | Types.ObjectId;
  senderId: string | Types.ObjectId;
  senderFirebaseUid: string;
  senderDisplayName?: string;
  senderInitials?: string;
  text: string;
}

export interface FormattedMessagePayload {
  id: string;
  conversationId: string;
  workspaceId: string;
  senderId: string;
  senderName: string;
  senderInitials: string;
  text: string;
  time: string;
  createdAt: Date;
  status: "sent" | "delivered" | "read";
  isEdited: boolean;
  isDeletedForEveryone: boolean;
  deliveredAt?: Date;
  readAt?: Date;
}

/**
 * Unified service for sending and persisting messages in MongoDB.
 * Supports both DIRECT and GROUP conversations.
 * Used by both REST API and Socket.IO handlers to ensure zero drift.
 */
export async function sendMessageService(params: SendMessageParams): Promise<FormattedMessagePayload> {
  const { conversationId, workspaceId, senderId, senderFirebaseUid, text } = params;

  // 1. Validate message text
  if (!text || typeof text !== "string") {
    throw new Error("Message text must be a non-empty string");
  }

  const trimmedText = text.trim();
  if (trimmedText.length === 0) {
    throw new Error("Message text cannot be empty");
  }

  if (trimmedText.length > 5000) {
    throw new Error("Message text exceeds maximum length of 5000 characters");
  }

  // 2. Verify active workspace membership of sender
  const isWorkspaceMember = await WorkspaceMember.findOne({
    workspaceId,
    userId: senderId,
    status: "ACTIVE",
  });

  if (!isWorkspaceMember) {
    throw new Error("Sender is not an active member of this workspace");
  }

  // 3. Verify conversation exists, belongs to this workspace, and sender is a participant
  const conversation = await Conversation.findOne({
    _id: conversationId,
    workspaceId,
    participants: senderId,
  });

  if (!conversation) {
    throw new Error("Conversation not found or access denied in this workspace");
  }

  // 4. Verify sender is an active conversation member (not LEFT or REMOVED)
  const senderMembership = await ConversationMembership.findOne({
    conversationId: conversation._id,
    userId: senderId,
  });

  if (senderMembership && senderMembership.status !== "ACTIVE") {
    throw new Error("You are no longer an active participant of this conversation");
  }

  const isGroup = conversation.type === "GROUP" || conversation.type === "group";
  let initialStatus: "sent" | "delivered" | "read" = "sent";
  let deliveredAt: Date | undefined = undefined;
  let readAt: Date | undefined = undefined;
  let recipientIds: string[] = [];

  if (isGroup) {
    // Group conversation: find all other active members
    const senderObjId = new mongoose.Types.ObjectId(senderId.toString());
    const activeMembers = await ConversationMembership.find({
      conversationId: conversation._id,
      status: "ACTIVE",
      userId: { $ne: senderObjId },
    }).select("userId");

    recipientIds = activeMembers.map((m) => m.userId.toString());
  } else {
    // Direct conversation: single recipient
    const recipientId = conversation.participants.find(
      (p) => p.toString() !== senderId.toString()
    );

    if (!recipientId) {
      throw new Error("Cannot message without a valid recipient in direct conversation");
    }

    // Verify recipient is also an active member of this workspace
    const isRecipientMember = await WorkspaceMember.findOne({
      workspaceId,
      userId: recipientId,
      status: "ACTIVE",
    });

    if (!isRecipientMember) {
      throw new Error("Recipient is no longer an active member of this workspace");
    }

    recipientIds = [recipientId.toString()];

    // Resolve direct message delivery status via Socket.IO connection
    try {
      const io = getIO();
      if (io) {
        const recipientIdStr = recipientId.toString();
        const roomName = `conversation:${conversationId.toString()}`;

        if (isUserInRoom(io, roomName, recipientIdStr)) {
          initialStatus = "read";
          deliveredAt = new Date();
          readAt = new Date();
        } else if (isUserOnline(recipientIdStr)) {
          initialStatus = "delivered";
          deliveredAt = new Date();
        }
      }
    } catch {
      // Socket not yet initialized or headless
    }
  }

  // 5. Persist message in MongoDB before broadcasting
  const savedMessage = await Message.create({
    conversationId: conversation._id,
    workspaceId: conversation.workspaceId,
    sender: senderId,
    senderFirebaseUid,
    text: trimmedText,
    status: initialStatus,
    isEdited: false,
    isDeletedForEveryone: false,
    deletedForUsers: [],
    deliveredAt,
    readAt,
  });

  // 6. Update conversation metadata
  await Conversation.findByIdAndUpdate(conversation._id, {
    lastMessage: savedMessage._id,
    lastMessageId: savedMessage._id,
    lastMessageText: trimmedText,
    lastMessageAt: savedMessage.createdAt,
  });

  // 7. Increment unread count for recipients
  if (isGroup) {
    // In group, increment unread for all other active members
    const senderObjId = new mongoose.Types.ObjectId(senderId.toString());
    await ConversationMembership.updateMany(
      {
        conversationId: conversation._id,
        userId: { $ne: senderObjId },
        status: "ACTIVE",
      },
      { $inc: { unreadCount: 1 } }
    );
  } else if (recipientIds.length > 0 && initialStatus !== "read") {
    const recipientObjId = new mongoose.Types.ObjectId(recipientIds[0]);
    await ConversationMembership.updateOne(
      { conversationId: conversation._id, userId: recipientObjId },
      { $inc: { unreadCount: 1 } }
    );
  }

  // Format time display
  const timeStr = new Date(savedMessage.createdAt).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });

  // Get sender details if not supplied
  let senderName = params.senderDisplayName;
  let senderInitials = params.senderInitials;
  if (!senderName || !senderInitials) {
    const senderUser = await User.findById(senderId).select("displayName initials");
    if (senderUser) {
      senderName = senderName || senderUser.displayName;
      senderInitials = senderInitials || senderUser.initials;
    }
  }

  const formattedPayload: FormattedMessagePayload = {
    id: savedMessage._id.toString(),
    conversationId: conversation._id.toString(),
    workspaceId: workspaceId.toString(),
    senderId: senderId.toString(),
    senderName: senderName || "User",
    senderInitials: senderInitials || "U",
    text: trimmedText,
    time: timeStr,
    createdAt: savedMessage.createdAt,
    status: savedMessage.status,
    isEdited: false,
    isDeletedForEveryone: false,
    deliveredAt: savedMessage.deliveredAt,
    readAt: savedMessage.readAt,
  };

  // 8. Broadcast to conversation room and user rooms via Socket.IO
  try {
    const io = getIO();
    if (io) {
      const room = `conversation:${conversation._id.toString()}`;

      // Emit Phase 2 & 3 standard events AND aliases
      io.to(room).emit("message:new", formattedPayload);
      io.to(room).emit("message_received", formattedPayload);

      const conversationUpdatePayload = {
        conversationId: conversation._id.toString(),
        workspaceId: workspaceId.toString(),
        lastMessageId: savedMessage._id.toString(),
        lastMessageText: trimmedText,
        lastMessageTime: savedMessage.createdAt,
        lastMessageAt: savedMessage.createdAt,
      };

      io.to(room).emit("conversation:updated", conversationUpdatePayload);
      io.to(room).emit("conversation_updated", conversationUpdatePayload);

      // Notify each active recipient's personal room for conversation list updates
      for (const recipientId of recipientIds) {
        io.to(`user:${recipientId}`).emit("conversation:updated", conversationUpdatePayload);
        io.to(`user:${recipientId}`).emit("conversation_updated", conversationUpdatePayload);
      }
    }
  } catch (socketError) {
    console.warn("[MessageService] Real-time broadcast skipped or failed:", socketError);
  }

  return formattedPayload;
}

/**
 * Unified service to mark conversation messages as read and reset unread counts.
 */
export async function markConversationReadService(
  conversationId: string | Types.ObjectId,
  workspaceId: string | Types.ObjectId,
  userId: string | Types.ObjectId
): Promise<{ success: boolean; count: number; readAt: Date }> {
  // 1. Verify membership
  const conversation = await Conversation.findOne({
    _id: conversationId,
    workspaceId,
    participants: userId,
  });

  if (!conversation) {
    throw new Error("Conversation not found or access denied");
  }

  const now = new Date();

  // 2. Find unread messages sent by others
  const unreadMessages = await Message.find({
    conversationId: conversation._id,
    sender: { $ne: userId },
    status: { $in: ["sent", "delivered"] },
  });

  const unreadIds = unreadMessages.map((m) => m._id);

  if (unreadIds.length > 0) {
    await Message.updateMany(
      { _id: { $in: unreadIds } },
      { $set: { status: "read", readAt: now } }
    );
    await Message.updateMany(
      { _id: { $in: unreadIds }, deliveredAt: { $exists: false } },
      { $set: { deliveredAt: now } }
    );
  }

  // 3. Reset membership unread count to 0
  await ConversationMembership.updateOne(
    { conversationId: conversation._id, userId },
    { $set: { unreadCount: 0, lastReadAt: now } },
    { upsert: true }
  );

  // 4. Broadcast read events
  if (unreadIds.length > 0) {
    try {
      const io = getIO();
      if (io) {
        const room = `conversation:${conversation._id.toString()}`;
        const readPayload = {
          conversationId: conversation._id.toString(),
          workspaceId: workspaceId.toString(),
          readAt: now,
          readBy: userId.toString(),
          messageIds: unreadIds.map((id) => id.toString()),
        };

        io.to(room).emit("conversation:read-updated", readPayload);
        io.to(room).emit("messages_read", readPayload);
      }
    } catch {
      // ignore socket emission errors
    }
  }

  return { success: true, count: unreadIds.length, readAt: now };
}
