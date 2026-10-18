import { Router, Response } from "express";
import mongoose, { Types } from "mongoose";
import { requireAuth } from "../middleware/auth.js";
import {
  requireWorkspaceMember,
  WorkspaceAuthenticatedRequest,
} from "../middleware/rbac.js";
import { Task, ITask, TaskStatus, TaskPriority } from "../models/Task.js";
import { WorkspaceMember } from "../models/WorkspaceMember.js";
import { Conversation } from "../models/Conversation.js";
import { Message } from "../models/Message.js";
import { User, IUser } from "../models/User.js";
import { getIO } from "../socket/socketHandler.js";

const router = Router();

// Helper to format a populated Task document into a safe JSON object
function formatTask(task: any) {
  const isOverdue =
    task.dueDate &&
    task.status !== "DONE" &&
    new Date(task.dueDate).getTime() < Date.now();

  return {
    id: task._id.toString(),
    workspaceId: task.workspaceId.toString(),
    title: task.title,
    description: task.description || "",
    priority: task.priority as TaskPriority,
    status: task.status as TaskStatus,
    dueDate: task.dueDate ? new Date(task.dueDate).toISOString() : null,
    completedAt: task.completedAt ? new Date(task.completedAt).toISOString() : null,
    isOverdue: !!isOverdue,
    createdBy: task.createdBy
      ? {
          id: task.createdBy._id ? task.createdBy._id.toString() : task.createdBy.toString(),
          displayName: task.createdBy.displayName || "Colleague",
          email: task.createdBy.email || "",
          initials: task.createdBy.initials || "U",
          avatarUrl: task.createdBy.avatarUrl,
        }
      : null,
    assignee: task.assigneeId
      ? {
          id: task.assigneeId._id ? task.assigneeId._id.toString() : task.assigneeId.toString(),
          displayName: task.assigneeId.displayName || "Colleague",
          email: task.assigneeId.email || "",
          initials: task.assigneeId.initials || "U",
          avatarUrl: task.assigneeId.avatarUrl,
        }
      : null,
    sourceMessageId: task.sourceMessageId ? task.sourceMessageId.toString() : null,
    sourceConversationId: task.sourceConversationId ? task.sourceConversationId.toString() : null,
    sourceSnippet: task.sourceSnippet || null,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
  };
}

// ==========================================
// A. CREATE TASK (Direct or from message)
// POST /api/workspaces/:workspaceId/tasks
// ==========================================
router.post(
  "/:workspaceId/tasks",
  requireAuth,
  requireWorkspaceMember,
  async (req: WorkspaceAuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const workspaceId = req.workspace!._id;
      const currentUserId = req.user!._id;
      const {
        title,
        description,
        assigneeId,
        priority,
        dueDate,
        sourceMessageId,
        sourceConversationId,
      } = req.body;

      // 1. Title validation
      if (!title || typeof title !== "string" || title.trim().length < 2) {
        res.status(400).json({ error: "Task title must be at least 2 characters" });
        return;
      }
      if (title.trim().length > 200) {
        res.status(400).json({ error: "Task title cannot exceed 200 characters" });
        return;
      }

      // 2. Priority validation
      const validPriorities: TaskPriority[] = ["LOW", "MEDIUM", "HIGH", "URGENT"];
      const resolvedPriority: TaskPriority = priority
        ? priority.toUpperCase()
        : "MEDIUM";
      if (!validPriorities.includes(resolvedPriority)) {
        res.status(400).json({
          error: "Invalid priority. Must be LOW, MEDIUM, HIGH, or URGENT",
        });
        return;
      }

      // 3. Due date validation
      let resolvedDueDate: Date | undefined = undefined;
      if (dueDate) {
        resolvedDueDate = new Date(dueDate);
        if (isNaN(resolvedDueDate.getTime())) {
          res.status(400).json({ error: "Invalid due date format" });
          return;
        }
      }

      // 4. Assignee validation
      let targetAssigneeId = currentUserId;
      if (assigneeId) {
        if (!mongoose.Types.ObjectId.isValid(assigneeId)) {
          res.status(400).json({ error: "Invalid assignee ID format" });
          return;
        }
        // Verify assignee is an active workspace member
        const assigneeMembership = await WorkspaceMember.findOne({
          workspaceId,
          userId: assigneeId,
          status: "ACTIVE",
        });
        if (!assigneeMembership) {
          res.status(400).json({
            error: "Assignee is not an active member of this workspace",
          });
          return;
        }
        targetAssigneeId = new Types.ObjectId(assigneeId);
      }

      // 5. Source message and conversation validation (if supplied)
      let resolvedSourceMessageId: Types.ObjectId | undefined = undefined;
      let resolvedSourceConvId: Types.ObjectId | undefined = undefined;
      let sourceSnippet: string | undefined = undefined;

      if (sourceMessageId || sourceConversationId) {
        if (!sourceMessageId || !sourceConversationId) {
          res.status(400).json({
            error: "Both sourceMessageId and sourceConversationId must be provided together",
          });
          return;
        }

        if (
          !mongoose.Types.ObjectId.isValid(sourceMessageId) ||
          !mongoose.Types.ObjectId.isValid(sourceConversationId)
        ) {
          res.status(400).json({ error: "Invalid source message or conversation ID" });
          return;
        }

        // Verify conversation belongs to this workspace
        const conversation = await Conversation.findOne({
          _id: sourceConversationId,
          workspaceId,
        });

        if (!conversation) {
          res.status(400).json({
            error: "Source conversation does not belong to this workspace",
          });
          return;
        }

        // Verify caller has permission to view this conversation
        const isParticipant = conversation.participants.some(
          (p) => p.toString() === currentUserId.toString()
        );
        if (!isParticipant) {
          res.status(403).json({
            error: "Access denied. You are not a participant in the source conversation",
          });
          return;
        }

        // Verify message belongs to this conversation
        const message = await Message.findOne({
          _id: sourceMessageId,
          conversationId: sourceConversationId,
        });

        if (!message) {
          res.status(400).json({
            error: "Source message does not exist in the specified conversation",
          });
          return;
        }

        resolvedSourceMessageId = message._id;
        resolvedSourceConvId = conversation._id;
        sourceSnippet = message.text.slice(0, 300);
      }

      // 6. Create Task
      const newTask = await Task.create({
        workspaceId,
        title: title.trim(),
        description: typeof description === "string" ? description.trim() : "",
        createdBy: currentUserId,
        assigneeId: targetAssigneeId,
        priority: resolvedPriority,
        status: "TODO",
        dueDate: resolvedDueDate,
        sourceMessageId: resolvedSourceMessageId,
        sourceConversationId: resolvedSourceConvId,
        sourceSnippet,
      });

      // Populate user references
      const populatedTask = await Task.findById(newTask._id)
        .populate<{ createdBy: IUser }>("createdBy", "displayName email initials avatarUrl")
        .populate<{ assigneeId: IUser }>("assigneeId", "displayName email initials avatarUrl");

      const formatted = formatTask(populatedTask);

      // Real-time notification via Socket.IO
      try {
        const io = getIO();
        if (io) {
          io.to(`workspace:${workspaceId}`).emit("task:created", formatted);
          io.to(`user:${targetAssigneeId}`).emit("task:assigned", formatted);
        }
      } catch {
        // Socket emission failure handled gracefully
      }

      res.status(201).json({ task: formatted });
    } catch (error: any) {
      console.error("[WorkspaceTask] Error creating task:", error);
      res.status(500).json({ error: error?.message || "Failed to create task" });
    }
  }
);

// ==========================================
// B. CREATE TASK FROM MESSAGE (Explicit Route)
// POST /api/workspaces/:workspaceId/tasks/from-message
// ==========================================
router.post(
  "/:workspaceId/tasks/from-message",
  requireAuth,
  requireWorkspaceMember,
  async (req: WorkspaceAuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const workspaceId = req.workspace!._id;
      const currentUserId = req.user!._id;
      const {
        conversationId,
        messageId,
        title,
        description,
        assigneeId,
        priority,
        dueDate,
      } = req.body;

      if (!conversationId || !messageId) {
        res.status(400).json({ error: "conversationId and messageId are required" });
        return;
      }

      if (
        !mongoose.Types.ObjectId.isValid(conversationId) ||
        !mongoose.Types.ObjectId.isValid(messageId)
      ) {
        res.status(400).json({ error: "Invalid conversationId or messageId format" });
        return;
      }

      // Check conversation in workspace
      const conversation = await Conversation.findOne({
        _id: conversationId,
        workspaceId,
      });

      if (!conversation) {
        res.status(400).json({
          error: "Conversation does not belong to this workspace",
        });
        return;
      }

      // Verify caller is participant
      const isParticipant = conversation.participants.some(
        (p) => p.toString() === currentUserId.toString()
      );
      if (!isParticipant) {
        res.status(403).json({
          error: "Access denied: You are not authorized to access this conversation",
        });
        return;
      }

      // Verify message in conversation
      const message = await Message.findOne({
        _id: messageId,
        conversationId,
      });

      if (!message) {
        res.status(400).json({
          error: "Message not found in the referenced conversation",
        });
        return;
      }

      // Forward to standard creation
      const finalTitle = title && typeof title === "string" && title.trim()
        ? title.trim()
        : message.text.slice(0, 80).trim();

      const finalDescription = description !== undefined
        ? description
        : message.text;

      // Assignee validation
      let targetAssigneeId = currentUserId;
      if (assigneeId) {
        if (!mongoose.Types.ObjectId.isValid(assigneeId)) {
          res.status(400).json({ error: "Invalid assigneeId format" });
          return;
        }
        const assigneeMembership = await WorkspaceMember.findOne({
          workspaceId,
          userId: assigneeId,
          status: "ACTIVE",
        });
        if (!assigneeMembership) {
          res.status(400).json({ error: "Assignee is not an active member of this workspace" });
          return;
        }
        targetAssigneeId = new Types.ObjectId(assigneeId);
      }

      const validPriorities: TaskPriority[] = ["LOW", "MEDIUM", "HIGH", "URGENT"];
      const resolvedPriority: TaskPriority = priority
        ? priority.toUpperCase()
        : "MEDIUM";
      if (!validPriorities.includes(resolvedPriority)) {
        res.status(400).json({ error: "Invalid priority" });
        return;
      }

      let resolvedDueDate: Date | undefined = undefined;
      if (dueDate) {
        resolvedDueDate = new Date(dueDate);
        if (isNaN(resolvedDueDate.getTime())) {
          res.status(400).json({ error: "Invalid dueDate format" });
          return;
        }
      }

      const newTask = await Task.create({
        workspaceId,
        title: finalTitle,
        description: finalDescription,
        createdBy: currentUserId,
        assigneeId: targetAssigneeId,
        priority: resolvedPriority,
        status: "TODO",
        dueDate: resolvedDueDate,
        sourceMessageId: message._id,
        sourceConversationId: conversation._id,
        sourceSnippet: message.text.slice(0, 300),
      });

      const populatedTask = await Task.findById(newTask._id)
        .populate<{ createdBy: IUser }>("createdBy", "displayName email initials avatarUrl")
        .populate<{ assigneeId: IUser }>("assigneeId", "displayName email initials avatarUrl");

      const formatted = formatTask(populatedTask);

      try {
        const io = getIO();
        if (io) {
          io.to(`workspace:${workspaceId}`).emit("task:created", formatted);
          io.to(`user:${targetAssigneeId}`).emit("task:assigned", formatted);
        }
      } catch {}

      res.status(201).json({ task: formatted });
    } catch (error: any) {
      console.error("[WorkspaceTask] Error creating task from message:", error);
      res.status(500).json({ error: error?.message || "Failed to create task from message" });
    }
  }
);

// ==========================================
// C. LIST WORKSPACE TASKS (with filters)
// GET /api/workspaces/:workspaceId/tasks
// ==========================================
router.get(
  "/:workspaceId/tasks",
  requireAuth,
  requireWorkspaceMember,
  async (req: WorkspaceAuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const workspaceId = req.workspace!._id;
      const currentUserId = req.user!._id;
      const { filter, status, priority, assigneeId, search } = req.query;

      const queryFilter: any = { workspaceId };

      // Apply predefined view filters
      if (filter === "assigned_to_me" || filter === "assigned") {
        queryFilter.assigneeId = new Types.ObjectId(currentUserId.toString());
      } else if (filter === "created_by_me" || filter === "created") {
        queryFilter.createdBy = new Types.ObjectId(currentUserId.toString());
      } else if (filter === "completed") {
        queryFilter.status = "DONE";
      } else if (filter === "overdue") {
        queryFilter.dueDate = { $lt: new Date() };
        queryFilter.status = { $ne: "DONE" };
      }

      // Explicit status filter
      if (status && typeof status === "string") {
        queryFilter.status = status.toUpperCase();
      }

      // Explicit priority filter
      if (priority && typeof priority === "string") {
        queryFilter.priority = priority.toUpperCase();
      }

      // Explicit assignee filter
      if (assigneeId && typeof assigneeId === "string" && mongoose.Types.ObjectId.isValid(assigneeId)) {
        queryFilter.assigneeId = new Types.ObjectId(assigneeId);
      }

      // Search filter on title
      if (search && typeof search === "string" && search.trim()) {
        queryFilter.title = { $regex: search.trim(), $options: "i" };
      }

      const tasks = await Task.find(queryFilter)
        .populate<{ createdBy: IUser }>("createdBy", "displayName email initials avatarUrl")
        .populate<{ assigneeId: IUser }>("assigneeId", "displayName email initials avatarUrl")
        .sort({ createdAt: -1 });

      const formatted = tasks.map(formatTask);

      res.json({
        tasks: formatted,
        total: formatted.length,
      });
    } catch (error: any) {
      console.error("[WorkspaceTask] Error listing tasks:", error);
      res.status(500).json({ error: error?.message || "Failed to list tasks" });
    }
  }
);

// ==========================================
// D. WORKSPACE TASK SUMMARY STATISTICS (Manager Dashboard)
// GET /api/workspaces/:workspaceId/tasks/summary
// ==========================================
router.get(
  "/:workspaceId/tasks/summary",
  requireAuth,
  requireWorkspaceMember,
  async (req: WorkspaceAuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const workspaceId = req.workspace!._id;
      const wsObjectId = new Types.ObjectId(workspaceId.toString());
      const now = new Date();

      const [statusAgg, priorityAgg, overdueCount, allTasks] = await Promise.all([
        // Group by status
        Task.aggregate([
          { $match: { workspaceId: wsObjectId } },
          { $group: { _id: "$status", count: { $sum: 1 } } },
        ]),
        // Group by priority
        Task.aggregate([
          { $match: { workspaceId: wsObjectId } },
          { $group: { _id: "$priority", count: { $sum: 1 } } },
        ]),
        // Overdue count
        Task.countDocuments({
          workspaceId: wsObjectId,
          dueDate: { $lt: now },
          status: { $ne: "DONE" },
        }),
        // Fetch all active & completed for workload computation
        Task.find({ workspaceId: wsObjectId })
          .populate<{ assigneeId: IUser }>("assigneeId", "displayName initials email avatarUrl")
          .select("assigneeId status")
          .lean(),
      ]);

      const statusMap: Record<string, number> = {
        TODO: 0,
        IN_PROGRESS: 0,
        IN_REVIEW: 0,
        DONE: 0,
      };
      let total = 0;
      let completedCount = 0;

      for (const s of statusAgg) {
        statusMap[s._id] = s.count;
        total += s.count;
        if (s._id === "DONE") completedCount = s.count;
      }

      const priorityMap: Record<string, number> = {
        LOW: 0,
        MEDIUM: 0,
        HIGH: 0,
        URGENT: 0,
      };
      for (const p of priorityAgg) {
        priorityMap[p._id] = p.count;
      }

      // Compute workload per assignee
      const workloadMap = new Map<
        string,
        {
          userId: string;
          displayName: string;
          initials: string;
          activeCount: number;
          completedCount: number;
        }
      >();

      for (const t of allTasks) {
        if (!t.assigneeId) continue;
        const uId = (t.assigneeId as any)._id?.toString() || (t.assigneeId as any).toString();
        const displayName = (t.assigneeId as any).displayName || "Member";
        const initials = (t.assigneeId as any).initials || "U";

        if (!workloadMap.has(uId)) {
          workloadMap.set(uId, {
            userId: uId,
            displayName,
            initials,
            activeCount: 0,
            completedCount: 0,
          });
        }

        const entry = workloadMap.get(uId)!;
        if (t.status === "DONE") {
          entry.completedCount++;
        } else {
          entry.activeCount++;
        }
      }

      const workloadArray = Array.from(workloadMap.values()).map((w) => ({
        assignee: {
          id: w.userId,
          displayName: w.displayName,
          initials: w.initials,
          email: "",
        },
        activeTasks: w.activeCount,
        completedTasks: w.completedCount,
      }));

      res.json({
        summary: {
          totalTasks: total,
          total,
          activeTasks: total - completedCount,
          activeCount: total - completedCount,
          completedTasks: completedCount,
          completedCount,
          overdueTasks: overdueCount,
          overdueCount,
          statusBreakdown: statusMap,
          byStatus: statusMap,
          priorityBreakdown: priorityMap,
          byPriority: priorityMap,
          assigneeWorkload: workloadArray,
        },
      });
    } catch (error: any) {
      console.error("[WorkspaceTask] Error aggregating task summary:", error);
      res.status(500).json({ error: error?.message || "Failed to generate task summary" });
    }
  }
);

// ==========================================
// E. RETRIEVE TASK DETAILS
// GET /api/workspaces/:workspaceId/tasks/:taskId
// ==========================================
router.get(
  "/:workspaceId/tasks/:taskId",
  requireAuth,
  requireWorkspaceMember,
  async (req: WorkspaceAuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const workspaceId = req.workspace!._id;
      const { taskId } = req.params;

      if (!mongoose.Types.ObjectId.isValid(taskId)) {
        res.status(400).json({ error: "Invalid task ID format" });
        return;
      }

      const task = await Task.findOne({ _id: taskId, workspaceId })
        .populate<{ createdBy: IUser }>("createdBy", "displayName email initials avatarUrl")
        .populate<{ assigneeId: IUser }>("assigneeId", "displayName email initials avatarUrl");

      if (!task) {
        res.status(404).json({ error: "Task not found in this workspace" });
        return;
      }

      res.json({ task: formatTask(task) });
    } catch (error: any) {
      console.error("[WorkspaceTask] Error fetching task:", error);
      res.status(500).json({ error: error?.message || "Failed to fetch task" });
    }
  }
);

// ==========================================
// F. UPDATE TASK METADATA (Title, Description, Priority, DueDate)
// PATCH /api/workspaces/:workspaceId/tasks/:taskId
// ==========================================
router.patch(
  "/:workspaceId/tasks/:taskId",
  requireAuth,
  requireWorkspaceMember,
  async (req: WorkspaceAuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const workspaceId = req.workspace!._id;
      const currentUserId = req.user!._id;
      const { taskId } = req.params;
      const { title, description, priority, dueDate } = req.body;

      if (!mongoose.Types.ObjectId.isValid(taskId)) {
        res.status(400).json({ error: "Invalid task ID format" });
        return;
      }

      const task = await Task.findOne({ _id: taskId, workspaceId });
      if (!task) {
        res.status(404).json({ error: "Task not found in this workspace" });
        return;
      }

      // Authorization check: creator, assignee, or workspace managers/admins can update
      const memberRole = req.workspaceMember?.role;
      const isCreator = task.createdBy.toString() === currentUserId.toString();
      const isAssignee = task.assigneeId.toString() === currentUserId.toString();
      const isPrivileged = ["OWNER", "ADMIN", "MANAGER"].includes(memberRole || "");

      if (!isCreator && !isAssignee && !isPrivileged) {
        res.status(403).json({ error: "Unauthorized: You do not have permission to edit this task" });
        return;
      }

      if (title !== undefined) {
        if (typeof title !== "string" || title.trim().length < 2) {
          res.status(400).json({ error: "Task title must be at least 2 characters" });
          return;
        }
        task.title = title.trim().slice(0, 200);
      }

      if (description !== undefined) {
        task.description = typeof description === "string" ? description.trim().slice(0, 5000) : "";
      }

      if (priority !== undefined) {
        const validPriorities: TaskPriority[] = ["LOW", "MEDIUM", "HIGH", "URGENT"];
        const p = priority.toUpperCase();
        if (!validPriorities.includes(p)) {
          res.status(400).json({ error: "Invalid priority" });
          return;
        }
        task.priority = p;
      }

      if (dueDate !== undefined) {
        if (dueDate === null || dueDate === "") {
          task.dueDate = undefined;
        } else {
          const d = new Date(dueDate);
          if (isNaN(d.getTime())) {
            res.status(400).json({ error: "Invalid due date format" });
            return;
          }
          task.dueDate = d;
        }
      }

      await task.save();

      const populated = await Task.findById(task._id)
        .populate<{ createdBy: IUser }>("createdBy", "displayName email initials avatarUrl")
        .populate<{ assigneeId: IUser }>("assigneeId", "displayName email initials avatarUrl");

      const formatted = formatTask(populated);

      try {
        const io = getIO();
        if (io) {
          io.to(`workspace:${workspaceId}`).emit("task:updated", formatted);
        }
      } catch {}

      res.json({
        message: "Task updated successfully",
        task: formatted,
      });
    } catch (error: any) {
      console.error("[WorkspaceTask] Error updating task:", error);
      res.status(500).json({ error: error?.message || "Failed to update task" });
    }
  }
);

// ==========================================
// G. UPDATE TASK STATUS (TODO, IN_PROGRESS, IN_REVIEW, DONE)
// PATCH /api/workspaces/:workspaceId/tasks/:taskId/status
// ==========================================
router.patch(
  "/:workspaceId/tasks/:taskId/status",
  requireAuth,
  requireWorkspaceMember,
  async (req: WorkspaceAuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const workspaceId = req.workspace!._id;
      const currentUserId = req.user!._id;
      const { taskId } = req.params;
      const { status } = req.body;

      if (!mongoose.Types.ObjectId.isValid(taskId)) {
        res.status(400).json({ error: "Invalid task ID format" });
        return;
      }

      const validStatuses: TaskStatus[] = ["TODO", "IN_PROGRESS", "IN_REVIEW", "DONE"];
      const resolvedStatus = status ? status.toUpperCase() : null;
      if (!resolvedStatus || !validStatuses.includes(resolvedStatus)) {
        res.status(400).json({
          error: "Invalid status. Must be TODO, IN_PROGRESS, IN_REVIEW, or DONE",
        });
        return;
      }

      const task = await Task.findOne({ _id: taskId, workspaceId });
      if (!task) {
        res.status(404).json({ error: "Task not found in this workspace" });
        return;
      }

      // Check permission: creator, assignee, or manager/admin
      const memberRole = req.workspaceMember?.role;
      const isCreator = task.createdBy.toString() === currentUserId.toString();
      const isAssignee = task.assigneeId.toString() === currentUserId.toString();
      const isPrivileged = ["OWNER", "ADMIN", "MANAGER"].includes(memberRole || "");

      if (!isCreator && !isAssignee && !isPrivileged) {
        res.status(403).json({ error: "Unauthorized: You do not have permission to change this task status" });
        return;
      }

      task.status = resolvedStatus;
      if (resolvedStatus === "DONE") {
        task.completedAt = new Date();
      } else {
        task.completedAt = undefined;
      }

      await task.save();

      const populated = await Task.findById(task._id)
        .populate<{ createdBy: IUser }>("createdBy", "displayName email initials avatarUrl")
        .populate<{ assigneeId: IUser }>("assigneeId", "displayName email initials avatarUrl");

      const formatted = formatTask(populated);

      try {
        const io = getIO();
        if (io) {
          io.to(`workspace:${workspaceId}`).emit("task:status_changed", formatted);
          if (resolvedStatus === "DONE") {
            io.to(`workspace:${workspaceId}`).emit("task:completed", formatted);
          }
        }
      } catch {}

      res.json({
        message: `Task status updated to ${resolvedStatus}`,
        task: formatted,
      });
    } catch (error: any) {
      console.error("[WorkspaceTask] Error updating task status:", error);
      res.status(500).json({ error: error?.message || "Failed to update task status" });
    }
  }
);

// ==========================================
// H. REASSIGN TASK
// PATCH /api/workspaces/:workspaceId/tasks/:taskId/assignee
// ==========================================
router.patch(
  "/:workspaceId/tasks/:taskId/assignee",
  requireAuth,
  requireWorkspaceMember,
  async (req: WorkspaceAuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const workspaceId = req.workspace!._id;
      const currentUserId = req.user!._id;
      const { taskId } = req.params;
      const { assigneeId } = req.body;

      if (!mongoose.Types.ObjectId.isValid(taskId) || !assigneeId || !mongoose.Types.ObjectId.isValid(assigneeId)) {
        res.status(400).json({ error: "Valid taskId and assigneeId are required" });
        return;
      }

      const task = await Task.findOne({ _id: taskId, workspaceId });
      if (!task) {
        res.status(404).json({ error: "Task not found in this workspace" });
        return;
      }

      // Check permission: creator or manager/admin
      const memberRole = req.workspaceMember?.role;
      const isCreator = task.createdBy.toString() === currentUserId.toString();
      const isPrivileged = ["OWNER", "ADMIN", "MANAGER"].includes(memberRole || "");

      if (!isCreator && !isPrivileged) {
        res.status(403).json({ error: "Only the task creator or workspace managers can reassign this task" });
        return;
      }

      // Verify new assignee is active in workspace
      const targetMembership = await WorkspaceMember.findOne({
        workspaceId,
        userId: assigneeId,
        status: "ACTIVE",
      });

      if (!targetMembership) {
        res.status(400).json({ error: "Target assignee is not an active member of this workspace" });
        return;
      }

      task.assigneeId = new Types.ObjectId(assigneeId);
      await task.save();

      const populated = await Task.findById(task._id)
        .populate<{ createdBy: IUser }>("createdBy", "displayName email initials avatarUrl")
        .populate<{ assigneeId: IUser }>("assigneeId", "displayName email initials avatarUrl");

      const formatted = formatTask(populated);

      try {
        const io = getIO();
        if (io) {
          io.to(`workspace:${workspaceId}`).emit("task:assigned", formatted);
          io.to(`user:${assigneeId}`).emit("task:assigned", formatted);
        }
      } catch {}

      res.json({
        message: "Task reassigned successfully",
        task: formatted,
      });
    } catch (error: any) {
      console.error("[WorkspaceTask] Error reassigning task:", error);
      res.status(500).json({ error: error?.message || "Failed to reassign task" });
    }
  }
);

// ==========================================
// I. DELETE TASK
// DELETE /api/workspaces/:workspaceId/tasks/:taskId
// ==========================================
router.delete(
  "/:workspaceId/tasks/:taskId",
  requireAuth,
  requireWorkspaceMember,
  async (req: WorkspaceAuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const workspaceId = req.workspace!._id;
      const currentUserId = req.user!._id;
      const { taskId } = req.params;

      if (!mongoose.Types.ObjectId.isValid(taskId)) {
        res.status(400).json({ error: "Invalid task ID format" });
        return;
      }

      const task = await Task.findOne({ _id: taskId, workspaceId });
      if (!task) {
        res.status(404).json({ error: "Task not found in this workspace" });
        return;
      }

      // Only creator or workspace OWNER / ADMIN can delete
      const memberRole = req.workspaceMember?.role;
      const isCreator = task.createdBy.toString() === currentUserId.toString();
      const isOwnerOrAdmin = ["OWNER", "ADMIN"].includes(memberRole || "");

      if (!isCreator && !isOwnerOrAdmin) {
        res.status(403).json({ error: "Unauthorized: Only the task creator or workspace admin can delete this task" });
        return;
      }

      await Task.deleteOne({ _id: taskId });

      try {
        const io = getIO();
        if (io) {
          io.to(`workspace:${workspaceId}`).emit("task:deleted", { taskId });
        }
      } catch {}

      res.json({ message: "Task deleted successfully" });
    } catch (error: any) {
      console.error("[WorkspaceTask] Error deleting task:", error);
      res.status(500).json({ error: error?.message || "Failed to delete task" });
    }
  }
);

export default router;
