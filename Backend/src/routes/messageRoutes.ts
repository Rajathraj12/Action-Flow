import { Router, Response } from "express";
import mongoose from "mongoose";
import { requireAuth, AuthenticatedRequest } from "../middleware/auth.js";
import { Conversation } from "../models/Conversation.js";
import { ConversationMembership } from "../models/ConversationMembership.js";
import { Message } from "../models/Message.js";
import { getIO } from "../socket/socketHandler.js";

const router = Router();

// POST /api/conversations/:id/messages - Send a message in a conversation
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

    // 1. Save message in MongoDB before broadcasting
    const savedMessage = await Message.create({
      conversationId,
      sender: currentUserId,
      senderFirebaseUid: req.user!.firebaseUid,
      text: trimmedText,
      status: "sent",
    });

    // 2. Update conversation's last message info
    await Conversation.findByIdAndUpdate(conversationId, {
      lastMessage: savedMessage._id,
      lastMessageText: trimmedText,
      lastMessageAt: savedMessage.createdAt,
    });

    // 3. Increment unread count for other participants
    await ConversationMembership.updateMany(
      { conversationId, userId: { $ne: currentUserId } },
      { $inc: { unreadCount: 1 } }
    );

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
    };

    // 4. Real-time delivery via Socket.IO to authorized room
    try {
      const io = getIO();
      if (io) {
        // Broadcast to conversation room (only authorized members are joined)
        io.to(`conversation:${conversationId}`).emit("message_received", formattedMessage);

        // Notify participants to update conversation previews
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
      },
    });
  } catch (error: any) {
    console.error("[MessageRoutes] Failed to send message:", error);
    res.status(500).json({ error: error?.message || "Failed to send message" });
  }
});

export default router;
