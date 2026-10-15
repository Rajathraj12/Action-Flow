import { Router, Response } from "express";
import mongoose from "mongoose";
import { requireAuth, AuthenticatedRequest } from "../middleware/auth.js";
import { Conversation } from "../models/Conversation.js";
import { ConversationMembership } from "../models/ConversationMembership.js";
import { Message } from "../models/Message.js";
import { User, IUser } from "../models/User.js";
import { getIO } from "../socket/socketHandler.js";

const router = Router();

// GET /api/conversations - List conversations for the authenticated user
router.get("/", requireAuth, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const currentUserId = req.user?._id;

    // Find all memberships for current user
    const memberships = await ConversationMembership.find({ userId: currentUserId }).lean();
    const conversationIds = memberships.map((m) => m.conversationId);

    // Fetch conversations and populate participants
    const conversations = await Conversation.find({ _id: { $in: conversationIds } })
      .populate<{ participants: IUser[] }>("participants", "displayName email initials role online lastSeen")
      .sort({ lastMessageAt: -1, updatedAt: -1 })
      .lean();

    // Map memberships into clean frontend-ready conversations
    const membershipMap = new Map(memberships.map((m) => [m.conversationId.toString(), m]));

    const formatted = conversations.map((conv) => {
      const membership = membershipMap.get(conv._id.toString());
      // The other participant in a direct conversation
      const otherUser = conv.participants.find(
        (p) => p._id.toString() !== currentUserId?.toString()
      ) || conv.participants[0];

      return {
        id: conv._id.toString(),
        name: otherUser ? otherUser.displayName : "Unknown Contact",
        role: otherUser ? otherUser.role : "Team Member",
        initials: otherUser ? otherUser.initials : "U",
        online: otherUser ? !!otherUser.online : false,
        unread: membership?.unreadCount || 0,
        lastMessageText: conv.lastMessageText || "No messages yet",
        lastMessageTime: conv.lastMessageAt || conv.createdAt,
        otherUser: otherUser
          ? {
              id: otherUser._id.toString(),
              displayName: otherUser.displayName,
              email: otherUser.email,
              initials: otherUser.initials,
              online: otherUser.online,
            }
          : null,
      };
    });

    res.json({ conversations: formatted });
  } catch (error: any) {
    console.error("[ConversationRoutes] Failed to fetch conversations:", error);
    res.status(500).json({ error: error?.message || "Failed to fetch conversations" });
  }
});

// POST /api/conversations - Start or retrieve a one-to-one conversation
router.post("/", requireAuth, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const currentUserId = req.user?._id;
    const { recipientId } = req.body;

    if (!recipientId) {
      res.status(400).json({ error: "recipientId is required" });
      return;
    }

    if (!mongoose.Types.ObjectId.isValid(recipientId)) {
      res.status(400).json({ error: "Invalid recipientId format" });
      return;
    }

    if (recipientId === currentUserId?.toString()) {
      res.status(400).json({ error: "Cannot start a conversation with yourself" });
      return;
    }

    const recipient = await User.findById(recipientId);
    if (!recipient) {
      res.status(404).json({ error: "Recipient user not found" });
      return;
    }

    // Check if conversation already exists between the two users (prevent duplicates)
    let existingConversation = await Conversation.findOne({
      type: "direct",
      participants: { $all: [currentUserId, recipient._id], $size: 2 },
    }).populate<{ participants: IUser[] }>("participants", "displayName email initials role online lastSeen");

    if (existingConversation) {
      // Ensure memberships exist for both users (idempotent recovery)
      await ConversationMembership.updateOne(
        { conversationId: existingConversation._id, userId: currentUserId },
        { $setOnInsert: { firebaseUid: req.user!.firebaseUid } },
        { upsert: true }
      );
      await ConversationMembership.updateOne(
        { conversationId: existingConversation._id, userId: recipient._id },
        { $setOnInsert: { firebaseUid: recipient.firebaseUid } },
        { upsert: true }
      );

      res.status(200).json({
        conversation: {
          id: existingConversation._id.toString(),
          name: recipient.displayName,
          role: recipient.role,
          initials: recipient.initials,
          online: !!recipient.online,
          unread: 0,
          lastMessageText: existingConversation.lastMessageText || "No messages yet",
          lastMessageTime: existingConversation.lastMessageAt || existingConversation.createdAt,
          otherUser: {
            id: recipient._id.toString(),
            displayName: recipient.displayName,
            email: recipient.email,
            initials: recipient.initials,
            online: recipient.online,
          },
        },
        isExisting: true,
      });
      return;
    }

    // Create new conversation
    const newConv = await Conversation.create({
      type: "direct",
      participants: [currentUserId, recipient._id],
      lastMessageText: "",
      lastMessageAt: new Date(),
    });

    // Create memberships for both participants
    await ConversationMembership.create([
      {
        conversationId: newConv._id,
        userId: currentUserId,
        firebaseUid: req.user!.firebaseUid,
        unreadCount: 0,
      },
      {
        conversationId: newConv._id,
        userId: recipient._id,
        firebaseUid: recipient.firebaseUid,
        unreadCount: 0,
      },
    ]);

    res.status(201).json({
      conversation: {
        id: newConv._id.toString(),
        name: recipient.displayName,
        role: recipient.role,
        initials: recipient.initials,
        online: !!recipient.online,
        unread: 0,
        lastMessageText: "",
        lastMessageTime: newConv.createdAt,
        otherUser: {
          id: recipient._id.toString(),
          displayName: recipient.displayName,
          email: recipient.email,
          initials: recipient.initials,
          online: recipient.online,
        },
      },
      isExisting: false,
    });
  } catch (error: any) {
    console.error("[ConversationRoutes] Failed to create conversation:", error);
    res.status(500).json({ error: error?.message || "Failed to create conversation" });
  }
});

// GET /api/conversations/:id - Get conversation details (membership checked)
router.get("/:id", requireAuth, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const id = String(req.params.id);
    const currentUserId = req.user?._id;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      res.status(400).json({ error: "Invalid conversation ID" });
      return;
    }

    // Check membership authorization
    const membership = await ConversationMembership.findOne({
      conversationId: id,
      userId: currentUserId,
    });

    if (!membership) {
      res.status(403).json({ error: "Access denied. You are not a member of this conversation." });
      return;
    }

    const conversation = await Conversation.findById(id).populate<{ participants: IUser[] }>(
      "participants",
      "displayName email initials role online lastSeen"
    );

    if (!conversation) {
      res.status(404).json({ error: "Conversation not found" });
      return;
    }

    const otherUser = conversation.participants.find(
      (p) => p._id.toString() !== currentUserId?.toString()
    ) || conversation.participants[0];

    res.json({
      conversation: {
        id: conversation._id.toString(),
        name: otherUser ? otherUser.displayName : "Unknown Contact",
        role: otherUser ? otherUser.role : "Team Member",
        initials: otherUser ? otherUser.initials : "U",
        online: otherUser ? !!otherUser.online : false,
        unread: membership.unreadCount,
        lastMessageText: conversation.lastMessageText || "",
        lastMessageTime: conversation.lastMessageAt || conversation.createdAt,
        otherUser: otherUser
          ? {
              id: otherUser._id.toString(),
              displayName: otherUser.displayName,
              email: otherUser.email,
              initials: otherUser.initials,
              online: otherUser.online,
            }
          : null,
      },
    });
  } catch (error: any) {
    res.status(500).json({ error: error?.message || "Failed to get conversation" });
  }
});

// GET /api/conversations/:id/messages - Get chat history (membership checked)
router.get("/:id/messages", requireAuth, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const id = String(req.params.id);
    const currentUserId = req.user?._id;
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);

    if (!mongoose.Types.ObjectId.isValid(id)) {
      res.status(400).json({ error: "Invalid conversation ID" });
      return;
    }

    // Enforce membership on reading messages
    const membership = await ConversationMembership.findOne({
      conversationId: id,
      userId: currentUserId,
    });

    if (!membership) {
      res.status(403).json({ error: "Access denied. You are not a member of this conversation." });
      return;
    }

    // Reset unread count for current user
    if (membership.unreadCount > 0) {
      membership.unreadCount = 0;
      membership.lastReadAt = new Date();
      await membership.save();
    }

    // Fetch messages in chronological order, omitting messages deleted by current user
    const messages = await Message.find({
      conversationId: id,
      deletedForUsers: { $ne: currentUserId },
    })
      .sort({ createdAt: 1 })
      .limit(limit)
      .populate<{ sender: IUser }>("sender", "displayName initials email")
      .lean();

    // Mark unread messages sent by the other party as "read"
    const now = new Date();
    const unreadMessages = messages.filter(
      (m) => m.sender._id.toString() !== currentUserId?.toString() && m.status !== "read"
    );

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

      try {
        const io = getIO();
        if (io) {
          io.to(`conversation:${id}`).emit("messages_read", {
            conversationId: id,
            readAt: now,
            readBy: currentUserId?.toString(),
            messageIds: unreadIds.map((msgId) => msgId.toString()),
          });
        }
      } catch (err) {
        // Socket emission skipped if not ready
      }
    }

    const formattedMessages = messages.map((m) => {
      const isMe = m.sender._id.toString() === currentUserId?.toString();
      const date = new Date(m.createdAt);
      const timeStr = date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

      // If message was marked read just now, reflect it
      const isNewlyRead = !isMe && m.status !== "read";
      const status = isNewlyRead ? "read" : m.status;
      const readAt = isNewlyRead ? now : m.readAt;

      return {
        id: m._id.toString(),
        from: isMe ? ("me" as const) : ("them" as const),
        text: m.text,
        time: timeStr,
        createdAt: m.createdAt,
        status: status,
        isEdited: !!m.isEdited,
        editedAt: m.editedAt,
        isDeletedForEveryone: !!m.isDeletedForEveryone,
        deliveredAt: m.deliveredAt,
        readAt: readAt,
        sender: {
          id: m.sender._id.toString(),
          displayName: m.sender.displayName,
          initials: m.sender.initials,
        },
      };
    });

    res.json({
      messages: formattedMessages,
      total: formattedMessages.length,
    });
  } catch (error: any) {
    console.error("[ConversationRoutes] Failed to fetch messages:", error);
    res.status(500).json({ error: error?.message || "Failed to fetch messages" });
  }
});

export default router;
