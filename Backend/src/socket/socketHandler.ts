import { Server as HttpServer } from "http";
import { Server as SocketIOServer, Socket } from "socket.io";
import { verifyFirebaseIdToken } from "../config/firebase.js";
import { User, IUser } from "../models/User.js";
import { ConversationMembership } from "../models/ConversationMembership.js";
import { Conversation } from "../models/Conversation.js";
import { Message } from "../models/Message.js";

let io: SocketIOServer | null = null;

// Track active sockets per userId
const userSockets = new Map<string, Set<string>>();

export function getIO(): SocketIOServer {
  if (!io) {
    throw new Error("Socket.IO has not been initialized yet");
  }
  return io;
}

export function isUserOnline(userId: string): boolean {
  const set = userSockets.get(userId.toString());
  return !!set && set.size > 0;
}

export function isUserInRoom(ioServer: SocketIOServer, roomName: string, userId: string): boolean {
  const room = ioServer.sockets.adapter.rooms.get(roomName);
  if (!room) return false;
  const userSocketIds = userSockets.get(userId.toString());
  if (!userSocketIds) return false;
  for (const sId of userSocketIds) {
    if (room.has(sId)) return true;
  }
  return false;
}

export function initSocket(server: HttpServer): SocketIOServer {
  io = new SocketIOServer(server, {
    cors: {
      origin: "*",
      methods: ["GET", "POST", "PUT", "DELETE"],
      credentials: true,
    },
  });

  // Socket Authentication Middleware
  io.use(async (socket: Socket, next) => {
    try {
      const token =
        socket.handshake.auth?.token ||
        (socket.handshake.headers.authorization?.startsWith("Bearer ")
          ? socket.handshake.headers.authorization.split(" ")[1]
          : null);

      if (!token) {
        return next(new Error("Authentication token required"));
      }

      // Verify token via Firebase Admin / verifier
      const decoded = await verifyFirebaseIdToken(token);

      // Find or create user in MongoDB
      let user = await User.findOne({ firebaseUid: decoded.uid });
      if (!user) {
        user = await User.create({
          firebaseUid: decoded.uid,
          email: decoded.email,
          displayName: decoded.displayName || decoded.email.split("@")[0] || "User",
          online: true,
          lastSeen: new Date(),
        });
      }

      socket.data.user = user;
      socket.data.firebaseUid = decoded.uid;
      next();
    } catch (error: any) {
      console.error("[Socket.IO] Authentication failed for socket:", socket.id, error?.message || error);
      next(new Error("Authentication failed"));
    }
  });

  io.on("connection", async (socket: Socket) => {
    const user = socket.data.user as IUser;
    if (!user) {
      socket.disconnect(true);
      return;
    }

    const userIdStr = user._id.toString();
    console.log(`[Socket.IO] Connected: ${user.displayName} (${user.email}) - Socket ${socket.id}`);

    // Track socket connection
    if (!userSockets.has(userIdStr)) {
      userSockets.set(userIdStr, new Set());
    }
    userSockets.get(userIdStr)!.add(socket.id);

    // Join user's personal notification room
    socket.join(`user:${userIdStr}`);

    // Update online status in database
    await User.findByIdAndUpdate(user._id, { online: true });
    socket.broadcast.emit("user_status_changed", {
      userId: userIdStr,
      online: true,
    });

    // WhatsApp logic: Any pending messages sent to this user transition from "sent" to "delivered"
    try {
      const memberships = await ConversationMembership.find({ userId: user._id }).select("conversationId");
      const convIds = memberships.map((m) => m.conversationId);
      const pendingMessages = await Message.find({
        conversationId: { $in: convIds },
        sender: { $ne: user._id },
        status: "sent",
      });

      if (pendingMessages.length > 0) {
        const now = new Date();
        const pendingIds = pendingMessages.map((m) => m._id);
        await Message.updateMany(
          { _id: { $in: pendingIds } },
          { $set: { status: "delivered", deliveredAt: now } }
        );

        // Group by conversationId to emit events
        const convGroups = new Map<string, string[]>();
        for (const m of pendingMessages) {
          const cId = m.conversationId.toString();
          if (!convGroups.has(cId)) convGroups.set(cId, []);
          convGroups.get(cId)!.push(m._id.toString());
        }

        for (const [cId, messageIds] of convGroups.entries()) {
          io?.to(`conversation:${cId}`).emit("messages_delivered", {
            conversationId: cId,
            messageIds,
            deliveredAt: now,
          });
        }
      }
    } catch (deliveryErr) {
      console.warn("[Socket.IO] Error updating pending deliveries:", deliveryErr);
    }

    // 1. Join Conversation Room
    socket.on("join_conversation", async (data: { conversationId: string }, callback?: (res: any) => void) => {
      try {
        const { conversationId } = data;
        if (!conversationId) return;

        // Security check: Must be an authorized member
        const membership = await ConversationMembership.findOne({
          conversationId,
          userId: user._id,
        });

        if (!membership) {
          console.warn(`[Socket.IO] Unauthorized join attempt by ${user.displayName} for conversation ${conversationId}`);
          if (callback) callback({ success: false, error: "Unauthorized conversation access" });
          return;
        }

        const room = `conversation:${conversationId}`;
        socket.join(room);
        console.log(`[Socket.IO] Socket ${socket.id} (${user.displayName}) joined ${room}`);

        // Mark unread messages in this conversation as READ by this user
        const now = new Date();
        const unreadMessages = await Message.find({
          conversationId,
          sender: { $ne: user._id },
          status: { $in: ["sent", "delivered"] },
        });

        if (unreadMessages.length > 0) {
          const unreadIds = unreadMessages.map((m) => m._id);
          await Message.updateMany(
            { _id: { $in: unreadIds } },
            {
              $set: {
                status: "read",
                readAt: now,
              },
            }
          );

          // Ensure deliveredAt is set
          await Message.updateMany(
            { _id: { $in: unreadIds }, deliveredAt: { $exists: false } },
            { $set: { deliveredAt: now } }
          );

          await ConversationMembership.updateOne(
            { conversationId, userId: user._id },
            { $set: { unreadCount: 0, lastReadAt: now } }
          );

          io?.to(room).emit("messages_read", {
            conversationId,
            readAt: now,
            readBy: userIdStr,
            messageIds: unreadIds.map((id) => id.toString()),
          });
        }

        if (callback) callback({ success: true, room });
      } catch (err: any) {
        console.error("[Socket.IO] Error joining conversation:", err);
        if (callback) callback({ success: false, error: err.message });
      }
    });

    // 2. Leave Conversation Room
    socket.on("leave_conversation", (data: { conversationId: string }) => {
      if (data?.conversationId) {
        socket.leave(`conversation:${data.conversationId}`);
      }
    });

    // 3. Mark Conversation Read
    socket.on("mark_conversation_read", async (data: { conversationId: string }, callback?: (res: any) => void) => {
      try {
        const { conversationId } = data;
        if (!conversationId) return;

        const membership = await ConversationMembership.findOne({
          conversationId,
          userId: user._id,
        });

        if (!membership) {
          if (callback) callback({ success: false, error: "Unauthorized" });
          return;
        }

        const now = new Date();
        const unreadMessages = await Message.find({
          conversationId,
          sender: { $ne: user._id },
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

          await ConversationMembership.updateOne(
            { conversationId, userId: user._id },
            { $set: { unreadCount: 0, lastReadAt: now } }
          );

          io?.to(`conversation:${conversationId}`).emit("messages_read", {
            conversationId,
            readAt: now,
            readBy: userIdStr,
            messageIds: unreadIds.map((id) => id.toString()),
          });
        }

        if (callback) callback({ success: true });
      } catch (err: any) {
        if (callback) callback({ success: false, error: err.message });
      }
    });

    // 4. Real-time Message via Socket (Save in MongoDB before broadcast)
    socket.on("send_message", async (data: { conversationId: string; text: string }, callback?: (res: any) => void) => {
      try {
        const { conversationId, text } = data;
        if (!text || !text.trim()) {
          if (callback) callback({ success: false, error: "Empty message" });
          return;
        }

        const trimmed = text.trim();

        // Enforce membership
        const membership = await ConversationMembership.findOne({
          conversationId,
          userId: user._id,
        });

        if (!membership) {
          if (callback) callback({ success: false, error: "Unauthorized" });
          return;
        }

        // Determine recipient and their status
        const conversation = await Conversation.findById(conversationId);
        const recipientId = conversation?.participants.find(
          (p) => p.toString() !== user._id.toString()
        );

        let initialStatus: "sent" | "delivered" | "read" = "sent";
        let deliveredAt: Date | undefined = undefined;
        let readAt: Date | undefined = undefined;

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

        // Save in MongoDB first
        const savedMessage = await Message.create({
          conversationId,
          sender: user._id,
          senderFirebaseUid: user.firebaseUid,
          text: trimmed,
          status: initialStatus,
          isEdited: false,
          isDeletedForEveryone: false,
          deletedForUsers: [],
          deliveredAt,
          readAt,
        });

        // Update conversation
        await Conversation.findByIdAndUpdate(conversationId, {
          lastMessage: savedMessage._id,
          lastMessageText: trimmed,
          lastMessageAt: savedMessage.createdAt,
        });

        // Increment unread count for recipient if not already read
        if (initialStatus !== "read") {
          await ConversationMembership.updateMany(
            { conversationId, userId: { $ne: user._id } },
            { $inc: { unreadCount: 1 } }
          );
        }

        const timeStr = new Date(savedMessage.createdAt).toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        });

        const formatted = {
          id: savedMessage._id.toString(),
          conversationId,
          senderId: user._id.toString(),
          senderName: user.displayName,
          senderInitials: user.initials,
          text: trimmed,
          time: timeStr,
          createdAt: savedMessage.createdAt,
          status: savedMessage.status,
          isEdited: false,
          isDeletedForEveryone: false,
          deliveredAt: savedMessage.deliveredAt,
          readAt: savedMessage.readAt,
        };

        // Broadcast to conversation room
        io?.to(`conversation:${conversationId}`).emit("message_received", formatted);

        // Also notify recipient personal room for sidebar updates if not in room
        if (recipientId) {
          io?.to(`user:${recipientId.toString()}`).emit("conversation_updated", {
            conversationId,
            lastMessageText: trimmed,
            lastMessageTime: savedMessage.createdAt,
          });
        }

        io?.to(`conversation:${conversationId}`).emit("conversation_updated", {
          conversationId,
          lastMessageText: trimmed,
          lastMessageTime: savedMessage.createdAt,
        });

        if (callback) callback({ success: true, message: formatted });
      } catch (err: any) {
        console.error("[Socket.IO] send_message error:", err);
        if (callback) callback({ success: false, error: err.message });
      }
    });

    // 5. Edit Message via Socket
    socket.on("edit_message", async (data: { conversationId: string; messageId: string; text: string }, callback?: (res: any) => void) => {
      try {
        const { conversationId, messageId, text } = data;
        if (!text || !text.trim()) {
          if (callback) callback({ success: false, error: "Empty message text" });
          return;
        }

        const message = await Message.findById(messageId);
        if (!message) {
          if (callback) callback({ success: false, error: "Message not found" });
          return;
        }

        if (message.sender.toString() !== user._id.toString()) {
          if (callback) callback({ success: false, error: "Only the sender can edit this message" });
          return;
        }

        if (message.isDeletedForEveryone) {
          if (callback) callback({ success: false, error: "Cannot edit a deleted message" });
          return;
        }

        const trimmed = text.trim();
        const now = new Date();
        message.text = trimmed;
        message.isEdited = true;
        message.editedAt = now;
        await message.save();

        // Update conversation if this was the last message
        const conversation = await Conversation.findById(conversationId);
        if (conversation && conversation.lastMessage?.toString() === messageId) {
          conversation.lastMessageText = trimmed;
          await conversation.save();
        }

        const editPayload = {
          conversationId,
          messageId,
          text: trimmed,
          isEdited: true,
          editedAt: now,
        };

        io?.to(`conversation:${conversationId}`).emit("message_edited", editPayload);
        io?.to(`conversation:${conversationId}`).emit("conversation_updated", {
          conversationId,
          lastMessageText: trimmed,
          lastMessageTime: message.createdAt,
        });

        if (callback) callback({ success: true, message: editPayload });
      } catch (err: any) {
        console.error("[Socket.IO] edit_message error:", err);
        if (callback) callback({ success: false, error: err.message });
      }
    });

    // 6. Delete Message via Socket
    socket.on("delete_message", async (data: { conversationId: string; messageId: string; deleteType: "everyone" | "me" }, callback?: (res: any) => void) => {
      try {
        const { conversationId, messageId, deleteType } = data;
        const message = await Message.findById(messageId);
        if (!message) {
          if (callback) callback({ success: false, error: "Message not found" });
          return;
        }

        if (deleteType === "everyone") {
          if (message.sender.toString() !== user._id.toString()) {
            if (callback) callback({ success: false, error: "Only the sender can delete for everyone" });
            return;
          }

          message.isDeletedForEveryone = true;
          message.text = "This message was deleted";
          await message.save();

          const conversation = await Conversation.findById(conversationId);
          if (conversation && conversation.lastMessage?.toString() === messageId) {
            conversation.lastMessageText = "This message was deleted";
            await conversation.save();
          }

          const deletePayload = {
            conversationId,
            messageId,
            isDeletedForEveryone: true,
            text: "This message was deleted",
          };

          io?.to(`conversation:${conversationId}`).emit("message_deleted", deletePayload);
          io?.to(`conversation:${conversationId}`).emit("conversation_updated", {
            conversationId,
            lastMessageText: "This message was deleted",
            lastMessageTime: message.createdAt,
          });

          if (callback) callback({ success: true, deleteType: "everyone" });
        } else {
          // Delete for me
          if (!message.deletedForUsers.some((uId) => uId.toString() === user._id.toString())) {
            message.deletedForUsers.push(user._id);
            await message.save();
          }

          socket.emit("message_deleted_for_me", {
            conversationId,
            messageId,
          });

          if (callback) callback({ success: true, deleteType: "me" });
        }
      } catch (err: any) {
        console.error("[Socket.IO] delete_message error:", err);
        if (callback) callback({ success: false, error: err.message });
      }
    });

    // 7. Disconnect Handling
    socket.on("disconnect", async () => {
      console.log(`[Socket.IO] Disconnected: ${user.displayName} - Socket ${socket.id}`);

      const userSet = userSockets.get(userIdStr);
      if (userSet) {
        userSet.delete(socket.id);
        if (userSet.size === 0) {
          userSockets.delete(userIdStr);
          await User.findByIdAndUpdate(user._id, {
            online: false,
            lastSeen: new Date(),
          });
          socket.broadcast.emit("user_status_changed", {
            userId: userIdStr,
            online: false,
          });
        }
      }
    });
  });

  return io;
}
