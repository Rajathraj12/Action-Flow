import { Router, Response } from "express";
import mongoose from "mongoose";
import { requireAuth, AuthenticatedRequest } from "../middleware/auth.js";
import { Conversation } from "../models/Conversation.js";
import { ConversationMembership } from "../models/ConversationMembership.js";
import { Message } from "../models/Message.js";
import { User, IUser } from "../models/User.js";
import { getIO, isUserOnline, isUserInRoom } from "../socket/socketHandler.js";

const router = Router();

// 1. POST /api/conversations/:id/messages - Send a message in a conversation
router.post("/:id/messages", requireAuth, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const conversationId = String(req.params.id);
    const currentUserId = req.user?._id;
    const { text } = req.body;

    // Validate request body
    if (!text || typeof text !== "string" || !text.trim()) {
      res.status(400).json({ error: "Message text cannot be empty" });
      return;
    }

    const trimmedText = text.trim();

    if (!mongoose.Types.ObjectId.isValid(conversationId)) {
      res.status(400).json({ error: "Invalid conversation ID" });
      return;
    }

    // Security: Enforce conversation membership on every message write
    const senderMembership = await ConversationMembership.findOne({
      conversationId,
      userId: currentUserId,
    });

    if (!senderMembership) {
      res.status(403).json({ error: "Access denied. You are not a member of this conversation." });
      return;
    }

    // Find conversation to get recipient
    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      res.status(404).json({ error: "Conversation not found" });
      return;
    }

    const recipientId = conversation.participants.find(
      (p) => p.toString() !== currentUserId?.toString()
    );

    let initialStatus: "sent" | "delivered" | "read" = "sent";
    let deliveredAt: Date | undefined = undefined;
    let readAt: Date | undefined = undefined;

    try {
      const io = getIO();
      if (recipientId && io) {
        const recipientIdStr = recipientId.toString();
        if (isUserInRoom(io, `conversation:${conversationId}`, recipientIdStr)) {
          initialStatus = "read";
          deliveredAt = new Date();
          readAt = new Date();
        } else if (isUserOnline(recipientIdStr)) {
          initialStatus = "delivered";
          deliveredAt = new Date();
        }
      }
    } catch {
      // If socket not initialized, fallback to "sent"
    }

    // 1. Save message in MongoDB before broadcasting
    const savedMessage = await Message.create({
      conversationId,
      sender: currentUserId,
      senderFirebaseUid: req.user!.firebaseUid,
      text: trimmedText,
      status: initialStatus,
      isEdited: false,
      isDeletedForEveryone: false,
      deletedForUsers: [],
      deliveredAt,
      readAt,
    });

    // 2. Update conversation's last message info
    await Conversation.findByIdAndUpdate(conversationId, {
      lastMessage: savedMessage._id,
      lastMessageText: trimmedText,
      lastMessageAt: savedMessage.createdAt,
    });

    // 3. Increment unread count for other participants if not immediately read
    if (initialStatus !== "read") {
      await ConversationMembership.updateMany(
        { conversationId, userId: { $ne: currentUserId } },
        { $inc: { unreadCount: 1 } }
      );
    }

    const timeStr = new Date(savedMessage.createdAt).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });

    const formattedMessage = {
      id: savedMessage._id.toString(),
      conversationId: conversationId,
      senderId: currentUserId?.toString(),
      senderName: req.user!.displayName,
      senderInitials: req.user!.initials,
      text: trimmedText,
      time: timeStr,
      createdAt: savedMessage.createdAt,
      status: savedMessage.status,
      isEdited: false,
      isDeletedForEveryone: false,
      deliveredAt: savedMessage.deliveredAt,
      readAt: savedMessage.readAt,
    };

    // 4. Real-time delivery via Socket.IO
    try {
      const io = getIO();
      if (io) {
        io.to(`conversation:${conversationId}`).emit("message_received", formattedMessage);

        if (recipientId) {
          io.to(`user:${recipientId.toString()}`).emit("conversation_updated", {
            conversationId,
            lastMessageText: trimmedText,
            lastMessageTime: savedMessage.createdAt,
          });
        }

        io.to(`conversation:${conversationId}`).emit("conversation_updated", {
          conversationId,
          lastMessageText: trimmedText,
          lastMessageTime: savedMessage.createdAt,
        });
      }
    } catch (socketError) {
      console.warn("[MessageRoutes] Socket emission skipped or failed:", socketError);
    }

    res.status(201).json({
      message: {
        id: savedMessage._id.toString(),
        from: "me",
        text: trimmedText,
        time: timeStr,
        createdAt: savedMessage.createdAt,
        status: savedMessage.status,
        isEdited: false,
        isDeletedForEveryone: false,
        deliveredAt: savedMessage.deliveredAt,
        readAt: savedMessage.readAt,
      },
    });
  } catch (error: any) {
    console.error("[MessageRoutes] Failed to send message:", error);
    res.status(500).json({ error: error?.message || "Failed to send message" });
  }
});

// 2. PUT /api/conversations/:id/messages/:messageId - Edit a message (sender only)
router.put("/:id/messages/:messageId", requireAuth, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const conversationId = String(req.params.id);
    const messageId = String(req.params.messageId);
    const currentUserId = req.user?._id;
    const { text } = req.body;

    if (!text || typeof text !== "string" || !text.trim()) {
      res.status(400).json({ error: "Message text cannot be empty" });
      return;
    }

    if (!mongoose.Types.ObjectId.isValid(conversationId) || !mongoose.Types.ObjectId.isValid(messageId)) {
      res.status(400).json({ error: "Invalid IDs" });
      return;
    }

    // Verify conversation membership
    const membership = await ConversationMembership.findOne({
      conversationId,
      userId: currentUserId,
    });
    if (!membership) {
      res.status(403).json({ error: "Access denied" });
      return;
    }

    const message = await Message.findById(messageId);
    if (!message || message.conversationId.toString() !== conversationId) {
      res.status(404).json({ error: "Message not found" });
      return;
    }

    // Only sender can edit
    if (message.sender.toString() !== currentUserId?.toString()) {
      res.status(403).json({ error: "You can only edit messages sent by you" });
      return;
    }

    if (message.isDeletedForEveryone) {
      res.status(400).json({ error: "Cannot edit a deleted message" });
      return;
    }

    const trimmedText = text.trim();
    const now = new Date();
    message.text = trimmedText;
    message.isEdited = true;
    message.editedAt = now;
    await message.save();

    // If this was the last message, update conversation preview
    const conversation = await Conversation.findById(conversationId);
    if (conversation && conversation.lastMessage?.toString() === messageId) {
      conversation.lastMessageText = trimmedText;
      await conversation.save();
    }

    const editPayload = {
      conversationId,
      messageId,
      text: trimmedText,
      isEdited: true,
      editedAt: now,
    };

    try {
      const io = getIO();
      if (io) {
        io.to(`conversation:${conversationId}`).emit("message_edited", editPayload);
        io.to(`conversation:${conversationId}`).emit("conversation_updated", {
          conversationId,
          lastMessageText: trimmedText,
          lastMessageTime: message.createdAt,
        });
      }
    } catch (err) {
      console.warn("[MessageRoutes] Socket emission failed on edit:", err);
    }

    res.json({
      success: true,
      message: {
        id: message._id.toString(),
        text: trimmedText,
        isEdited: true,
        editedAt: now,
      },
    });
  } catch (error: any) {
    console.error("[MessageRoutes] Failed to edit message:", error);
    res.status(500).json({ error: error?.message || "Failed to edit message" });
  }
});

// 3. DELETE /api/conversations/:id/messages/:messageId - Delete message ("everyone" or "me")
router.delete("/:id/messages/:messageId", requireAuth, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const conversationId = String(req.params.id);
    const messageId = String(req.params.messageId);
    const currentUserId = req.user?._id;
    const { deleteType } = req.body; // "everyone" | "me"

    if (!mongoose.Types.ObjectId.isValid(conversationId) || !mongoose.Types.ObjectId.isValid(messageId)) {
      res.status(400).json({ error: "Invalid IDs" });
      return;
    }

    const membership = await ConversationMembership.findOne({
      conversationId,
      userId: currentUserId,
    });
    if (!membership) {
      res.status(403).json({ error: "Access denied" });
      return;
    }

    const message = await Message.findById(messageId);
    if (!message || message.conversationId.toString() !== conversationId) {
      res.status(404).json({ error: "Message not found" });
      return;
    }

    if (deleteType === "everyone") {
      // Only sender can delete for everyone
      if (message.sender.toString() !== currentUserId?.toString()) {
        res.status(403).json({ error: "Only the sender can delete this message for everyone" });
        return;
      }

      message.isDeletedForEveryone = true;
      message.text = "This message was deleted";
      await message.save();

      // If last message, update conversation preview
      const conversation = await Conversation.findById(conversationId);
      if (conversation && conversation.lastMessage?.toString() === messageId) {
        conversation.lastMessageText = "This message was deleted";
        await conversation.save();
      }

      try {
        const io = getIO();
        if (io) {
          io.to(`conversation:${conversationId}`).emit("message_deleted", {
            conversationId,
            messageId,
            isDeletedForEveryone: true,
            text: "This message was deleted",
          });
          io.to(`conversation:${conversationId}`).emit("conversation_updated", {
            conversationId,
            lastMessageText: "This message was deleted",
            lastMessageTime: message.createdAt,
          });
        }
      } catch (err) {
        console.warn("[MessageRoutes] Socket emission failed on delete:", err);
      }

      res.json({ success: true, deleteType: "everyone", messageId });
    } else {
      // Delete for me
      if (!message.deletedForUsers.some((uId) => uId.toString() === currentUserId?.toString())) {
        message.deletedForUsers.push(currentUserId!);
        await message.save();
      }

      res.json({ success: true, deleteType: "me", messageId });
    }
  } catch (error: any) {
    console.error("[MessageRoutes] Failed to delete message:", error);
    res.status(500).json({ error: error?.message || "Failed to delete message" });
  }
});

// 4. GET /api/conversations/:id/messages/:messageId/info - Get detailed delivery & read receipts (WhatsApp Message Info)
router.get("/:id/messages/:messageId/info", requireAuth, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const conversationId = String(req.params.id);
    const messageId = String(req.params.messageId);
    const currentUserId = req.user?._id;

    if (!mongoose.Types.ObjectId.isValid(conversationId) || !mongoose.Types.ObjectId.isValid(messageId)) {
      res.status(400).json({ error: "Invalid IDs" });
      return;
    }

    const membership = await ConversationMembership.findOne({
      conversationId,
      userId: currentUserId,
    });
    if (!membership) {
      res.status(403).json({ error: "Access denied" });
      return;
    }

    const message = await Message.findById(messageId)
      .populate<{ sender: IUser }>("sender", "displayName email initials role")
      .lean();

    if (!message || message.conversationId.toString() !== conversationId) {
      res.status(404).json({ error: "Message not found" });
      return;
    }

    const conversation = await Conversation.findById(conversationId)
      .populate<{ participants: IUser[] }>("participants", "displayName email initials role online lastSeen")
      .lean();

    const recipient = conversation?.participants.find(
      (p) => p._id.toString() !== message.sender._id.toString()
    );

    res.json({
      info: {
        id: message._id.toString(),
        text: message.text,
        status: message.status,
        isEdited: !!message.isEdited,
        editedAt: message.editedAt,
        isDeletedForEveryone: !!message.isDeletedForEveryone,
        sentAt: message.createdAt,
        deliveredAt: message.deliveredAt || (message.status !== "sent" ? message.createdAt : null),
        readAt: message.readAt || null,
        sender: {
          id: message.sender._id.toString(),
          displayName: message.sender.displayName,
          email: message.sender.email,
          initials: message.sender.initials,
        },
        recipient: recipient
          ? {
              id: recipient._id.toString(),
              displayName: recipient.displayName,
              email: recipient.email,
              initials: recipient.initials,
              online: recipient.online,
            }
          : null,
      },
    });
  } catch (error: any) {
    console.error("[MessageRoutes] Failed to get message info:", error);
    res.status(500).json({ error: error?.message || "Failed to get message info" });
  }
});

// 5. POST /api/conversations/:id/read - Mark conversation messages as read
router.post("/:id/read", requireAuth, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const conversationId = String(req.params.id);
    const currentUserId = req.user?._id;

    if (!mongoose.Types.ObjectId.isValid(conversationId)) {
      res.status(400).json({ error: "Invalid conversation ID" });
      return;
    }

    const membership = await ConversationMembership.findOne({
      conversationId,
      userId: currentUserId,
    });
    if (!membership) {
      res.status(403).json({ error: "Access denied" });
      return;
    }

    const now = new Date();
    const unreadMessages = await Message.find({
      conversationId,
      sender: { $ne: currentUserId },
      status: { $in: ["sent", "delivered"] },
    });

    if (unreadMessages.length > 0) {
      const unreadIds = unreadMessages.map((m) => m._id);
      await Message.updateMany(
        { _id: { $in: unreadIds } },
        { $set: { status: "read", readAt: now } }
      );
      await Message.updateMany(
        { _id: { $in: unreadIds }, deliveredAt: { $exists: false } },
        { $set: { deliveredAt: now } }
      );

      membership.unreadCount = 0;
      membership.lastReadAt = now;
      await membership.save();

      try {
        const io = getIO();
        if (io) {
          io.to(`conversation:${conversationId}`).emit("messages_read", {
            conversationId,
            readAt: now,
            readBy: currentUserId?.toString(),
            messageIds: unreadIds.map((id) => id.toString()),
          });
        }
      } catch (err) {
        console.warn("[MessageRoutes] Socket emission failed on mark read:", err);
      }
    }

    res.json({ success: true, count: unreadMessages.length });
  } catch (error: any) {
    console.error("[MessageRoutes] Failed to mark read:", error);
    res.status(500).json({ error: error?.message || "Failed to mark read" });
  }
});

export default router;
