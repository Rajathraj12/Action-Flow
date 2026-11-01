import { Task, ITask } from "../models/Task.js";
import { createNotification } from "./notificationService.js";

let reminderInterval: NodeJS.Timeout | null = null;

/**
 * Checks all active tasks with due dates in the database and generates
 * deduplicated DUE_SOON (<= 24 hours) and OVERDUE reminders.
 */
export async function runDueTaskReminders(): Promise<{
  processed: number;
  remindersSent: number;
}> {
  const now = new Date();
  const twentyFourHoursFromNow = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  // Find all uncompleted tasks with a due date
  const tasks = await Task.find({
    status: { $ne: "DONE" },
    dueDate: { $exists: true, $ne: null },
  });

  let remindersSent = 0;

  for (const task of tasks) {
    if (!task.dueDate || !task.assigneeId) continue;

    const dueTime = new Date(task.dueDate).getTime();
    const nowTime = now.getTime();
    const diffMs = dueTime - nowTime;

    const sent = task.remindersSent || [];
    let updated = false;

    // 1. Task Due Soon (Due within next 24 hours and not overdue)
    if (diffMs > 0 && diffMs <= 24 * 60 * 60 * 1000) {
      if (!sent.includes("DUE_SOON")) {
        await createNotification({
          recipientId: task.assigneeId,
          workspaceId: task.workspaceId,
          taskId: task._id,
          type: "TASK_DUE_SOON",
          title: "Task Due Soon",
          description: `Task "${task.title}" is due within 24 hours (${new Date(task.dueDate).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}).`,
          destination: {
            type: "task",
            id: task._id.toString(),
          },
        });

        sent.push("DUE_SOON");
        updated = true;
        remindersSent++;
      }
    }

    // 2. Task Overdue (Due date is in the past and task is still not DONE)
    if (diffMs < 0) {
      if (!sent.includes("OVERDUE")) {
        await createNotification({
          recipientId: task.assigneeId,
          workspaceId: task.workspaceId,
          taskId: task._id,
          type: "TASK_OVERDUE",
          title: "Task Overdue",
          description: `Task "${task.title}" is overdue since ${new Date(task.dueDate).toLocaleDateString([], { month: "short", day: "numeric" })}.`,
          destination: {
            type: "task",
            id: task._id.toString(),
          },
        });

        sent.push("OVERDUE");
        updated = true;
        remindersSent++;
      }
    }

    if (updated) {
      task.remindersSent = sent;
      await task.save();
    }
  }

  return {
    processed: tasks.length,
    remindersSent,
  };
}

/**
 * Starts the periodic reminder scheduler.
 */
export function startReminderScheduler(intervalMs = 15 * 60 * 1000) {
  if (reminderInterval) {
    clearInterval(reminderInterval);
  }

  // Initial check after 5 seconds to handle any tasks due on server startup
  setTimeout(() => {
    runDueTaskReminders().catch((err) => {
      console.error("[ReminderScheduler] Error running initial reminders:", err);
    });
  }, 5000);

  // Periodic interval
  reminderInterval = setInterval(() => {
    runDueTaskReminders().catch((err) => {
      console.error("[ReminderScheduler] Error running periodic reminders:", err);
    });
  }, intervalMs);

  console.log(`[ReminderScheduler] Started background deadline reminder scheduler (interval: ${intervalMs / 1000}s)`);
}

/**
 * Stops the periodic reminder scheduler.
 */
export function stopReminderScheduler() {
  if (reminderInterval) {
    clearInterval(reminderInterval);
    reminderInterval = null;
    console.log("[ReminderScheduler] Stopped reminder scheduler");
  }
}
