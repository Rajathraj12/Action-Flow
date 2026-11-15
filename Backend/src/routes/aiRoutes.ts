import { Router, Request, Response } from "express";
import mongoose, { Types } from "mongoose";
import { requireAuth, AuthenticatedRequest } from "../middleware/auth.js";
import { WorkspaceMember } from "../models/WorkspaceMember.js";
import { Conversation } from "../models/Conversation.js";
import { Message } from "../models/Message.js";
import { Task } from "../models/Task.js";
import { User, IUser } from "../models/User.js";
import {
  detectTaskFromMessage,
  scanConversationMessages,
  fastAutoDetectTask,
} from "../services/aiTaskService.js";

const router = Router();

const AI_SERVICE_URL = process.env.AI_SERVICE_URL || "http://127.0.0.1:8000";

/**
 * Health check & status of AI integration
 * GET /api/ai/status
 */
router.get("/status", async (req: Request, res: Response): Promise<void> => {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2000);
    const resp = await fetch(`${AI_SERVICE_URL}/health`, { signal: controller.signal });
    clearTimeout(timer);

    if (resp.ok) {
      const data = await resp.json();
      res.json({
        available: true,
        aiService: data,
      });
      return;
    }
    res.json({ available: false, error: `AI service status: ${resp.status}` });
  } catch (err: any) {
    res.json({ available: false, error: err?.message || "AI Service unreachable" });
  }
});

/**
 * Core AI Task Detection Endpoint
 * POST /api/ai/detect-task
 * or POST /api/workspaces/:workspaceId/ai/detect-task
 */
async function handleDetectTask(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const currentUserId = req.user!._id;

    const workspaceIdParam = req.params.workspaceId || req.body.workspaceId;
    const conversationIdParam = req.body.conversationId;
    const messageIdParam = req.body.messageId;

    // 1. Parameter presence validation
    if (!workspaceIdParam || !conversationIdParam || !messageIdParam) {
      res.status(400).json({
        error: "Missing required parameters: workspaceId, conversationId, and messageId are required.",
      });
      return;
    }

    const workspaceIdStr = Array.isArray(workspaceIdParam) ? workspaceIdParam[0] : String(workspaceIdParam);
    const conversationIdStr = Array.isArray(conversationIdParam) ? conversationIdParam[0] : String(conversationIdParam);
    const messageIdStr = Array.isArray(messageIdParam) ? messageIdParam[0] : String(messageIdParam);

    // 2. ObjectId format validation
    if (
      !mongoose.Types.ObjectId.isValid(workspaceIdStr) ||
      !mongoose.Types.ObjectId.isValid(conversationIdStr) ||
      !mongoose.Types.ObjectId.isValid(messageIdStr)
    ) {
      res.status(400).json({
        error: "Invalid ID format for workspace, conversation, or message.",
      });
      return;
    }

    const workspaceId = new Types.ObjectId(workspaceIdStr);
    const conversationId = new Types.ObjectId(conversationIdStr);
    const messageId = new Types.ObjectId(messageIdStr);

    // 3. Workspace authorization check
    const membership = await WorkspaceMember.findOne({
      workspaceId,
      userId: currentUserId,
      status: "ACTIVE",
    });

    if (!membership) {
      res.status(403).json({
        error: "Access denied: You are not an active member of this workspace.",
      });
      return;
    }

    // 4. Conversation access check
    const conversation = await Conversation.findOne({
      _id: conversationId,
      workspaceId,
    });

    if (!conversation) {
      res.status(404).json({
        error: "Conversation not found in the specified workspace.",
      });
      return;
    }

    const isParticipant = conversation.participants.some(
      (p) => p.toString() === currentUserId.toString()
    );

    if (!isParticipant) {
      res.status(403).json({
        error: "Access denied: You are not a participant in this conversation.",
      });
      return;
    }

    // 5. Message verification
    const message = await Message.findOne({
      _id: messageId,
      conversationId,
    });

    if (!message) {
      res.status(404).json({
        error: "Message not found in this conversation.",
      });
      return;
    }

    // 6. Perform AI Task Detection and Roster Mapping
    const result = await detectTaskFromMessage({
      workspaceId,
      conversationId,
      messageId,
      currentUserId,
    });

    res.json(result);
  } catch (error: any) {
    console.error("[ActionFlow AI] detect-task route error:", error);
    res.status(500).json({
      error: error?.message || "Internal error during AI task detection.",
    });
  }
}

router.post("/detect-task", requireAuth, handleDetectTask);
router.post("/:workspaceId/ai/detect-task", requireAuth, handleDetectTask);

/**
 * Scan all messages in a conversation for AI tasks
 * POST /api/ai/workspaces/:workspaceId/conversations/:conversationId/scan
 */
router.post(
  "/:workspaceId/conversations/:conversationId/scan",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { workspaceId, conversationId } = req.params;
      if (
        !mongoose.Types.ObjectId.isValid(workspaceId) ||
        !mongoose.Types.ObjectId.isValid(conversationId)
      ) {
        res.status(400).json({ error: "Invalid workspaceId or conversationId" });
        return;
      }

      const results = await scanConversationMessages(conversationId, workspaceId);
      res.json({ success: true, detections: results });
    } catch (err: any) {
      console.error("[ActionFlow AI] scan route error:", err);
      res.status(500).json({ error: err?.message || "Failed to scan conversation" });
    }
  }
);

/**
 * Fetch pending AI task extractions for Manager Dashboard
 * GET /api/ai/workspaces/:workspaceId/extractions
 * or GET /api/workspaces/:workspaceId/ai/extractions
 */
async function handleGetExtractions(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const workspaceIdParam = req.params.workspaceId;
    if (!workspaceIdParam || !mongoose.Types.ObjectId.isValid(String(workspaceIdParam))) {
      res.status(400).json({ error: "Invalid workspace ID" });
      return;
    }

    const workspaceId = new Types.ObjectId(String(workspaceIdParam));

    // Enforce workspace membership
    const membership = await WorkspaceMember.findOne({
      workspaceId,
      userId: req.user!._id,
      status: "ACTIVE",
    });

    if (!membership) {
      res.status(403).json({ error: "Access denied to this workspace" });
      return;
    }

    // 1. Find all active conversations in this workspace
    const conversations = await Conversation.find({ workspaceId })
      .populate<{ participants: IUser[] }>("participants", "displayName initials email")
      .lean();

    const conversationIds = conversations.map((c) => c._id);

    // 2. Find messages that AI identified as task candidates or contain clear action keywords
    const candidateMessages = await Message.find({
      conversationId: { $in: conversationIds },
      isDeletedForEveryone: false,
      $or: [
        { "aiTaskDetection.isTaskCandidate": true },
        {
          text: {
            $regex: /\b(schedule|meeting|client meeting|call|fix|update|prepare|send|review|deploy|by tomorrow|by monday|by friday|urgent|asap|verify)\b/i,
          },
        },
      ],
    })
      .sort({ createdAt: -1 })
      .limit(30)
      .populate<{ sender: IUser }>("sender", "displayName initials email")
      .lean();

    if (candidateMessages.length === 0) {
      res.json({ extractions: [] });
      return;
    }

    // 3. Find existing tasks that were already created from these messages
    const messageIds = candidateMessages.map((m) => m._id);
    const existingTasks = await Task.find({
      workspaceId,
      sourceMessageId: { $in: messageIds },
    }).select("sourceMessageId");

    const approvedMessageIds = new Set(
      existingTasks
        .filter((t) => t.sourceMessageId)
        .map((t) => t.sourceMessageId!.toString())
    );

    // Filter out messages that already have tasks
    const pendingMessages = candidateMessages.filter(
      (m) => !approvedMessageIds.has(m._id.toString())
    );

    // 4. Fetch all workspace members to match assignee names to IDs
    const members = await WorkspaceMember.find({
      workspaceId,
      status: "ACTIVE",
    }).populate<{ userId: IUser }>("userId", "displayName initials");

    const teamMemberNames = members
      .filter((mem) => (mem.userId as any)?.displayName)
      .map((mem) => (mem.userId as any).displayName.trim());

    // Evaluate any pending message that lacks complete AI detection or was previously marked false
    await Promise.all(
      pendingMessages.map(async (m) => {
        if (!m.aiTaskDetection || !m.aiTaskDetection.isTaskCandidate || !m.aiTaskDetection.tasks?.length) {
          try {
            const detected = await fastAutoDetectTask(
              m.text,
              (m.sender as any)?.displayName || "Teammate",
              teamMemberNames
            );
            if (detected.isTaskCandidate && detected.tasks?.length) {
              m.aiTaskDetection = { ...detected, detectedAt: new Date() };
              Message.updateOne(
                { _id: m._id },
                { $set: { aiTaskDetection: m.aiTaskDetection } }
              ).exec().catch(() => {});
            }
          } catch (scanErr) {
            console.warn("[ActionFlow AI] Auto-detection scan error on message:", scanErr);
          }
        }
      })
    );

    // Filter down to validated task candidates
    const validTaskMessages = pendingMessages.filter(
      (m) => m.aiTaskDetection?.isTaskCandidate && m.aiTaskDetection?.tasks?.length
    );

    const convMap = new Map(conversations.map((c) => [c._id.toString(), c]));

    // Synchronously format extractions from database - takes ~5ms!
    const extractions = validTaskMessages.map((m) => {
      const aiDetection = m.aiTaskDetection;
      const conv = convMap.get(m.conversationId.toString());
      let sourceName = conv?.name;
      if (!sourceName && conv) {
        if (conv.type === "DIRECT" || conv.type === "direct") {
          const other = conv.participants?.find(
            (p: any) => p._id.toString() !== req.user!._id.toString()
          );
          sourceName = other ? `Chat with ${(other as any).displayName}` : "Direct Chat";
        } else {
          sourceName = "Group Chat";
        }
      }

      const rawTask = aiDetection?.tasks?.[0];
      const rawSuggestedName = rawTask?.assigneeName || null;
      // Ignore placeholder names like "Teammate", "Someone", "Anyone", "Unassigned"
      const suggestedName = (rawSuggestedName && !/^(teammate|someone|anyone|unassigned)$/i.test(rawSuggestedName.trim()))
        ? rawSuggestedName.trim()
        : null;

      // Check if this is an explicit self-commitment from the sender (e.g. "I'll do it", "I will finish...")
      const isSelfCommitment =
        aiDetection?.category === "self_commitment" ||
        /\b(i'll|i\s+will|i\s+can|let\s+me|assign\s+to\s+me|on\s+it|i\s+am\s+on\s+it|i'm\s+on\s+it|i\s+got\s+this|main\s+karunga)\b/i.test(m.text);

      let assigneeDisplayName = "Unassigned";
      let assigneeId: string | undefined = undefined;
      let assigneeInitials = "?";

      if (isSelfCommitment) {
        // Priority 1: Self-commitment belongs directly to the message's sender
        const senderIdStr = (m.sender as any)?._id?.toString() || (m.sender as any)?.toString() || (m as any).senderId?.toString();
        const senderMember = members.find((mem) => {
          const u = mem.userId as any;
          return u?._id?.toString() === senderIdStr;
        });

        if (senderMember) {
          assigneeDisplayName = (senderMember.userId as any).displayName;
          assigneeId = (senderMember.userId as any)._id.toString();
          assigneeInitials = (senderMember.userId as any).initials || "U";
        } else if (m.sender && (m.sender as any).displayName) {
          assigneeDisplayName = (m.sender as any).displayName;
          assigneeId = (m.sender as any)._id?.toString() || senderIdStr;
          assigneeInitials = (m.sender as any).initials || "U";
        } else if (req.user) {
          assigneeDisplayName = req.user.displayName;
          assigneeId = req.user._id.toString();
          assigneeInitials = req.user.initials || "U";
        }
      } else {
        // Priority 2: Directed task assignment matching workspace member
        let matchedMember: any = null;
        if (suggestedName) {
          const cleanSug = suggestedName.trim().toLowerCase();
          // Exact match on full displayName or first name
          matchedMember = members.find((mem) => {
            const u = mem.userId as any;
            if (!u?.displayName) return false;
            const cleanName = u.displayName.trim().toLowerCase();
            const firstName = cleanName.split(/\s+/)[0];
            return cleanName === cleanSug || firstName === cleanSug;
          });

          // Prefix match only if no exact match exists
          if (!matchedMember) {
            matchedMember = members.find((mem) => {
              const u = mem.userId as any;
              if (!u?.displayName) return false;
              const cleanName = u.displayName.trim().toLowerCase();
              return cleanName.startsWith(cleanSug + " ") || cleanName.startsWith(cleanSug);
            });
          }
        }

        if (matchedMember) {
          assigneeDisplayName = (matchedMember.userId as any).displayName;
          assigneeId = (matchedMember.userId as any)._id.toString();
          assigneeInitials = (matchedMember.userId as any).initials || "U";
        } else {
          // If no member matched or candidate was ambiguous / someone / unassigned
          assigneeDisplayName = "Unassigned";
          assigneeId = undefined;
          assigneeInitials = "?";
        }
      }

      const isUnassigned = assigneeDisplayName === "Unassigned" || !assigneeId;

      const confidenceVal = (rawTask as any)?.confidence ?? aiDetection?.confidence;
      let confidencePct = 88;
      if (typeof confidenceVal === "number") {
        if (confidenceVal > 1) {
          confidencePct = Math.round(confidenceVal);
        } else if (confidenceVal >= 0.70) {
          confidencePct = Math.round(confidenceVal * 100);
        } else if (confidenceVal > 0) {
          // Calibrate raw unscaled 7-class SVM decision scores (where 0.14 is uniform and 0.35 is dominant)
          const scaled = Math.min(0.96, Math.max(0.78, 0.75 + (confidenceVal - 0.14) * 0.9));
          confidencePct = Math.round(scaled * 100);
        }
      }

      let resolvedDeadline = rawTask?.deadlineText || "ASAP";
      let resolvedDeadlineDate = rawTask?.deadlineDate || null;
      let resolvedTitle = rawTask?.title || m.text.slice(0, 60);

      // Helper to format Date into local YYYY-MM-DD
      const formatToLocalDateString = (dateObj: Date): string => {
        const offset = dateObj.getTimezoneOffset();
        let targetTime = dateObj.getTime();
        if (offset === 0) {
          targetTime += 330 * 60 * 1000;
        }
        const adjusted = new Date(targetTime);
        const y = adjusted.getFullYear();
        const m = String(adjusted.getMonth() + 1).padStart(2, "0");
        const day = String(adjusted.getDate()).padStart(2, "0");
        return `${y}-${m}-${day}`;
      };

      // Helper to format ISO date into clean display date e.g. "04 Nov 2026"
      const formatIsoToDateDisplay = (isoDate: string, timeStr?: string | null): string => {
        const parts = isoDate.split("T")[0].split("-");
        if (parts.length === 3) {
          const [y, m, d] = parts;
          const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
          const idx = parseInt(m, 10) - 1;
          if (idx >= 0 && idx < 12) {
            const base = `${d.padStart(2, "0")} ${months[idx]} ${y}`;
            return timeStr ? `${base}, ${timeStr}` : base;
          }
        }
        return timeStr ? `${isoDate}, ${timeStr}` : isoDate;
      };

      // Extract explicit time mention if present (e.g. "11 AM", "at 4:30 pm")
      const timeMatch = m.text.match(/\b(?:at\s+)?(\d{1,2}(?::\d{2})?\s*(?:am|pm))\b/i);
      const extractedTime = timeMatch ? timeMatch[1].toUpperCase() : null;

      // Check if text has explicit relative deadline that was missed or defaulted to ASAP
      const relDeadlineMatch = m.text.match(
        /\b((?:by|before|in|within|after)\s+(?:a\s+)?)?(\d+|a|an|one|two|couple(?:\s+of)?|three|few|four|five|six|seven|eight|nine|ten)\s+(?:days?|weeks?|months?)(?:\s+(?:from\s+now|later))?\b/i
      );
      if (relDeadlineMatch && (resolvedDeadline === "ASAP" || !rawTask?.deadlineDate || !rawTask?.deadlineText || /days?\s+from\s+now|in\s+\d+|on\s+\w+/i.test(resolvedDeadline))) {
        const wordMap: Record<string, number> = {
          a: 1, an: 1, one: 1, two: 2, couple: 2, "couple of": 2,
          three: 3, few: 3, four: 4, five: 5, six: 6, seven: 7,
          eight: 8, nine: 9, ten: 10,
        };
        const numRaw = relDeadlineMatch[2].toLowerCase();
        const num = /^\d+$/.test(numRaw) ? parseInt(numRaw, 10) : (wordMap[numRaw] || 2);
        const d = new Date(m.createdAt || Date.now());
        if (/week/i.test(relDeadlineMatch[0])) {
          d.setDate(d.getDate() + num * 7);
        } else if (/month/i.test(relDeadlineMatch[0])) {
          d.setMonth(d.getMonth() + num);
        } else {
          d.setDate(d.getDate() + num);
        }
        resolvedDeadlineDate = formatToLocalDateString(d);

        // Also clean trailing deadline from title if it was erroneously kept in title
        const rawPhrase = relDeadlineMatch[0].trim();
        if (resolvedTitle.toLowerCase().includes(rawPhrase.toLowerCase())) {
          resolvedTitle = resolvedTitle.replace(new RegExp(`\\s*${rawPhrase}\\s*`, "i"), " ").trim();
        }
      }

      // Check for weekdays in text (e.g. "on Friday", "Monday")
      const weekdayMatch = m.text.match(
        /\b(?:by|before|on|for)?\s*(monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|wed|thu|fri|sat|sun)\b/i
      );
      const keywordMatch = m.text.match(
        /\b(day\s*after\s*tomorrow|parso|tomorrow|kal|today|tonight|eod|end\s*of\s*day|aaj)\b/i
      );
      const refDate = new Date(m.createdAt || Date.now());

      if (!resolvedDeadlineDate) {
        if (weekdayMatch) {
          const weekdayMap: Record<string, number> = {
            sunday: 0, sun: 0, monday: 1, mon: 1, tuesday: 2, tue: 2,
            wednesday: 3, wed: 3, thursday: 4, thu: 4, friday: 5, fri: 5, saturday: 6, sat: 6,
          };
          const targetWd = weekdayMap[weekdayMatch[1].toLowerCase()];
          const curWd = refDate.getDay();
          let diff = (targetWd - curWd + 7) % 7;
          if (diff === 0) diff = 7;
          const d = new Date(refDate);
          d.setDate(d.getDate() + diff);
          resolvedDeadlineDate = formatToLocalDateString(d);
        } else if (keywordMatch) {
          const kw = keywordMatch[0].toLowerCase();
          const d = new Date(refDate);
          if (/day\s*after\s*tomorrow|parso/i.test(kw)) {
            d.setDate(d.getDate() + 2);
          } else if (/tomorrow|kal/i.test(kw)) {
            d.setDate(d.getDate() + 1);
          }
          resolvedDeadlineDate = formatToLocalDateString(d);
        }
      }

      // Always format resolvedDeadline as a calendar date when a date is resolved!
      if (resolvedDeadlineDate) {
        resolvedDeadline = formatIsoToDateDisplay(resolvedDeadlineDate, extractedTime);
      } else {
        const isoMatch = (rawTask?.deadlineText || "").match(/^\d{4}-\d{2}-\d{2}/);
        if (isoMatch) {
          resolvedDeadlineDate = isoMatch[0];
          resolvedDeadline = formatIsoToDateDisplay(resolvedDeadlineDate, extractedTime);
        }
      }

      // If title lost its imperative verb (e.g. "The deployment" from "Complete the deployment")
      const firstOriginalWord = m.text.trim().split(/\s+/)[0];
      if (/^(complete|finish|deploy|review|update|fix|check|prepare|send|write|test)\b/i.test(firstOriginalWord)) {
        if (/^(the|a|an)\s+/i.test(resolvedTitle)) {
          const capWord = firstOriginalWord.charAt(0).toUpperCase() + firstOriginalWord.slice(1).toLowerCase();
          resolvedTitle = `${capWord} ${resolvedTitle}`.slice(0, 70);
        }
      }

      return {
        id: m._id.toString(),
        messageId: m._id.toString(),
        conversationId: m.conversationId.toString(),
        title: resolvedTitle,
        assignee: assigneeDisplayName,
        assigneeId,
        assigneeInitials,
        isUnassigned,
        deadline: resolvedDeadline,
        deadlineDate: resolvedDeadlineDate,
        priority: rawTask?.priority || "MEDIUM",
        source: sourceName || "Direct Chat",
        context: m.text,
        confidence: Math.min(99, Math.max(75, confidencePct)),
        category: aiDetection?.category || "clear_task",
        createdAt: m.createdAt,
      };
    });

    res.json({ extractions });
  } catch (err: any) {
    console.error("[ActionFlow AI] get-extractions error:", err);
    res.status(500).json({ error: err?.message || "Failed to fetch AI extractions" });
  }
}

router.get("/:workspaceId/extractions", requireAuth, handleGetExtractions);
router.get("/workspaces/:workspaceId/extractions", requireAuth, handleGetExtractions);

export default router;
