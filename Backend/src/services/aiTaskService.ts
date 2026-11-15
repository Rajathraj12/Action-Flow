import mongoose, { Types } from "mongoose";
import { spawn } from "child_process";
import path from "path";
import fs from "fs";
import { User, IUser } from "../models/User.js";
import { WorkspaceMember } from "../models/WorkspaceMember.js";
import { Message, IMessage } from "../models/Message.js";
import { Conversation, IConversation } from "../models/Conversation.js";
import { TaskPriority } from "../models/Task.js";

const AI_SERVICE_URL = process.env.AI_SERVICE_URL || "http://127.0.0.1:8000";
const AI_SERVICE_API_KEY = process.env.AI_SERVICE_API_KEY || "actionflow-internal-ai-key-2026";
const AI_TIMEOUT_MS = 6000;

export interface ExtractedTaskResult {
  title: string;
  assigneeName: string | null;
  assigneeId: string | null;
  assigneeUser: {
    id: string;
    displayName: string;
    email: string;
    initials: string;
    avatarUrl?: string;
  } | null;
  deadlineText: string | null;
  deadlineDate: string | null;
  priority: TaskPriority;
  confidence: number;
}

export interface AiDetectionResult {
  category: string;
  isTaskCandidate: boolean;
  needsConfirmation: boolean;
  confidence: number;
  tasks: ExtractedTaskResult[];
  warnings: string[];
  extractionStatus: string;
  sourceMessage: {
    id: string;
    conversationId: string;
    text: string;
    senderId: string;
    senderName: string;
    timestamp: string;
  };
}

/**
 * Calls the internal Python FastAPI AI inference service.
 */
async function callPythonAiService(payload: {
  message: string;
  sender?: string;
  timestamp?: string;
  team_members: string[];
}): Promise<any> {
  // 1. Direct Python Bridge Execution (Zero network dependency, executes trained Linear SVM pipeline directly)
  try {
    const candidatePaths = [
      path.resolve(process.cwd(), "AI-Service", "bridge.py"),
      path.resolve(process.cwd(), "..", "AI-Service", "bridge.py"),
    ];
    const bridgePath = candidatePaths.find((p) => fs.existsSync(p));

    if (bridgePath) {
      const pyProcess = spawn("python", [bridgePath]);

      const result = await new Promise<any>((resolve, reject) => {
        let stdout = "";
        let stderr = "";
        const timer = setTimeout(() => {
          pyProcess.kill();
          reject(new Error("Python bridge timeout"));
        }, 15000);

        pyProcess.stdout.on("data", (chunk) => (stdout += chunk.toString()));
        pyProcess.stderr.on("data", (chunk) => (stderr += chunk.toString()));

        pyProcess.on("close", (code) => {
          clearTimeout(timer);
          if (code === 0 && stdout.trim()) {
            try {
              const parsed = JSON.parse(stdout.trim());
              if (parsed.error) reject(new Error(parsed.error));
              else resolve(parsed);
            } catch (e: any) {
              reject(new Error(`Failed to parse Python output: ${stdout}`));
            }
          } else {
            reject(new Error(stderr || `Python process exited with code ${code}`));
          }
        });

        pyProcess.on("error", (err) => {
          clearTimeout(timer);
          reject(err);
        });

        pyProcess.stdin.write(JSON.stringify(payload));
        pyProcess.stdin.end();
      });

      return result;
    }
  } catch (pyErr: any) {
    console.warn(`[ActionFlow AI] Python bridge failed, trying HTTP: ${pyErr?.message}`);
  }

  // 2. HTTP Fallback
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);

  try {
    const response = await fetch(`${AI_SERVICE_URL}/detect`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": AI_SERVICE_API_KEY,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`AI Service returned ${response.status}: ${errText}`);
    }

    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Resolves extracted name against populated active workspace members.
 */
function matchAssigneeToWorkspaceMember(
  suggestedName: string | null,
  activeMembers: Array<{ user: IUser }>
): {
  matchedUser: IUser | null;
  isAmbiguous: boolean;
  warning?: string;
} {
  if (!suggestedName || !suggestedName.trim()) {
    return { matchedUser: null, isAmbiguous: false };
  }

  const cleanQuery = suggestedName.trim().toLowerCase();

  // 1. Exact match on full displayName or email
  const exactMatches = activeMembers.filter(
    (m) =>
      m.user.displayName.trim().toLowerCase() === cleanQuery ||
      m.user.email.toLowerCase() === cleanQuery
  );

  if (exactMatches.length === 1) {
    return { matchedUser: exactMatches[0].user, isAmbiguous: false };
  }

  // 2. First-name matching (e.g. "Rahul" vs "Rahul Sharma")
  const firstNameMatches = activeMembers.filter((m) => {
    const first = m.user.displayName.trim().split(/\s+/)[0].toLowerCase();
    return first === cleanQuery || m.user.displayName.toLowerCase().startsWith(cleanQuery + " ");
  });

  if (firstNameMatches.length === 1) {
    return { matchedUser: firstNameMatches[0].user, isAmbiguous: false };
  } else if (firstNameMatches.length > 1) {
    const names = firstNameMatches.map((m) => m.user.displayName).join(", ");
    return {
      matchedUser: null,
      isAmbiguous: true,
      warning: `Assignee '${suggestedName}' matches multiple members (${names}). Please select the intended assignee.`,
    };
  }

  return {
    matchedUser: null,
    isAmbiguous: false,
    warning: `Assignee '${suggestedName}' is not an active member in this workspace.`,
  };
}

/**
 * Main method: Orchestrates AI detection, roster mapping, and fallback handling.
 */
export async function detectTaskFromMessage(params: {
  workspaceId: Types.ObjectId | string;
  conversationId: Types.ObjectId | string;
  messageId: Types.ObjectId | string;
  currentUserId: Types.ObjectId | string;
}): Promise<AiDetectionResult> {
  const { workspaceId, conversationId, messageId } = params;

  // 1. Fetch message and conversation
  const message = await Message.findById(messageId).populate<{ sender: IUser }>(
    "sender",
    "displayName email initials avatarUrl"
  );
  if (!message) {
    throw new Error("Message not found.");
  }

  const conversation = await Conversation.findOne({
    _id: conversationId,
    workspaceId,
  });
  if (!conversation) {
    throw new Error("Conversation not found in workspace.");
  }

  // 2. Fetch all active workspace members
  const memberRecords = await WorkspaceMember.find({
    workspaceId,
    status: "ACTIVE",
  }).populate<{ userId: IUser }>("userId", "displayName email initials avatarUrl");

  const validMembers: Array<{ user: IUser }> = memberRecords
    .filter((m) => m.userId && typeof m.userId === "object" && (m.userId as any).displayName)
    .map((m) => ({ user: m.userId as unknown as IUser }));

  const teamMemberNames = validMembers.map((m) => m.user.displayName.trim());
  const senderUser = (message.sender as unknown as IUser) || null;
  const senderDisplayName =
    senderUser && typeof senderUser === "object"
      ? senderUser.displayName || "Teammate"
      : "Teammate";

  let aiRawResponse: any = null;
  const warnings: string[] = [];

  // 3. Call AI Service with graceful fallback
  try {
    aiRawResponse = await callPythonAiService({
      message: message.text,
      sender: senderDisplayName,
      timestamp: (message.createdAt || new Date()).toISOString(),
      team_members: teamMemberNames,
    });
  } catch (err: any) {
    console.warn(`[ActionFlow AI] Service fallback engaged: ${err?.message || err}`);
    warnings.push("AI inference service was offline or timed out. Used local heuristic fallback.");

    // Local deterministic fallback
    const textSnippet = message.text.trim();
    const isTaskLike =
      /\b(please|can you|fix|update|prepare|send|review|deploy|by tomorrow|by friday|urgent|asap)\b/i.test(
        textSnippet
      );

    aiRawResponse = {
      category: isTaskLike ? "clear_task" : "not_task",
      is_task_candidate: isTaskLike,
      needs_confirmation: false,
      confidence: 0.7,
      tasks: isTaskLike
        ? [
            {
              title: textSnippet.slice(0, 75).trim(),
              assignee: null,
              deadline_text: null,
              deadline_date: null,
              priority: null,
              confidence: 0.7,
            },
          ]
        : [],
      warnings: [],
      extraction_status: isTaskLike ? "success" : "no_task",
    };
  }

  // 4. Resolve tasks and link with actual MongoDB User IDs
  const resolvedTasks: ExtractedTaskResult[] = [];
  let finalNeedsConfirmation = Boolean(aiRawResponse.needs_confirmation);

  if (Array.isArray(aiRawResponse.warnings)) {
    warnings.push(...aiRawResponse.warnings);
  }

  for (const rawTask of aiRawResponse.tasks || []) {
    const rawAssignee = rawTask.assignee || null;
    const { matchedUser, isAmbiguous, warning } = matchAssigneeToWorkspaceMember(
      rawAssignee,
      validMembers
    );

    if (warning) {
      warnings.push(warning);
    }
    if (isAmbiguous) {
      finalNeedsConfirmation = true;
    }

    // Map priority
    let mappedPriority: TaskPriority = "MEDIUM";
    if (rawTask.priority) {
      const p = String(rawTask.priority).toUpperCase();
      if (p === "LOW" || p === "HIGH" || p === "URGENT") {
        mappedPriority = p as TaskPriority;
      }
    }

    resolvedTasks.push({
      title: rawTask.title || message.text.slice(0, 60),
      assigneeName: matchedUser ? matchedUser.displayName : rawAssignee,
      assigneeId: matchedUser ? matchedUser._id.toString() : null,
      assigneeUser: matchedUser
        ? {
            id: matchedUser._id.toString(),
            displayName: matchedUser.displayName,
            email: matchedUser.email,
            initials: matchedUser.initials || "U",
            avatarUrl: matchedUser.avatarUrl,
          }
        : null,
      deadlineText: rawTask.deadline_text || null,
      deadlineDate: rawTask.deadline_date || null,
      priority: mappedPriority,
      confidence: typeof rawTask.confidence === "number" ? rawTask.confidence : 0.85,
    });
  }

  return {
    category: aiRawResponse.category || "clear_task",
    isTaskCandidate: Boolean(aiRawResponse.is_task_candidate),
    needsConfirmation: finalNeedsConfirmation,
    confidence: typeof aiRawResponse.confidence === "number" ? aiRawResponse.confidence : 0.85,
    tasks: resolvedTasks,
    warnings,
    extractionStatus: aiRawResponse.extraction_status || (resolvedTasks.length > 0 ? "success" : "no_task"),
    sourceMessage: {
      id: message._id.toString(),
      conversationId: conversation._id.toString(),
      text: message.text,
      senderId:
        message.sender && typeof message.sender === "object"
          ? (message.sender as any)._id.toString()
          : String(message.sender),
      senderName: senderDisplayName,
      timestamp: (message.createdAt || new Date()).toISOString(),
    },
  };
}

function formatIsoToDateDisplay(isoDate: string, timeStr?: string | null): string {
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
}

/**
 * Fast real-time AI scan for a single message string.
 */


export async function fastAutoDetectTask(
  text: string,
  senderName: string = "Teammate",
  teamMembers: string[] = []
): Promise<{
  isTaskCandidate: boolean;
  category: string;
  confidence: number;
  tasks: Array<{
    title: string;
    assigneeName?: string | null;
    priority?: string | null;
    deadlineText?: string | null;
    deadlineDate?: string | null;
  }>;
}> {
  try {
    const raw = await callPythonAiService({
      message: text,
      sender: senderName,
      timestamp: new Date().toISOString(),
      team_members: teamMembers,
    });

    const isTaskCandidate = Boolean(raw.is_task_candidate);
    const category = raw.category || (isTaskCandidate ? "clear_task" : "not_task");
    const confidence = typeof raw.confidence === "number" ? raw.confidence : 0.85;

    const tasks = (raw.tasks || []).map((t: any) => ({
      title: t.title || text.slice(0, 60),
      assigneeName: t.assignee || null,
      priority: t.priority ? String(t.priority).toUpperCase() : "MEDIUM",
      deadlineText: t.deadline_date
        ? (t.deadline_text && /\d{2}\s+[A-Za-z]{3}\s+\d{4}/.test(t.deadline_text) ? t.deadline_text : formatIsoToDateDisplay(t.deadline_date))
        : (t.deadline_text || (isTaskCandidate ? "ASAP" : null)),
      deadlineDate: t.deadline_date || null,
      confidence: typeof t.confidence === "number" ? t.confidence : confidence,
    }));

    return {
      isTaskCandidate,
      category,
      confidence,
      tasks,
    };
  } catch (err) {
    // Fast regex heuristic fallback if AI service is temporarily busy
    const textSnippet = text.trim();
    const isTaskLike =
      /\b(please|can you|could you|schedule|meeting|client meeting|call|fix|update|prepare|send|review|deploy|by tomorrow|by monday|by friday|urgent|asap|verify)\b/i.test(
        textSnippet
      );

    let extractedAssignee: string | null = null;
    if (teamMembers && teamMembers.length > 0) {
      for (const tm of teamMembers) {
        if (!tm) continue;
        const re = new RegExp(`\\b${tm}\\b`, "i");
        if (re.test(textSnippet)) {
          extractedAssignee = tm;
          break;
        }
      }
    }

    let deadlineText: string | null = null;
    let deadlineDate: string | null = null;

    const timeMatch = textSnippet.match(/\b(?:at\s+)?(\d{1,2}(?::\d{2})?\s*(?:am|pm))\b/i);
    const extractedTime = timeMatch ? timeMatch[1].toUpperCase() : null;

function formatToLocalDateString(dateObj: Date): string {
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
}

    // Support relative days ("two days from now", "in 2 days", "within 3 days", etc.)
    const relDaysMatch = textSnippet.match(
      /\b((?:by|before|in|within|after)\s+(?:a\s+)?)?(\d+|a|an|one|two|couple(?:\s+of)?|three|few|four|five|six|seven|eight|nine|ten)\s+days?(?:\s+(?:from\s+now|later))?\b/i
    );
    if (relDaysMatch) {
      const wordMap: Record<string, number> = {
        a: 1, an: 1, one: 1, two: 2, couple: 2, "couple of": 2,
        three: 3, few: 3, four: 4, five: 5, six: 6, seven: 7,
        eight: 8, nine: 9, ten: 10,
      };
      const numRaw = relDaysMatch[2].toLowerCase();
      const num = /^\d+$/.test(numRaw) ? parseInt(numRaw, 10) : (wordMap[numRaw] || 2);
      const d = new Date();
      d.setDate(d.getDate() + num);
      deadlineDate = formatToLocalDateString(d);
      deadlineText = formatIsoToDateDisplay(deadlineDate, extractedTime);
    } else {
      const weekdayMatch = textSnippet.match(
        /\b(?:by|before|on|for)?\s*(monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|wed|thu|fri|sat|sun)\b/i
      );
      const keywordMatch = textSnippet.match(
        /\b(day\s*after\s*tomorrow|parso|tomorrow|kal|today|tonight|eod|end\s*of\s*day|aaj)\b/i
      );
      const refDate = new Date();

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
        deadlineDate = formatToLocalDateString(d);
        deadlineText = formatIsoToDateDisplay(deadlineDate, extractedTime);
      } else if (keywordMatch) {
        const kw = keywordMatch[0].toLowerCase();
        const d = new Date(refDate);
        if (/day\s*after\s*tomorrow|parso/i.test(kw)) {
          d.setDate(d.getDate() + 2);
        } else if (/tomorrow|kal/i.test(kw)) {
          d.setDate(d.getDate() + 1);
        }
        deadlineDate = formatToLocalDateString(d);
        deadlineText = formatIsoToDateDisplay(deadlineDate, extractedTime);
      } else {
        const deadlineMatch = textSnippet.match(
          /\b(by\s+\w+|for\s+\w+(?:\s+at\s+\d+(?::\d+)?\s*(?:am|pm)?)?|next\s+week)\b/i
        );
        if (deadlineMatch) {
          deadlineText = deadlineMatch[0];
        }
      }
    }

    // Clean title by stripping leading name callouts like "Harsha, " or "Hey Rajath: "
    let cleanTitle = textSnippet;
    if (extractedAssignee) {
      cleanTitle = cleanTitle.replace(new RegExp(`^${extractedAssignee}[,:]?\\s*`, "i"), "");
    }
    cleanTitle = cleanTitle.replace(/^(please|can you|could you)\s+/i, "");
    if (deadlineText) {
      cleanTitle = cleanTitle.replace(new RegExp(`\\s*${deadlineText}\\s*`, "i"), " ");
    }
    cleanTitle = cleanTitle.replace(/\s+/g, " ").trim();
    cleanTitle = cleanTitle.charAt(0).toUpperCase() + cleanTitle.slice(1, 80).trim();

    return {
      isTaskCandidate: isTaskLike,
      category: isTaskLike ? "looks_like_task" : "not_task",
      confidence: 0.85,
      tasks: isTaskLike
        ? [
            {
              title: cleanTitle || textSnippet.slice(0, 75).trim(),
              assigneeName: extractedAssignee,
              priority: /asap|urgent/i.test(textSnippet) ? "URGENT" : "MEDIUM",
              deadlineText: deadlineText || (isTaskLike ? "ASAP" : null),
              deadlineDate,
            },
          ]
        : [],
    };
  }
}

/**
 * Scans all unscanned messages in a conversation and saves detection metadata in MongoDB.
 */
export async function scanConversationMessages(
  conversationId: string | Types.ObjectId,
  workspaceId: string | Types.ObjectId
): Promise<Record<string, any>> {
  const memberRecords = await WorkspaceMember.find({
    workspaceId,
    status: "ACTIVE",
  }).populate<{ userId: IUser }>("userId", "displayName");

  const teamMemberNames = memberRecords
    .filter((m) => m.userId && typeof m.userId === "object" && (m.userId as any).displayName)
    .map((m) => (m.userId as any).displayName.trim());

  // Find messages in conversation without detectedAt
  const unscannedMessages = await Message.find({
    conversationId,
    isDeletedForEveryone: false,
    $or: [
      { "aiTaskDetection.detectedAt": { $exists: false } },
      { aiTaskDetection: { $exists: false } },
      { "aiTaskDetection.isTaskCandidate": false },
      { "aiTaskDetection.confidence": { $lte: 0.75 } },
    ],
  }).populate<{ sender: IUser }>("sender", "displayName initials email").limit(50);

  const results: Record<string, any> = {};

  for (const msg of unscannedMessages) {
    const senderDisplayName = (msg.sender as any)?.displayName || "Teammate";
    const detection = await fastAutoDetectTask(msg.text, senderDisplayName, teamMemberNames);
    const aiData = {
      ...detection,
      detectedAt: new Date(),
    };

    msg.aiTaskDetection = aiData;
    await msg.save();
    results[msg._id.toString()] = aiData;
  }

  return results;
}
