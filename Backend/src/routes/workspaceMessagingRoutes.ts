import { Router, Response } from "express";
import mongoose, { Types } from "mongoose";
import { requireAuth, AuthenticatedRequest } from "../middleware/auth.js";
import { requireWorkspaceMember, WorkspaceAuthenticatedRequest } from "../middleware/rbac.js";
import { Conversation, getDirectDmKey } from "../models/Conversation.js";
import { ConversationMembership } from "../models/ConversationMembership.js";
import { Message } from "../models/Message.js";
import { WorkspaceMember } from "../models/WorkspaceMember.js";
import { User, IUser } from "../models/User.js";
import { sendMessageService, markConversationReadService } from "../services/messageService.js";
import { isUserOnline, getIO, evictUserFromRoom } from "../socket/socketHandler.js";

const router = Router();

// ==========================================
// A. SEARCH WORKSPACE COLLEAGUES
// GET /api/workspaces/:workspaceId/users?search=ankit
// ==========================================
router.get(
  "/:workspaceId/users",
  requireAuth,
  requireWorkspaceMember,
  async (req: WorkspaceAuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const workspaceId = req.workspace!._id;
      const currentUserId = req.user!._id;
      const searchQuery = (req.query.search as string || "").trim();
      const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);

      // 1. Find all active members in this workspace excluding the current user
      const activeMemberships = await WorkspaceMember.find({
        workspaceId,
        userId: { $ne: currentUserId },
        status: "ACTIVE",
      }).select("userId role");

      const memberUserIds = activeMemberships.map((m) => m.userId);
      const memberRoleMap = new Map(activeMemberships.map((m) => [m.userId.toString(), m.role]));

      // 2. Query User profiles matching search
      const userFilter: any = {
        _id: { $in: memberUserIds },
      };

      if (searchQuery) {
        userFilter.$or = [
          { displayName: { $regex: searchQuery, $options: "i" } },
          { email: { $regex: searchQuery, $options: "i" } },
        ];
      }

      const users = await User.find(userFilter)
        .select("_id displayName email initials avatarUrl online lastSeen")
        .limit(limit)
        .lean();

      // Safe colleague profile response
      const safeUsers = users.map((u) => {
        const uId = u._id.toString();
        const online = isUserOnline(uId) || !!u.online;
        return {
          id: uId,
          _id: uId,
          displayName: u.displayName,
          email: u.email,
          initials: u.initials,
          avatarUrl: u.avatarUrl,
          role: memberRoleMap.get(uId) || "MEMBER",
          online,
          lastSeen: u.lastSeen,
        };
      });

      res.json({ users: safeUsers });
    } catch (error: any) {
      console.error("[WorkspaceMessaging] Failed to search users:", error);
      res.status(500).json({ error: error?.message || "Failed to search workspace colleagues" });
    }
  }
);

// ==========================================
// B. LIST CONVERSATIONS (DIRECT & GROUP)
// GET /api/workspaces/:workspaceId/conversations
// ==========================================
router.get(
  "/:workspaceId/conversations",
  requireAuth,
  requireWorkspaceMember,
  async (req: WorkspaceAuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const workspaceId = req.workspace!._id;
      const currentUserId = req.user!._id;

      // 1. Find active memberships for this user in this workspace
      const memberships = await ConversationMembership.find({
        workspaceId,
        userId: currentUserId,
        status: { $ne: "REMOVED" },
      }).lean();

      const activeMemberships = memberships.filter((m) => m.status === "ACTIVE");
      const membershipMap = new Map(memberships.map((m) => [m.conversationId.toString(), m]));

      // 2. Find conversations where user is an active participant in this workspace
      const conversations = await Conversation.find({
        workspaceId,
        participants: currentUserId,
      })
        .populate<{ participants: IUser[] }>(
          "participants",
          "displayName email initials avatarUrl role online lastSeen"
        )
        .sort({ lastMessageAt: -1, updatedAt: -1 })
        .lean();

      // Collect participant user IDs to query workspace roles
      const allUserIds = new Set<string>();
      for (const conv of conversations) {
        for (const p of conv.participants) {
          allUserIds.add(p._id.toString());
        }
      }

      const workspaceRoles = await WorkspaceMember.find({
        workspaceId,
        userId: { $in: Array.from(allUserIds) },
        status: "ACTIVE",
      }).select("userId role");

      const roleMap = new Map(workspaceRoles.map((r) => [r.userId.toString(), r.role]));

      // Format conversations (filtering out any conversations where membership is not ACTIVE)
      const formatted = conversations
        .filter((conv) => {
          const mem = membershipMap.get(conv._id.toString());
          if (mem) {
            return mem.status === "ACTIVE";
          }
          // Fallback auto-healing if membership was not yet created
          return true;
        })
        .map((conv) => {
          const convId = conv._id.toString();
          const membership = membershipMap.get(convId);
          const isGroup = conv.type === "GROUP" || conv.type === "group";

          if (isGroup) {
            const groupInitials = (conv.name || "Group")
              .split(" ")
              .map((w) => w[0])
              .join("")
              .slice(0, 2)
              .toUpperCase();

            const safeParticipants = conv.participants.map((p) => {
              const pId = p._id.toString();
              return {
                id: pId,
                displayName: p.displayName,
                email: p.email,
                initials: p.initials,
                avatarUrl: p.avatarUrl,
                role: roleMap.get(pId) || "MEMBER",
                online: isUserOnline(pId) || !!p.online,
              };
            });

            return {
              id: convId,
              workspaceId: workspaceId.toString(),
              type: "GROUP" as const,
              name: conv.name || "Unnamed Group",
              description: conv.description || "",
              role: "Group Chat",
              initials: groupInitials,
              online: false,
              unread: membership?.unreadCount || 0,
              lastMessageText: conv.lastMessageText || "",
              lastMessageTime: conv.lastMessageAt || conv.createdAt,
              lastMessageAt: conv.lastMessageAt || conv.createdAt,
              lastMessageId: conv.lastMessageId ? conv.lastMessageId.toString() : conv.lastMessage?.toString(),
              createdBy: conv.createdBy ? conv.createdBy.toString() : undefined,
              admins: (conv.admins || []).map((a) => a.toString()),
              myGroupRole: membership?.role || "MEMBER",
              participantCount: conv.participants.length,
              participants: safeParticipants,
              otherUser: null,
            };
          }

          // Direct conversation
          const otherUser =
            conv.participants.find((p) => p._id.toString() !== currentUserId.toString()) ||
            conv.participants[0];

          const otherUserIdStr = otherUser ? otherUser._id.toString() : "";
          const online = isUserOnline(otherUserIdStr) || (otherUser ? !!otherUser.online : false);
          const role = otherUserIdStr ? roleMap.get(otherUserIdStr) || "MEMBER" : "MEMBER";

          return {
            id: convId,
            workspaceId: workspaceId.toString(),
            type: "DIRECT" as const,
            name: otherUser ? otherUser.displayName : "Direct Conversation",
            role,
            initials: otherUser ? otherUser.initials : "U",
            online,
            unread: membership?.unreadCount || 0,
            lastMessageText: conv.lastMessageText || "",
            lastMessageTime: conv.lastMessageAt || conv.createdAt,
            lastMessageAt: conv.lastMessageAt || conv.createdAt,
            lastMessageId: conv.lastMessageId ? conv.lastMessageId.toString() : conv.lastMessage?.toString(),
            otherUser: otherUser
              ? {
                  id: otherUserIdStr,
                  displayName: otherUser.displayName,
                  email: otherUser.email,
                  initials: otherUser.initials,
                  avatarUrl: otherUser.avatarUrl,
                  role,
                  online,
                }
              : null,
          };
        });

      res.json({ conversations: formatted });
    } catch (error: any) {
      console.error("[WorkspaceMessaging] Failed to list conversations:", error);
      res.status(500).json({ error: error?.message || "Failed to list conversations" });
    }
  }
);

// ==========================================
// C. FIND OR CREATE A DIRECT CONVERSATION
// POST /api/workspaces/:workspaceId/conversations/direct
// Body: { participantId: "TARGET_USER_OBJECT_ID" }
// ==========================================
router.post(
  "/:workspaceId/conversations/direct",
  requireAuth,
  requireWorkspaceMember,
  async (req: WorkspaceAuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const workspaceId = req.workspace!._id;
      const currentUserId = req.user!._id;
      const { participantId } = req.body;

      if (!participantId) {
        res.status(400).json({ error: "participantId is required" });
        return;
      }

      if (!mongoose.Types.ObjectId.isValid(participantId)) {
        res.status(400).json({ error: "Invalid participantId format" });
        return;
      }

      // Reject self-messaging
      if (participantId.toString() === currentUserId.toString()) {
        res.status(400).json({ error: "Cannot start a direct conversation with yourself" });
        return;
      }

      // Verify target user exists
      const targetUser = await User.findById(participantId);
      if (!targetUser) {
        res.status(404).json({ error: "Target participant user not found" });
        return;
      }

      // Verify target user is an active member of THIS workspace
      const targetMembership = await WorkspaceMember.findOne({
        workspaceId,
        userId: targetUser._id,
        status: "ACTIVE",
      });

      if (!targetMembership) {
        res.status(403).json({
          error: "Target user is not an active member of this workspace",
        });
        return;
      }

      // Calculate deterministic dmKey
      const dmKey = getDirectDmKey(workspaceId, currentUserId, targetUser._id);

      // Check if conversation already exists by dmKey
      let existingConv = await Conversation.findOne({ dmKey }).populate<{ participants: IUser[] }>(
        "participants",
        "displayName email initials avatarUrl role online lastSeen"
      );

      // Fallback check if dmKey wasn't set on legacy record
      if (!existingConv) {
        existingConv = await Conversation.findOne({
          workspaceId,
          type: { $in: ["DIRECT", "direct"] },
          participants: { $all: [currentUserId, targetUser._id], $size: 2 },
        }).populate<{ participants: IUser[] }>(
          "participants",
          "displayName email initials avatarUrl role online lastSeen"
        );

        if (existingConv && !existingConv.dmKey) {
          existingConv.dmKey = dmKey;
          await existingConv.save();
        }
      }

      if (existingConv) {
        // Ensure ConversationMembership exists for both
        await ConversationMembership.updateOne(
          { conversationId: existingConv._id, userId: currentUserId },
          { $setOnInsert: { workspaceId, firebaseUid: req.user!.firebaseUid, unreadCount: 0 } },
          { upsert: true }
        );
        await ConversationMembership.updateOne(
          { conversationId: existingConv._id, userId: targetUser._id },
          { $setOnInsert: { workspaceId, firebaseUid: targetUser.firebaseUid, unreadCount: 0 } },
          { upsert: true }
        );

        const online = isUserOnline(targetUser._id.toString()) || !!targetUser.online;

        res.status(200).json({
          conversation: {
            id: existingConv._id.toString(),
            workspaceId: workspaceId.toString(),
            type: "DIRECT",
            name: targetUser.displayName,
            role: targetMembership.role,
            initials: targetUser.initials,
            online,
            unread: 0,
            lastMessageText: existingConv.lastMessageText || "",
            lastMessageTime: existingConv.lastMessageAt || existingConv.createdAt,
            otherUser: {
              id: targetUser._id.toString(),
              displayName: targetUser.displayName,
              email: targetUser.email,
              initials: targetUser.initials,
              avatarUrl: targetUser.avatarUrl,
              role: targetMembership.role,
              online,
            },
          },
          isExisting: true,
        });
        return;
      }

      // Create new conversation enforcing unique dmKey
      let newConv;
      try {
        newConv = await Conversation.create({
          workspaceId,
          type: "DIRECT",
          participants: [currentUserId, targetUser._id],
          dmKey,
          lastMessageText: "",
          lastMessageAt: new Date(),
        });
      } catch (err: any) {
        // Catch race condition E11000 duplicate key
        if (err.code === 11000) {
          const raceConv = await Conversation.findOne({ dmKey });
          if (raceConv) {
            res.status(200).json({
              conversation: {
                id: raceConv._id.toString(),
                workspaceId: workspaceId.toString(),
                name: targetUser.displayName,
                role: targetMembership.role,
                initials: targetUser.initials,
                online: isUserOnline(targetUser._id.toString()) || !!targetUser.online,
                unread: 0,
                lastMessageText: raceConv.lastMessageText || "",
                lastMessageTime: raceConv.lastMessageAt || raceConv.createdAt,
                otherUser: {
                  id: targetUser._id.toString(),
                  displayName: targetUser.displayName,
                  email: targetUser.email,
                  initials: targetUser.initials,
                  role: targetMembership.role,
                  online: isUserOnline(targetUser._id.toString()) || !!targetUser.online,
                },
              },
              isExisting: true,
            });
            return;
          }
        }
        throw err;
      }

      // Create memberships for both participants
      await ConversationMembership.create([
        {
          conversationId: newConv._id,
          workspaceId,
          userId: currentUserId,
          firebaseUid: req.user!.firebaseUid,
          unreadCount: 0,
          lastReadAt: new Date(),
        },
        {
          conversationId: newConv._id,
          workspaceId,
          userId: targetUser._id,
          firebaseUid: targetUser.firebaseUid,
          unreadCount: 0,
          lastReadAt: new Date(),
        },
      ]);

      const online = isUserOnline(targetUser._id.toString()) || !!targetUser.online;

      res.status(201).json({
        conversation: {
          id: newConv._id.toString(),
          workspaceId: workspaceId.toString(),
          type: "DIRECT",
          name: targetUser.displayName,
          role: targetMembership.role,
          initials: targetUser.initials,
          online,
          unread: 0,
          lastMessageText: "",
          lastMessageTime: newConv.createdAt,
          otherUser: {
            id: targetUser._id.toString(),
            displayName: targetUser.displayName,
            email: targetUser.email,
            initials: targetUser.initials,
            role: targetMembership.role,
            online,
          },
        },
        isExisting: false,
      });
    } catch (error: any) {
      console.error("[WorkspaceMessaging] Failed to create direct conversation:", error);
      res.status(500).json({ error: error?.message || "Failed to create direct conversation" });
    }
  }
);

// ==========================================
// D. CREATE A GROUP CONVERSATION (Phase 3)
// POST /api/workspaces/:workspaceId/conversations/group
// Body: { name, description?, participantIds: [] }
// ==========================================
router.post(
  "/:workspaceId/conversations/group",
  requireAuth,
  requireWorkspaceMember,
  async (req: WorkspaceAuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const workspaceId = req.workspace!._id;
      const currentUserId = req.user!._id;
      const { name, description = "", participantIds = [] } = req.body;

      if (!name || typeof name !== "string" || name.trim().length < 2) {
        res.status(400).json({ error: "Group name must be at least 2 characters." });
        return;
      }

      const trimmedName = name.trim();
      if (trimmedName.length > 100) {
        res.status(400).json({ error: "Group name cannot exceed 100 characters." });
        return;
      }

      if (!Array.isArray(participantIds)) {
        res.status(400).json({ error: "participantIds must be an array of user IDs." });
        return;
      }

      // Automatically include creator in participants
      const rawIds = [...participantIds, currentUserId.toString()];
      const uniqueIds = Array.from(new Set(rawIds));

      // Validate all IDs are valid ObjectIds
      for (const id of uniqueIds) {
        if (!mongoose.Types.ObjectId.isValid(id)) {
          res.status(400).json({ error: `Invalid participant ID format: ${id}` });
          return;
        }
      }

      if (uniqueIds.length < 2) {
        res.status(400).json({ error: "A group conversation requires at least 2 participants." });
        return;
      }

      const objectIds = uniqueIds.map((id) => new Types.ObjectId(id));

      // Verify all participants are ACTIVE members of this workspace
      const activeMembers = await WorkspaceMember.find({
        workspaceId,
        userId: { $in: objectIds },
        status: "ACTIVE",
      });

      if (activeMembers.length !== objectIds.length) {
        res.status(400).json({
          error: "One or more participants are not active members of this workspace.",
        });
        return;
      }

      // Create group conversation (dmKey is deliberately omitted for group chats)
      const groupConv = await Conversation.create({
        workspaceId,
        type: "GROUP",
        name: trimmedName,
        description: description ? description.trim().slice(0, 500) : "",
        participants: objectIds,
        createdBy: currentUserId,
        admins: [currentUserId],
        lastMessageText: "",
        lastMessageAt: new Date(),
      });

      // Create memberships for all participants
      const membershipDocs = objectIds.map((uId) => {
        const isCreator = uId.toString() === currentUserId.toString();
        return {
          conversationId: groupConv._id,
          workspaceId,
          userId: uId,
          firebaseUid: isCreator ? req.user!.firebaseUid : "workspace-member",
          role: isCreator ? ("GROUP_ADMIN" as const) : ("MEMBER" as const),
          status: "ACTIVE" as const,
          unreadCount: 0,
          joinedAt: new Date(),
          lastReadAt: new Date(),
        };
      });

      await ConversationMembership.insertMany(membershipDocs);

      // Populate participants for response
      const populatedConv = await Conversation.findById(groupConv._id).populate<{
        participants: IUser[];
      }>("participants", "displayName email initials avatarUrl role online lastSeen");

      const safeParticipants = (populatedConv?.participants || []).map((p) => {
        const pId = p._id.toString();
        const isAdmin = pId === currentUserId.toString();
        return {
          id: pId,
          displayName: p.displayName,
          email: p.email,
          initials: p.initials,
          avatarUrl: p.avatarUrl,
          groupRole: isAdmin ? "GROUP_ADMIN" : "MEMBER",
          online: isUserOnline(pId) || !!p.online,
        };
      });

      // Notify participants via Socket.IO
      try {
        const io = getIO();
        if (io) {
          const payload = {
            conversationId: groupConv._id.toString(),
            workspaceId: workspaceId.toString(),
            type: "GROUP",
            name: trimmedName,
            description: groupConv.description,
            participantCount: objectIds.length,
            createdAt: groupConv.createdAt,
          };
          for (const uId of uniqueIds) {
            io.to(`user:${uId}`).emit("conversation:updated", payload);
            io.to(`user:${uId}`).emit("conversation_updated", payload);
          }
        }
      } catch {
        // Socket emission skipped
      }

      res.status(201).json({
        conversation: {
          id: groupConv._id.toString(),
          workspaceId: workspaceId.toString(),
          type: "GROUP",
          name: groupConv.name,
          description: groupConv.description,
          participants: safeParticipants,
          participantCount: objectIds.length,
          createdBy: currentUserId.toString(),
          admins: [currentUserId.toString()],
          myGroupRole: "GROUP_ADMIN",
          unread: 0,
          lastMessageText: "",
          lastMessageTime: groupConv.createdAt,
        },
      });
    } catch (error: any) {
      console.error("[WorkspaceMessaging] Failed to create group:", error);
      res.status(500).json({ error: error?.message || "Failed to create group conversation" });
    }
  }
);

// ==========================================
// E. RETRIEVE GROUP DETAILS
// GET /api/workspaces/:workspaceId/conversations/:conversationId
// ==========================================
router.get(
  "/:workspaceId/conversations/:conversationId",
  requireAuth,
  requireWorkspaceMember,
  async (req: WorkspaceAuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const workspaceId = req.workspace!._id;
      const conversationId = req.params.conversationId;
      const currentUserId = req.user!._id;

      if (!mongoose.Types.ObjectId.isValid(conversationId)) {
        res.status(400).json({ error: "Invalid conversation ID" });
        return;
      }

      const conversation = await Conversation.findOne({
        _id: conversationId,
        workspaceId,
      }).populate<{ participants: IUser[] }>(
        "participants",
        "displayName email initials avatarUrl role online lastSeen"
      );

      if (!conversation) {
        res.status(404).json({ error: "Conversation not found in this workspace" });
        return;
      }

      // Check caller's active membership
      const membership = await ConversationMembership.findOne({
        conversationId,
        userId: currentUserId,
      });

      if (!membership || membership.status !== "ACTIVE") {
        res.status(403).json({ error: "Access denied. You are not an active member of this conversation." });
        return;
      }

      // Fetch all memberships for active participants to get group roles
      const allMemberships = await ConversationMembership.find({
        conversationId,
        status: "ACTIVE",
      }).lean();

      const memberRoleMap = new Map(allMemberships.map((m) => [m.userId.toString(), m.role]));

      const safeParticipants = conversation.participants
        .filter((p) => memberRoleMap.has(p._id.toString()))
        .map((p) => {
          const pId = p._id.toString();
          return {
            id: pId,
            displayName: p.displayName,
            email: p.email,
            initials: p.initials,
            avatarUrl: p.avatarUrl,
            groupRole: memberRoleMap.get(pId) || "MEMBER",
            online: isUserOnline(pId) || !!p.online,
          };
        });

      res.json({
        conversation: {
          id: conversation._id.toString(),
          workspaceId: workspaceId.toString(),
          type: conversation.type,
          name: conversation.name,
          description: conversation.description,
          createdBy: conversation.createdBy?.toString(),
          admins: (conversation.admins || []).map((a) => a.toString()),
          myGroupRole: membership.role,
          participants: safeParticipants,
          participantCount: safeParticipants.length,
          lastMessageText: conversation.lastMessageText || "",
          lastMessageTime: conversation.lastMessageAt || conversation.createdAt,
        },
      });
    } catch (error: any) {
      console.error("[WorkspaceMessaging] Failed to get conversation details:", error);
      res.status(500).json({ error: error?.message || "Failed to get conversation details" });
    }
  }
);

// ==========================================
// F. UPDATE GROUP METADATA (Admins only)
// PATCH /api/workspaces/:workspaceId/conversations/:conversationId
// Body: { name?, description? }
// ==========================================
router.patch(
  "/:workspaceId/conversations/:conversationId",
  requireAuth,
  requireWorkspaceMember,
  async (req: WorkspaceAuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const workspaceId = req.workspace!._id;
      const conversationId = req.params.conversationId;
      const currentUserId = req.user!._id;
      const { name, description } = req.body;

      if (!mongoose.Types.ObjectId.isValid(conversationId)) {
        res.status(400).json({ error: "Invalid conversation ID" });
        return;
      }

      const conversation = await Conversation.findOne({
        _id: conversationId,
        workspaceId,
        type: { $in: ["GROUP", "group"] },
      });

      if (!conversation) {
        res.status(404).json({ error: "Group conversation not found in this workspace" });
        return;
      }

      // Check if caller is GROUP_ADMIN
      const callerMembership = await ConversationMembership.findOne({
        conversationId,
        userId: currentUserId,
        status: "ACTIVE",
      });

      if (!callerMembership || callerMembership.role !== "GROUP_ADMIN") {
        res.status(403).json({ error: "Only group admins can update group information" });
        return;
      }

      if (name !== undefined) {
        if (typeof name !== "string" || name.trim().length < 2) {
          res.status(400).json({ error: "Group name must be at least 2 characters" });
          return;
        }
        if (name.trim().length > 100) {
          res.status(400).json({ error: "Group name cannot exceed 100 characters" });
          return;
        }
        conversation.name = name.trim();
      }

      if (description !== undefined) {
        conversation.description = typeof description === "string" ? description.trim().slice(0, 500) : "";
      }

      await conversation.save();

      // Broadcast update
      try {
        const io = getIO();
        if (io) {
          const room = `conversation:${conversationId}`;
          const payload = {
            conversationId,
            name: conversation.name,
            description: conversation.description,
          };
          io.to(room).emit("group:updated", payload);
          io.to(room).emit("conversation:updated", payload);
        }
      } catch {
        // Socket emission skipped
      }

      res.json({
        message: "Group updated successfully",
        conversation: {
          id: conversation._id.toString(),
          name: conversation.name,
          description: conversation.description,
        },
      });
    } catch (error: any) {
      console.error("[WorkspaceMessaging] Failed to update group:", error);
      res.status(500).json({ error: error?.message || "Failed to update group" });
    }
  }
);

// ==========================================
// G. ADD GROUP MEMBER (Admins only)
// POST /api/workspaces/:workspaceId/conversations/:conversationId/members
// Body: { userId: "..." }
// ==========================================
router.post(
  "/:workspaceId/conversations/:conversationId/members",
  requireAuth,
  requireWorkspaceMember,
  async (req: WorkspaceAuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const workspaceId = req.workspace!._id;
      const conversationId = req.params.conversationId;
      const currentUserId = req.user!._id;
      const { userId } = req.body;

      if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
        res.status(400).json({ error: "Valid userId is required" });
        return;
      }

      const conversation = await Conversation.findOne({
        _id: conversationId,
        workspaceId,
        type: { $in: ["GROUP", "group"] },
      });

      if (!conversation) {
        res.status(404).json({ error: "Group conversation not found in this workspace" });
        return;
      }

      // Check caller is GROUP_ADMIN
      const callerMembership = await ConversationMembership.findOne({
        conversationId,
        userId: currentUserId,
        status: "ACTIVE",
      });

      if (!callerMembership || callerMembership.role !== "GROUP_ADMIN") {
        res.status(403).json({ error: "Only group admins can add members to this group" });
        return;
      }

      // Verify target user is an active workspace member
      const targetWorkspaceMember = await WorkspaceMember.findOne({
        workspaceId,
        userId,
        status: "ACTIVE",
      });

      if (!targetWorkspaceMember) {
        res.status(403).json({ error: "User is not an active member of this workspace" });
        return;
      }

      // Check if target user is already an active group member
      const existingMembership = await ConversationMembership.findOne({
        conversationId,
        userId,
      });

      if (existingMembership && existingMembership.status === "ACTIVE") {
        res.status(400).json({ error: "User is already an active member of this group" });
        return;
      }

      // Add to conversation participants array if not already present
      if (!conversation.participants.some((p) => p.toString() === userId.toString())) {
        conversation.participants.push(new Types.ObjectId(userId));
        await conversation.save();
      }

      // Upsert membership as ACTIVE
      await ConversationMembership.findOneAndUpdate(
        { conversationId, userId },
        {
          workspaceId,
          firebaseUid: "group-member",
          role: "MEMBER",
          status: "ACTIVE",
          joinedAt: new Date(),
          $unset: { leftAt: 1 },
          unreadCount: 0,
        },
        { upsert: true, new: true }
      );

      const targetUser = await User.findById(userId).select("displayName email initials avatarUrl online");

      // Broadcast addition
      try {
        const io = getIO();
        if (io) {
          const room = `conversation:${conversationId}`;
          const eventPayload = {
            conversationId,
            member: {
              id: userId,
              displayName: targetUser?.displayName || "Colleague",
              initials: targetUser?.initials || "U",
              role: "MEMBER",
            },
            addedBy: currentUserId.toString(),
          };
          io.to(room).emit("group:member_added", eventPayload);
          io.to(`user:${userId}`).emit("conversation:updated", {
            conversationId,
            name: conversation.name,
            type: "GROUP",
          });
        }
      } catch {
        // Socket emission skipped
      }

      res.status(200).json({
        message: "Member added successfully",
        member: {
          id: userId,
          displayName: targetUser?.displayName,
          role: "MEMBER",
        },
      });
    } catch (error: any) {
      console.error("[WorkspaceMessaging] Failed to add member:", error);
      res.status(500).json({ error: error?.message || "Failed to add member to group" });
    }
  }
);

// ==========================================
// H. REMOVE GROUP MEMBER (Admins only)
// DELETE /api/workspaces/:workspaceId/conversations/:conversationId/members/:userId
// ==========================================
router.delete(
  "/:workspaceId/conversations/:conversationId/members/:userId",
  requireAuth,
  requireWorkspaceMember,
  async (req: WorkspaceAuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const workspaceId = req.workspace!._id;
      const conversationId = req.params.conversationId;
      const targetUserId = req.params.userId;
      const currentUserId = req.user!._id;

      if (!mongoose.Types.ObjectId.isValid(conversationId) || !mongoose.Types.ObjectId.isValid(targetUserId)) {
        res.status(400).json({ error: "Invalid ID parameters" });
        return;
      }

      // Self-removal through DELETE is prohibited; caller must use leave endpoint
      if (targetUserId.toString() === currentUserId.toString()) {
        res.status(400).json({ error: "You cannot remove yourself. Use the leave group endpoint." });
        return;
      }

      const conversation = await Conversation.findOne({
        _id: conversationId,
        workspaceId,
        type: { $in: ["GROUP", "group"] },
      });

      if (!conversation) {
        res.status(404).json({ error: "Group conversation not found in this workspace" });
        return;
      }

      // Check caller is GROUP_ADMIN
      const callerMembership = await ConversationMembership.findOne({
        conversationId,
        userId: currentUserId,
        status: "ACTIVE",
      });

      if (!callerMembership || callerMembership.role !== "GROUP_ADMIN") {
        res.status(403).json({ error: "Only group admins can remove members from this group" });
        return;
      }

      // Check target membership
      const targetMembership = await ConversationMembership.findOne({
        conversationId,
        userId: targetUserId,
        status: "ACTIVE",
      });

      if (!targetMembership) {
        res.status(404).json({ error: "Active group membership not found for user" });
        return;
      }

      // Rule: cannot remove the last active group admin
      if (targetMembership.role === "GROUP_ADMIN") {
        const activeAdminsCount = await ConversationMembership.countDocuments({
          conversationId,
          role: "GROUP_ADMIN",
          status: "ACTIVE",
        });
        if (activeAdminsCount <= 1) {
          res.status(400).json({ error: "Cannot remove the only group admin. Assign another admin first." });
          return;
        }
      }

      // Update conversation document
      conversation.participants = conversation.participants.filter(
        (p) => p.toString() !== targetUserId.toString()
      );
      if (conversation.admins) {
        conversation.admins = conversation.admins.filter(
          (a) => a.toString() !== targetUserId.toString()
        );
      }
      await conversation.save();

      // Update membership to REMOVED
      targetMembership.status = "REMOVED";
      targetMembership.leftAt = new Date();
      await targetMembership.save();

      // Evict user from room and notify via Socket.IO
      evictUserFromRoom(`conversation:${conversationId}`, targetUserId);

      try {
        const io = getIO();
        if (io) {
          const room = `conversation:${conversationId}`;
          const eventPayload = {
            conversationId,
            userId: targetUserId,
            removedBy: currentUserId.toString(),
          };
          io.to(room).emit("group:member_removed", eventPayload);
          io.to(`user:${targetUserId}`).emit("group:member_removed", eventPayload);
          io.to(`user:${targetUserId}`).emit("conversation:updated", {
            conversationId,
            isRemoved: true,
          });
        }
      } catch {
        // Socket emission skipped
      }

      res.json({ message: "Member removed from group successfully" });
    } catch (error: any) {
      console.error("[WorkspaceMessaging] Failed to remove member:", error);
      res.status(500).json({ error: error?.message || "Failed to remove member from group" });
    }
  }
);

// ==========================================
// I. LEAVE A GROUP
// POST /api/workspaces/:workspaceId/conversations/:conversationId/leave
// ==========================================
router.post(
  "/:workspaceId/conversations/:conversationId/leave",
  requireAuth,
  requireWorkspaceMember,
  async (req: WorkspaceAuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const workspaceId = req.workspace!._id;
      const conversationId = req.params.conversationId;
      const currentUserId = req.user!._id;

      if (!mongoose.Types.ObjectId.isValid(conversationId)) {
        res.status(400).json({ error: "Invalid conversation ID" });
        return;
      }

      const conversation = await Conversation.findOne({
        _id: conversationId,
        workspaceId,
        type: { $in: ["GROUP", "group"] },
      });

      if (!conversation) {
        res.status(404).json({ error: "Group conversation not found in this workspace" });
        return;
      }

      const membership = await ConversationMembership.findOne({
        conversationId,
        userId: currentUserId,
        status: "ACTIVE",
      });

      if (!membership) {
        res.status(400).json({ error: "You are not an active member of this group" });
        return;
      }

      // Check if user is the last active group admin while other active members exist
      if (membership.role === "GROUP_ADMIN") {
        const activeAdminsCount = await ConversationMembership.countDocuments({
          conversationId,
          role: "GROUP_ADMIN",
          status: "ACTIVE",
        });

        const otherActiveMembersCount = await ConversationMembership.countDocuments({
          conversationId,
          userId: { $ne: currentUserId },
          status: "ACTIVE",
        });

        if (activeAdminsCount <= 1 && otherActiveMembersCount > 0) {
          res.status(400).json({
            error: "You are the only group admin. Please promote another member to admin before leaving.",
          });
          return;
        }
      }

      // Remove from conversation participants and admins
      conversation.participants = conversation.participants.filter(
        (p) => p.toString() !== currentUserId.toString()
      );
      if (conversation.admins) {
        conversation.admins = conversation.admins.filter(
          (a) => a.toString() !== currentUserId.toString()
        );
      }
      await conversation.save();

      // Update membership status
      membership.status = "LEFT";
      membership.leftAt = new Date();
      await membership.save();

      // Evict user from room and broadcast departure
      evictUserFromRoom(`conversation:${conversationId}`, currentUserId.toString());

      try {
        const io = getIO();
        if (io) {
          const room = `conversation:${conversationId}`;
          const eventPayload = {
            conversationId,
            userId: currentUserId.toString(),
            name: req.user!.displayName,
          };
          io.to(room).emit("group:member_left", eventPayload);
          io.to(`user:${currentUserId.toString()}`).emit("conversation:updated", {
            conversationId,
            isLeft: true,
          });
        }
      } catch {
        // Socket emission skipped
      }

      res.json({ message: "You have left the group successfully" });
    } catch (error: any) {
      console.error("[WorkspaceMessaging] Failed to leave group:", error);
      res.status(500).json({ error: error?.message || "Failed to leave group" });
    }
  }
);

// ==========================================
// J. UPDATE GROUP MEMBER ROLE (Promote/Demote Admin)
// PATCH /api/workspaces/:workspaceId/conversations/:conversationId/admins/:userId
// Body: { role: "GROUP_ADMIN" | "MEMBER" }
// ==========================================
router.patch(
  "/:workspaceId/conversations/:conversationId/admins/:userId",
  requireAuth,
  requireWorkspaceMember,
  async (req: WorkspaceAuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const workspaceId = req.workspace!._id;
      const conversationId = req.params.conversationId;
      const targetUserId = req.params.userId;
      const currentUserId = req.user!._id;
      const { role } = req.body;

      if (!role || !["GROUP_ADMIN", "MEMBER"].includes(role)) {
        res.status(400).json({ error: "Valid role ('GROUP_ADMIN' or 'MEMBER') is required" });
        return;
      }

      if (!mongoose.Types.ObjectId.isValid(conversationId) || !mongoose.Types.ObjectId.isValid(targetUserId)) {
        res.status(400).json({ error: "Invalid ID parameters" });
        return;
      }

      const conversation = await Conversation.findOne({
        _id: conversationId,
        workspaceId,
        type: { $in: ["GROUP", "group"] },
      });

      if (!conversation) {
        res.status(404).json({ error: "Group conversation not found in this workspace" });
        return;
      }

      // Check caller is GROUP_ADMIN
      const callerMembership = await ConversationMembership.findOne({
        conversationId,
        userId: currentUserId,
        status: "ACTIVE",
      });

      if (!callerMembership || callerMembership.role !== "GROUP_ADMIN") {
        res.status(403).json({ error: "Only group admins can manage administrative roles" });
        return;
      }

      const targetMembership = await ConversationMembership.findOne({
        conversationId,
        userId: targetUserId,
        status: "ACTIVE",
      });

      if (!targetMembership) {
        res.status(404).json({ error: "Active member not found in this group" });
        return;
      }

      // Guard: Cannot demote the last remaining GROUP_ADMIN
      if (role === "MEMBER" && targetMembership.role === "GROUP_ADMIN") {
        const activeAdminsCount = await ConversationMembership.countDocuments({
          conversationId,
          role: "GROUP_ADMIN",
          status: "ACTIVE",
        });
        if (activeAdminsCount <= 1) {
          res.status(400).json({ error: "Cannot demote the only group admin. Assign another admin first." });
          return;
        }
      }

      targetMembership.role = role;
      await targetMembership.save();

      // Update conversation admins array
      if (!conversation.admins) conversation.admins = [];
      if (role === "GROUP_ADMIN") {
        if (!conversation.admins.some((a) => a.toString() === targetUserId.toString())) {
          conversation.admins.push(new Types.ObjectId(targetUserId));
        }
      } else {
        conversation.admins = conversation.admins.filter(
          (a) => a.toString() !== targetUserId.toString()
        );
      }
      await conversation.save();

      try {
        const io = getIO();
        if (io) {
          const room = `conversation:${conversationId}`;
          io.to(room).emit("group:admin_updated", {
            conversationId,
            userId: targetUserId,
            role,
          });
        }
      } catch {
        // Socket emission skipped
      }

      res.json({
        message: `Member role updated to ${role}`,
        role,
        userId: targetUserId,
        member: {
          id: targetUserId,
          role,
        },
      });
    } catch (error: any) {
      console.error("[WorkspaceMessaging] Failed to update admin role:", error);
      res.status(500).json({ error: error?.message || "Failed to update admin role" });
    }
  }
);

// ==========================================
// K. FETCH MESSAGE HISTORY
// GET /api/workspaces/:workspaceId/conversations/:conversationId/messages
// ==========================================
router.get(
  "/:workspaceId/conversations/:conversationId/messages",
  requireAuth,
  requireWorkspaceMember,
  async (req: WorkspaceAuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const workspaceId = req.workspace!._id;
      const conversationId = req.params.conversationId;
      const currentUserId = req.user!._id;
      const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
      const before = req.query.before as string;

      if (!mongoose.Types.ObjectId.isValid(conversationId)) {
        res.status(400).json({ error: "Invalid conversation ID" });
        return;
      }

      // Verify conversation exists and user is participant in this workspace
      const conversation = await Conversation.findOne({
        _id: conversationId,
        workspaceId,
        participants: currentUserId,
      });

      if (!conversation) {
        res.status(403).json({ error: "Access denied. You are not a participant in this conversation." });
        return;
      }

      // Check active membership (prevent departed or removed members from reading history)
      const membership = await ConversationMembership.findOne({
        conversationId,
        userId: currentUserId,
      });

      if (membership && membership.status !== "ACTIVE") {
        res.status(403).json({ error: "Access denied. You are no longer an active member of this conversation." });
        return;
      }

      // Mark conversation as read for the user
      await markConversationReadService(conversation._id, workspaceId, currentUserId);

      // Build message filter
      const messageFilter: any = {
        conversationId: conversation._id,
        deletedForUsers: { $ne: currentUserId },
      };

      if (before) {
        const beforeDate = new Date(before);
        if (!isNaN(beforeDate.getTime())) {
          messageFilter.createdAt = { $lt: beforeDate };
        }
      }

      // Fetch messages in chronological order
      const messages = await Message.find(messageFilter)
        .sort({ createdAt: 1 })
        .limit(limit)
        .populate<{ sender: IUser }>("sender", "displayName initials email avatarUrl")
        .lean();

      const formatted = messages.map((m) => {
        const isMe = m.sender._id.toString() === currentUserId.toString();
        const date = new Date(m.createdAt);
        const timeStr = date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

        return {
          id: m._id.toString(),
          conversationId: m.conversationId.toString(),
          workspaceId: workspaceId.toString(),
          from: isMe ? ("me" as const) : ("them" as const),
          text: m.text,
          time: timeStr,
          createdAt: m.createdAt,
          status: m.status,
          isEdited: !!m.isEdited,
          editedAt: m.editedAt,
          isDeletedForEveryone: !!m.isDeletedForEveryone,
          deliveredAt: m.deliveredAt,
          readAt: m.readAt,
          sender: {
            id: m.sender._id.toString(),
            displayName: m.sender.displayName,
            initials: m.sender.initials,
          },
        };
      });

      res.json({
        messages: formatted,
        total: formatted.length,
      });
    } catch (error: any) {
      console.error("[WorkspaceMessaging] Failed to fetch messages:", error);
      res.status(500).json({ error: error?.message || "Failed to fetch messages" });
    }
  }
);

// ==========================================
// L. SEND A MESSAGE VIA REST
// POST /api/workspaces/:workspaceId/conversations/:conversationId/messages
// Body: { text: "Hello" }
// ==========================================
router.post(
  "/:workspaceId/conversations/:conversationId/messages",
  requireAuth,
  requireWorkspaceMember,
  async (req: WorkspaceAuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const workspaceId = req.workspace!._id;
      const conversationId = req.params.conversationId;
      const currentUserId = req.user!._id;
      const { text } = req.body;

      if (!mongoose.Types.ObjectId.isValid(conversationId)) {
        res.status(400).json({ error: "Invalid conversation ID" });
        return;
      }

      if (!text || typeof text !== "string" || !text.trim()) {
        res.status(400).json({ error: "Message text cannot be empty" });
        return;
      }

      // Delegate directly to unified message service
      const payload = await sendMessageService({
        conversationId,
        workspaceId,
        senderId: currentUserId,
        senderFirebaseUid: req.user!.firebaseUid,
        senderDisplayName: req.user!.displayName,
        senderInitials: req.user!.initials,
        text,
      });

      res.status(201).json({
        message: {
          id: payload.id,
          conversationId: payload.conversationId,
          workspaceId: payload.workspaceId,
          from: "me",
          text: payload.text,
          time: payload.time,
          createdAt: payload.createdAt,
          status: payload.status,
          isEdited: payload.isEdited,
          isDeletedForEveryone: payload.isDeletedForEveryone,
          deliveredAt: payload.deliveredAt,
          readAt: payload.readAt,
        },
      });
    } catch (error: any) {
      console.error("[WorkspaceMessaging] Failed to send message:", error);
      const statusCode =
        error.message?.includes("not an active member") ||
        error.message?.includes("access denied") ||
        error.message?.includes("Access denied") ||
        error.message?.includes("no longer an active participant")
          ? 403
          : 400;
      res.status(statusCode).json({ error: error?.message || "Failed to send message" });
    }
  }
);

// ==========================================
// M. MARK CONVERSATION AS READ
// POST /api/workspaces/:workspaceId/conversations/:conversationId/read
// ==========================================
router.post(
  "/:workspaceId/conversations/:conversationId/read",
  requireAuth,
  requireWorkspaceMember,
  async (req: WorkspaceAuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const workspaceId = req.workspace!._id;
      const conversationId = req.params.conversationId;
      const currentUserId = req.user!._id;

      if (!mongoose.Types.ObjectId.isValid(conversationId)) {
        res.status(400).json({ error: "Invalid conversation ID" });
        return;
      }

      const result = await markConversationReadService(conversationId, workspaceId, currentUserId);
      res.json(result);
    } catch (error: any) {
      console.error("[WorkspaceMessaging] Failed to mark read:", error);
      res.status(500).json({ error: error?.message || "Failed to mark read" });
    }
  }
);

export default router;
