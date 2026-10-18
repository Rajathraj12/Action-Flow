import { Server as HttpServer } from "http";
import { Server as SocketIOServer, Socket } from "socket.io";
import mongoose from "mongoose";
import { verifyFirebaseIdToken } from "../config/firebase.js";
import { User, IUser } from "../models/User.js";
import { ConversationMembership } from "../models/ConversationMembership.js";
import { Conversation } from "../models/Conversation.js";
import { Message } from "../models/Message.js";
import { WorkspaceMember } from "../models/WorkspaceMember.js";
import { sendMessageService, markConversationReadService } from "../services/messageService.js";

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

export function evictUserFromRoom(roomName: string, userId: string): void {
  if (!io) return;
  const userSocketIds = userSockets.get(userId.toString());
  if (userSocketIds) {
    for (const sId of userSocketIds) {
      const socket = io.sockets.sockets.get(sId);
      if (socket) {
        socket.leave(roomName);
      }
    }
  }
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

      // Verify token via Firebase Admin / dev token verifier
      const decoded = await verifyFirebaseIdToken(token);

      // Find or upsert user in MongoDB based on verified firebaseUid or email
      let user = await User.findOne({
        $or: [{ firebaseUid: decoded.uid }, { email: decoded.email.toLowerCase() }],
      });
      if (user) {
        if (user.firebaseUid !== decoded.uid) {
          user.firebaseUid = decoded.uid;
          await user.save();
        }
      } else {
        user = await User.create({
          firebaseUid: decoded.uid,
          email: decoded.email.toLowerCase(),
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

  io.on("connection", (socket: Socket) => {
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

    // ==========================================
    // 1. Join Conversation Room
    // Client to server: "conversation:join" (or "join_conversation")
    // ==========================================
    const handleJoinConversation = async (
      data: { conversationId: string; workspaceId?: string },
      callback?: (res: any) => void
    ) => {
      try {
        const { conversationId } = data || {};
        if (!conversationId || !mongoose.Types.ObjectId.isValid(conversationId)) {
          if (callback) callback({ success: false, error: "Valid conversationId required" });
          return;
        }

        // Fetch conversation
        const conversation = await Conversation.findById(conversationId);
        if (!conversation) {
          if (callback) callback({ success: false, error: "Conversation not found" });
          return;
        }

        // Security check: must be a participant
        const isParticipant = conversation.participants.some(
          (p) => p.toString() === user._id.toString()
        );
        if (!isParticipant) {
          console.warn(`[Socket.IO] Unauthorized join by ${user.displayName} for conv ${conversationId}`);
          if (callback) callback({ success: false, error: "Unauthorized: not a conversation participant" });
          return;
        }

        // Security check: if conversation has workspaceId, must be an active workspace member
        if (conversation.workspaceId) {
          const isMember = await WorkspaceMember.findOne({
            workspaceId: conversation.workspaceId,
            userId: user._id,
            status: "ACTIVE",
          });
          if (!isMember) {
            if (callback) callback({ success: false, error: "Unauthorized: not a workspace member" });
            return;
          }
        }

        // Security check: must have active conversation membership (not LEFT or REMOVED)
        const membership = await ConversationMembership.findOne({
          conversationId,
          userId: user._id,
        });

        if (membership && membership.status !== "ACTIVE") {
          if (callback) callback({ success: false, error: "You are not an active member of this conversation" });
          return;
        }

        const room = `conversation:${conversationId}`;
        socket.join(room);
        console.log(`[Socket.IO] Socket ${socket.id} (${user.displayName}) joined room ${room}`);

        // Mark previously received messages as read
        if (conversation.workspaceId) {
          await markConversationReadService(conversation._id, conversation.workspaceId, user._id);
        }

        if (callback) callback({ success: true, room });
      } catch (err: any) {
        console.error("[Socket.IO] Error in handleJoinConversation:", err);
        if (callback) callback({ success: false, error: err.message || "Failed to join room" });
      }
    };

    socket.on("conversation:join", handleJoinConversation);
    socket.on("join_conversation", handleJoinConversation);

    // ==========================================
    // 2. Leave Conversation Room
    // Client to server: "conversation:leave" (or "leave_conversation")
    // ==========================================
    const handleLeaveConversation = (
      data: { conversationId: string },
      callback?: (res: any) => void
    ) => {
      if (data?.conversationId) {
        socket.leave(`conversation:${data.conversationId}`);
      }
      if (callback) callback({ success: true });
    };

    socket.on("conversation:leave", handleLeaveConversation);
    socket.on("leave_conversation", handleLeaveConversation);

    // ==========================================
    // 2b. Join & Leave Workspace Room (Phase 4 Tasks)
    // ==========================================
    const handleJoinWorkspace = async (
      data: { workspaceId: string },
      callback?: (res: any) => void
    ) => {
      try {
        const { workspaceId } = data || {};
        if (!workspaceId || !mongoose.Types.ObjectId.isValid(workspaceId)) {
          if (callback) callback({ success: false, error: "Valid workspaceId required" });
          return;
        }

        const isMember = await WorkspaceMember.findOne({
          workspaceId,
          userId: user._id,
          status: "ACTIVE",
        });

        if (!isMember) {
          if (callback) callback({ success: false, error: "Unauthorized: not an active member of this workspace" });
          return;
        }

        socket.join(`workspace:${workspaceId}`);
        if (callback) callback({ success: true });
      } catch (err: any) {
        if (callback) callback({ success: false, error: err.message });
      }
    };

    const handleLeaveWorkspace = (
      data: { workspaceId: string },
      callback?: (res: any) => void
    ) => {
      if (data?.workspaceId) {
        socket.leave(`workspace:${data.workspaceId}`);
      }
      if (callback) callback({ success: true });
    };

    socket.on("workspace:join", handleJoinWorkspace);
    socket.on("join_workspace", handleJoinWorkspace);
    socket.on("workspace:leave", handleLeaveWorkspace);
    socket.on("leave_workspace", handleLeaveWorkspace);

    // ==========================================
    // 3. Send Message via Socket
    // Client to server: "message:send" (or "send_message")
    // ==========================================
    const handleSendMessage = async (
      data: { conversationId: string; text: string; workspaceId?: string },
      callback?: (res: any) => void
    ) => {
      try {
        const { conversationId, text } = data || {};
        if (!conversationId || !mongoose.Types.ObjectId.isValid(conversationId)) {
          if (callback) callback({ success: false, error: "Valid conversationId required" });
          return;
        }

        if (!text || typeof text !== "string" || !text.trim()) {
          if (callback) callback({ success: false, error: "Empty message text" });
          return;
        }

        // Resolve conversation and workspace
        const conversation = await Conversation.findById(conversationId);
        if (!conversation) {
          if (callback) callback({ success: false, error: "Conversation not found" });
          return;
        }

        const workspaceId = conversation.workspaceId || data.workspaceId;
        if (!workspaceId) {
          if (callback) callback({ success: false, error: "Workspace context missing for conversation" });
          return;
        }

        // Delegate persistence and real-time broadcast to unified service
        const messagePayload = await sendMessageService({
          conversationId: conversation._id,
          workspaceId,
          senderId: user._id,
          senderFirebaseUid: user.firebaseUid,
          senderDisplayName: user.displayName,
          senderInitials: user.initials,
          text,
        });

        if (callback) callback({ success: true, message: messagePayload });
      } catch (err: any) {
        console.error("[Socket.IO] Error in handleSendMessage:", err);
        if (callback) callback({ success: false, error: err.message || "Failed to send message" });
      }
    };

    socket.on("message:send", handleSendMessage);
    socket.on("send_message", handleSendMessage);

    // ==========================================
    // 4. Mark Conversation Read
    // Client to server: "conversation:read" (or "mark_conversation_read")
    // ==========================================
    const handleMarkConversationRead = async (
      data: { conversationId: string; workspaceId?: string },
      callback?: (res: any) => void
    ) => {
      try {
        const { conversationId } = data || {};
        if (!conversationId || !mongoose.Types.ObjectId.isValid(conversationId)) {
          if (callback) callback({ success: false, error: "Valid conversationId required" });
          return;
        }

        const conversation = await Conversation.findById(conversationId);
        if (!conversation) {
          if (callback) callback({ success: false, error: "Conversation not found" });
          return;
        }

        const workspaceId = conversation.workspaceId || data.workspaceId;
        if (!workspaceId) {
          if (callback) callback({ success: false, error: "Workspace context required" });
          return;
        }

        const result = await markConversationReadService(conversation._id, workspaceId, user._id);
        if (callback) callback({ success: true, count: result.count });
      } catch (err: any) {
        console.error("[Socket.IO] Error in handleMarkConversationRead:", err);
        if (callback) callback({ success: false, error: err.message || "Failed to mark read" });
      }
    };

    socket.on("conversation:read", handleMarkConversationRead);
    socket.on("mark_conversation_read", handleMarkConversationRead);

    // ==========================================
    // 5. Edit Message (Sender only)
    // ==========================================
    socket.on(
      "edit_message",
      async (
        data: { conversationId: string; messageId: string; text: string },
        callback?: (res: any) => void
      ) => {
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

          const conversation = await Conversation.findById(conversationId);
          if (conversation && (conversation.lastMessage?.toString() === messageId || conversation.lastMessageId?.toString() === messageId)) {
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
          io?.to(`conversation:${conversationId}`).emit("conversation:updated", {
            conversationId,
            lastMessageText: trimmed,
            lastMessageTime: message.createdAt,
          });
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
      }
    );

    // ==========================================
    // 6. Delete Message
    // ==========================================
    socket.on(
      "delete_message",
      async (
        data: { conversationId: string; messageId: string; deleteType: "everyone" | "me" },
        callback?: (res: any) => void
      ) => {
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
            if (conversation && (conversation.lastMessage?.toString() === messageId || conversation.lastMessageId?.toString() === messageId)) {
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
            io?.to(`conversation:${conversationId}`).emit("conversation:updated", {
              conversationId,
              lastMessageText: "This message was deleted",
              lastMessageTime: message.createdAt,
            });

            if (callback) callback({ success: true, deleteType: "everyone" });
          } else {
            if (!message.deletedForUsers.some((uId) => uId.toString() === user._id.toString())) {
              message.deletedForUsers.push(user._id);
              await message.save();
            }

            socket.emit("message_deleted_for_me", { conversationId, messageId });
            if (callback) callback({ success: true, deleteType: "me" });
          }
        } catch (err: any) {
          console.error("[Socket.IO] delete_message error:", err);
          if (callback) callback({ success: false, error: err.message });
        }
      }
    );

    // ==========================================
    // 7. Disconnect Handling
    // ==========================================
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
          socket.broadcast.emit("presence:updated", { userId: userIdStr, online: false });
          socket.broadcast.emit("user_status_changed", { userId: userIdStr, online: false });
        }
      }
    });

    // ==========================================
    // 8. Async Background Processing on Connect
    // ==========================================
    (async () => {
      try {
        await User.findByIdAndUpdate(user._id, { online: true });
        socket.broadcast.emit("presence:updated", { userId: userIdStr, online: true });
        socket.broadcast.emit("user_status_changed", { userId: userIdStr, online: true });

        // Mark pending messages as delivered
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
      } catch (err) {
        console.warn("[Socket.IO] Error in connection async background task:", err);
      }
    })();
  });

  return io;
}
