import { Router, Request, Response } from "express";
import mongoose, { Types } from "mongoose";
import { requireAuth, AuthenticatedRequest } from "../middleware/auth.js";
import { WorkspaceMember } from "../models/WorkspaceMember.js";
import { Conversation } from "../models/Conversation.js";
import { Message } from "../models/Message.js";
import { detectTaskFromMessage } from "../services/aiTaskService.js";

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

export default router;
