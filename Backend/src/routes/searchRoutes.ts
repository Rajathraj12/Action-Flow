import { Router, Response } from "express";
import mongoose, { Types } from "mongoose";
import { requireAuth } from "../middleware/auth.js";
import {
  requireWorkspaceMember,
  WorkspaceAuthenticatedRequest,
} from "../middleware/rbac.js";
import { Message, IMessage } from "../models/Message.js";
import { Task, ITask } from "../models/Task.js";
import { Conversation, IConversation } from "../models/Conversation.js";
import { ConversationMembership } from "../models/ConversationMembership.js";
import { WorkspaceMember } from "../models/WorkspaceMember.js";
import { User, IUser } from "../models/User.js";
import { escapeRegex } from "../utils/regex.js";

const router = Router();

// ==========================================
// 1. GLOBAL WORKSPACE SEARCH
// GET /api/workspaces/:workspaceId/search?q=...&type=all|messages|tasks|conversations|people&limit=10
// ==========================================
router.get(
  "/:workspaceId/search",
  requireAuth,
  requireWorkspaceMember,
  async (req: WorkspaceAuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const workspaceId = req.workspace!._id;
      const wsObjectId = new Types.ObjectId(workspaceId.toString());
      const currentUserId = req.user!._id;
      const currentUserObjectId = new Types.ObjectId(currentUserId.toString());

      const rawQuery = (req.query.q as string || "").trim();
      const searchType = (req.query.type as string || "all").toLowerCase();
      const limit = Math.min(Math.max(parseInt(req.query.limit as string || "10", 10), 1), 30);

      if (!rawQuery) {
        res.json({
          query: "",
          results: {
            messages: [],
            tasks: [],
            conversations: [],
            people: [],
          },
          total: 0,
        });
        return;
      }

      const safeQuery = escapeRegex(rawQuery);
      const regex = { $regex: safeQuery, $options: "i" };

      // Step A: Find all conversations the current user is an active participant in within this workspace
      const userMemberships = await ConversationMembership.find({
        workspaceId: wsObjectId,
        userId: currentUserObjectId,
        status: "ACTIVE",
      }).select("conversationId");

      const activeConvIds = userMemberships.map((m) => m.conversationId);

      const searchPromises: Promise<any>[] = [];

      // 1. Search Messages (strictly authorized conversations only)
      const shouldSearchMessages = searchType === "all" || searchType === "messages";
      if (shouldSearchMessages) {
        if (activeConvIds.length > 0) {
          searchPromises.push(
            Message.find({
              workspaceId: wsObjectId,
              conversationId: { $in: activeConvIds },
              isDeletedForEveryone: { $ne: true },
              deletedForUsers: { $ne: currentUserObjectId },
              text: regex,
            })
              .sort({ createdAt: -1 })
              .limit(limit)
              .populate<{ sender: IUser }>("sender", "displayName initials email")
              .populate<{ conversationId: IConversation }>("conversationId", "name type participants")
              .then((msgs) =>
                msgs.map((m) => {
                  const conv = m.conversationId as any;
                  return {
                    id: m._id,
                    type: "message",
                    title: m.sender?.displayName || "Message",
                    snippet: m.text,
                    conversationId: conv?._id || m.conversationId,
                    conversationName: conv?.name || "Direct Message",
                    conversationType: conv?.type || "DIRECT",
                    sender: m.sender
                      ? {
                          id: m.sender._id,
                          displayName: m.sender.displayName,
                          initials: m.sender.initials,
                        }
                      : null,
                    createdAt: m.createdAt,
                    navigationUrl: `/?conversationId=${conv?._id || m.conversationId}&messageId=${m._id}`,
                  };
                })
              )
          );
        } else {
          searchPromises.push(Promise.resolve([]));
        }
      } else {
        searchPromises.push(Promise.resolve([]));
      }

      // 2. Search Tasks (workspace-scoped title and description)
      const shouldSearchTasks = searchType === "all" || searchType === "tasks";
      if (shouldSearchTasks) {
        searchPromises.push(
          Task.find({
            workspaceId: wsObjectId,
            $or: [{ title: regex }, { description: regex }],
          })
            .sort({ createdAt: -1 })
            .limit(limit)
            .populate<{ assigneeId: IUser }>("assigneeId", "displayName initials email")
            .populate<{ createdBy: IUser }>("createdBy", "displayName initials email")
            .then((tasks) =>
              tasks.map((t) => ({
                id: t._id,
                type: "task",
                title: t.title,
                snippet: t.description || "",
                status: t.status,
                priority: t.priority,
                dueDate: t.dueDate,
                assignee: t.assigneeId
                  ? {
                      id: t.assigneeId._id,
                      displayName: t.assigneeId.displayName,
                      initials: t.assigneeId.initials,
                    }
                  : null,
                createdAt: t.createdAt,
                navigationUrl: `/tasks?taskId=${t._id}`,
              }))
            )
        );
      } else {
        searchPromises.push(Promise.resolve([]));
      }

      // 3. Search Conversations (active conversations matching name or participants)
      const shouldSearchConversations = searchType === "all" || searchType === "conversations";
      if (shouldSearchConversations && activeConvIds.length > 0) {
        searchPromises.push(
          Conversation.find({
            _id: { $in: activeConvIds },
            workspaceId: wsObjectId,
          })
            .populate<{ participants: IUser }>("participants", "displayName initials email")
            .limit(limit * 2)
            .then((convs) => {
              const matched: any[] = [];
              for (const c of convs) {
                const isGroup = c.type?.toUpperCase() === "GROUP";
                if (isGroup && c.name && new RegExp(safeQuery, "i").test(c.name)) {
                  matched.push({
                    id: c._id,
                    type: "conversation",
                    title: c.name,
                    snippet: c.description || c.lastMessageText || "Group conversation",
                    conversationType: "GROUP",
                    createdAt: c.createdAt,
                    navigationUrl: `/?conversationId=${c._id}`,
                  });
                } else if (!isGroup) {
                  // Direct message: match the other user's display name
                  const other = (c.participants as any[])?.find(
                    (p) => p._id.toString() !== currentUserId.toString()
                  );
                  if (other && new RegExp(safeQuery, "i").test(other.displayName)) {
                    matched.push({
                      id: c._id,
                      type: "conversation",
                      title: other.displayName,
                      snippet: c.lastMessageText || "Direct conversation",
                      conversationType: "DIRECT",
                      createdAt: c.createdAt,
                      navigationUrl: `/?conversationId=${c._id}`,
                    });
                  }
                }
                if (matched.length >= limit) break;
              }
              return matched;
            })
        );
      } else {
        searchPromises.push(Promise.resolve([]));
      }

      // 4. Search People (active workspace members)
      const shouldSearchPeople = searchType === "all" || searchType === "people";
      if (shouldSearchPeople) {
        searchPromises.push(
          WorkspaceMember.find({
            workspaceId: wsObjectId,
            status: "ACTIVE",
          })
            .populate<{ userId: IUser }>("userId", "displayName email initials online lastSeen")
            .then((members) => {
              const matchedPeople: any[] = [];
              const testRegex = new RegExp(safeQuery, "i");
              for (const m of members) {
                const u = m.userId as any;
                if (!u) continue;
                if (testRegex.test(u.displayName) || testRegex.test(u.email)) {
                  matchedPeople.push({
                    id: u._id,
                    type: "person",
                    title: u.displayName,
                    snippet: u.email,
                    role: m.role,
                    initials: u.initials,
                    online: u.online,
                    navigationUrl: `/?openColleagueId=${u._id}`,
                  });
                }
                if (matchedPeople.length >= limit) break;
              }
              return matchedPeople;
            })
        );
      } else {
        searchPromises.push(Promise.resolve([]));
      }

      const [messages, tasks, conversations, people] = await Promise.all(searchPromises);

      const total =
        messages.length + tasks.length + conversations.length + people.length;

      res.json({
        query: rawQuery,
        results: {
          messages,
          tasks,
          conversations,
          people,
        },
        total,
      });
    } catch (error: any) {
      console.error("[SearchRoutes] Global search error:", error);
      res.status(500).json({ error: error?.message || "Failed to perform search" });
    }
  }
);

// ==========================================
// 2. DEDICATED MESSAGE SEARCH
// GET /api/workspaces/:workspaceId/messages/search?q=...&conversationId=...&limit=20&skip=0
// ==========================================
router.get(
  "/:workspaceId/messages/search",
  requireAuth,
  requireWorkspaceMember,
  async (req: WorkspaceAuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const workspaceId = req.workspace!._id;
      const wsObjectId = new Types.ObjectId(workspaceId.toString());
      const currentUserId = req.user!._id;
      const currentUserObjectId = new Types.ObjectId(currentUserId.toString());

      const rawQuery = (req.query.q as string || "").trim();
      const conversationId = req.query.conversationId as string;
      const limit = Math.min(Math.max(parseInt(req.query.limit as string || "20", 10), 1), 50);
      const skip = Math.max(parseInt(req.query.skip as string || "0", 10), 0);

      if (!rawQuery) {
        res.json({
          query: "",
          messages: [],
          total: 0,
          limit,
          skip,
        });
        return;
      }

      const safeQuery = escapeRegex(rawQuery);
      const regex = { $regex: safeQuery, $options: "i" };

      // Step A: Determine authorized conversation IDs
      if (conversationId) {
        if (!mongoose.Types.ObjectId.isValid(conversationId)) {
          res.status(400).json({ error: "Invalid conversation ID" });
          return;
        }

        const convObjectId = new Types.ObjectId(conversationId);
        // Verify current user is an active member of this conversation
        const membership = await ConversationMembership.findOne({
          conversationId: convObjectId,
          userId: currentUserObjectId,
          status: "ACTIVE",
        });

        if (!membership) {
          res.status(403).json({ error: "Access denied. You are not a member of this conversation." });
          return;
        }

        const queryFilter = {
          workspaceId: wsObjectId,
          conversationId: convObjectId,
          isDeletedForEveryone: { $ne: true },
          deletedForUsers: { $ne: currentUserObjectId },
          text: regex,
        };

        const [messages, total] = await Promise.all([
          Message.find(queryFilter)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .populate<{ sender: IUser }>("sender", "displayName initials email")
            .populate<{ conversationId: IConversation }>("conversationId", "name type"),
          Message.countDocuments(queryFilter),
        ]);

        const formatted = messages.map((m) => {
          const conv = m.conversationId as any;
          return {
            id: m._id,
            text: m.text,
            conversationId: conv?._id || m.conversationId,
            conversationName: conv?.name || "Direct Message",
            conversationType: conv?.type || "DIRECT",
            sender: m.sender
              ? {
                  id: m.sender._id,
                  displayName: m.sender.displayName,
                  initials: m.sender.initials,
                }
              : null,
            createdAt: m.createdAt,
            navigationUrl: `/?conversationId=${conv?._id || m.conversationId}&messageId=${m._id}`,
          };
        });

        res.json({
          query: rawQuery,
          messages: formatted,
          total,
          limit,
          skip,
        });
        return;
      }

      // Step B: Search across all active conversations user belongs to
      const userMemberships = await ConversationMembership.find({
        workspaceId: wsObjectId,
        userId: currentUserObjectId,
        status: "ACTIVE",
      }).select("conversationId");

      const activeConvIds = userMemberships.map((m) => m.conversationId);
      if (activeConvIds.length === 0) {
        res.json({
          query: rawQuery,
          messages: [],
          total: 0,
          limit,
          skip,
        });
        return;
      }

      const queryFilter = {
        workspaceId: wsObjectId,
        conversationId: { $in: activeConvIds },
        isDeletedForEveryone: { $ne: true },
        deletedForUsers: { $ne: currentUserObjectId },
        text: regex,
      };

      const [messages, total] = await Promise.all([
        Message.find(queryFilter)
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit)
          .populate<{ sender: IUser }>("sender", "displayName initials email")
          .populate<{ conversationId: IConversation }>("conversationId", "name type"),
        Message.countDocuments(queryFilter),
      ]);

      const formatted = messages.map((m) => {
        const conv = m.conversationId as any;
        return {
          id: m._id,
          text: m.text,
          conversationId: conv?._id || m.conversationId,
          conversationName: conv?.name || "Direct Message",
          conversationType: conv?.type || "DIRECT",
          sender: m.sender
            ? {
                id: m.sender._id,
                displayName: m.sender.displayName,
                initials: m.sender.initials,
              }
            : null,
          createdAt: m.createdAt,
          navigationUrl: `/?conversationId=${conv?._id || m.conversationId}&messageId=${m._id}`,
        };
      });

      res.json({
        query: rawQuery,
        messages: formatted,
        total,
        limit,
        skip,
      });
    } catch (error: any) {
      console.error("[SearchRoutes] Message search error:", error);
      res.status(500).json({ error: error?.message || "Failed to search messages" });
    }
  }
);

export default router;
