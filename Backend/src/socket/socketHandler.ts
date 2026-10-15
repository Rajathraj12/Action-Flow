import { Server as HttpServer } from "http";
import { Server as SocketIOServer, Socket } from "socket.io";
import { verifyFirebaseIdToken } from "../config/firebase.js";
import { User, IUser } from "../models/User.js";
import { ConversationMembership } from "../models/ConversationMembership.js";
import { Conversation } from "../models/Conversation.js";
import { Message } from "../models/Message.js";

let io: SocketIOServer | null = null;

export function getIO(): SocketIOServer {
  if (!io) {
    throw new Error("Socket.IO has not been initialized yet");
  }
  return io;
}

export function initSocket(server: HttpServer): SocketIOServer {
  io = new SocketIOServer(server, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"],
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

    console.log(`[Socket.IO] Connected: ${user.displayName} (${user.email}) - Socket ${socket.id}`);

    // Update online status in database
    await User.findByIdAndUpdate(user._id, { online: true });
    socket.broadcast.emit("user_status_changed", {
      userId: user._id.toString(),
      online: true,
    });

    // 1. Join Conversation Room with membership verification
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

    // 3. Real-time Message via Socket (Save in MongoDB before broadcast)
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

        // Save in MongoDB first
        const savedMessage = await Message.create({
          conversationId,
          sender: user._id,
          senderFirebaseUid: user.firebaseUid,
          text: trimmed,
          status: "sent",
        });

        // Update conversation
        await Conversation.findByIdAndUpdate(conversationId, {
          lastMessage: savedMessage._id,
          lastMessageText: trimmed,
          lastMessageAt: savedMessage.createdAt,
        });

        // Increment unread count for other members
        await ConversationMembership.updateMany(
          { conversationId, userId: { $ne: user._id } },
          { $inc: { unreadCount: 1 } }
        );

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
        };

        // Broadcast to authorized conversation room
        io?.to(`conversation:${conversationId}`).emit("message_received", formatted);
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

    // 4. Disconnect Handling
    socket.on("disconnect", async () => {
      console.log(`[Socket.IO] Disconnected: ${user.displayName} - Socket ${socket.id}`);
      // Check if user has other active sockets before marking offline
      const sockets = await io?.fetchSockets();
      const stillActive = sockets?.some((s) => (s.data?.user as IUser)?._id?.toString() === user._id.toString());

      if (!stillActive) {
        await User.findByIdAndUpdate(user._id, {
          online: false,
          lastSeen: new Date(),
        });
        socket.broadcast.emit("user_status_changed", {
          userId: user._id.toString(),
          online: false,
        });
      }
    });
  });

  return io;
}
