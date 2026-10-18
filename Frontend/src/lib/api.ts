const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:5000";

let authToken: string | null = null;
let activeWorkspaceId: string | null = null;

export function setApiToken(token: string | null): void {
  authToken = token;
}

export function getApiToken(): string | null {
  return authToken;
}

export function setActiveWorkspaceId(workspaceId: string | null): void {
  activeWorkspaceId = workspaceId;
}

export function getActiveWorkspaceId(): string | null {
  return activeWorkspaceId;
}

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers || {});
  headers.set("Content-Type", "application/json");

  if (authToken) {
    headers.set("Authorization", `Bearer ${authToken}`);
  }

  if (activeWorkspaceId) {
    headers.set("x-workspace-id", activeWorkspaceId);
  }

  const url = `${BACKEND_URL}${endpoint}`;
  let response: Response;

  try {
    response = await fetch(url, {
      ...options,
      headers,
    });
  } catch (netErr: any) {
    throw new Error(
      `Network error connecting to backend at ${BACKEND_URL}. Ensure the backend server is running.`
    );
  }

  if (!response.ok) {
    let errorMsg = `Request failed (${response.status})`;
    try {
      const errorJson = await response.json();
      if (errorJson.error) {
        errorMsg = errorJson.error;
      }
    } catch {
      // ignore json parse error
    }
    throw new Error(errorMsg);
  }

  return response.json();
}

export interface BackendUser {
  _id: string;
  firebaseUid: string;
  email: string;
  displayName: string;
  initials: string;
  role: string;
  online: boolean;
  lastSeen?: string;
}

export interface BackendConversation {
  id: string;
  workspaceId?: string;
  type?: "DIRECT" | "GROUP";
  name: string;
  description?: string;
  role: string;
  initials: string;
  online: boolean;
  unread: number;
  lastMessageText: string;
  lastMessageTime: string;
  lastMessageAt?: string;
  lastMessageId?: string;
  createdBy?: string;
  admins?: string[];
  myGroupRole?: "GROUP_ADMIN" | "MEMBER";
  participantCount?: number;
  participants?: Array<{
    id: string;
    displayName: string;
    email: string;
    initials: string;
    avatarUrl?: string;
    groupRole?: "GROUP_ADMIN" | "MEMBER";
    role?: string;
    online?: boolean;
  }>;
  otherUser?: {
    id: string;
    displayName: string;
    email: string;
    initials: string;
    online: boolean;
    role?: string;
    avatarUrl?: string;
  } | null;
}

export interface BackendMessage {
  id: string;
  from: "me" | "them";
  text: string;
  time: string;
  createdAt: string;
  status: "sent" | "delivered" | "read";
  isEdited?: boolean;
  editedAt?: string;
  isDeletedForEveryone?: boolean;
  deliveredAt?: string;
  readAt?: string;
  sender?: {
    id: string;
    displayName: string;
    initials: string;
  };
}

export interface MessageInfoResponse {
  id: string;
  text: string;
  status: "sent" | "delivered" | "read";
  isEdited: boolean;
  editedAt?: string;
  isDeletedForEveryone: boolean;
  sentAt: string;
  deliveredAt?: string | null;
  readAt?: string | null;
  sender: {
    id: string;
    displayName: string;
    email: string;
    initials: string;
  };
  recipient?: {
    id: string;
    displayName: string;
    email: string;
    initials: string;
    online: boolean;
  } | null;
}

export const api = {
  getMe: () => request<{ user: BackendUser }>("/api/auth/me"),
  getUsers: () => request<{ users: BackendUser[] }>("/api/auth/users"),
  getConversations: () => request<{ conversations: BackendConversation[] }>("/api/conversations"),
  createConversation: (recipientId: string) =>
    request<{ conversation: BackendConversation; isExisting: boolean }>("/api/conversations", {
      method: "POST",
      body: JSON.stringify({ recipientId }),
    }),
  getMessages: (conversationId: string, limit = 50) =>
    request<{ messages: BackendMessage[]; total: number }>(
      `/api/conversations/${conversationId}/messages?limit=${limit}`
    ),
  sendMessage: (conversationId: string, text: string) =>
    request<{ message: BackendMessage }>(`/api/conversations/${conversationId}/messages`, {
      method: "POST",
      body: JSON.stringify({ text }),
    }),
  editMessage: (conversationId: string, messageId: string, text: string) =>
    request<{ success: boolean; message: { id: string; text: string; isEdited: boolean; editedAt: string } }>(
      `/api/conversations/${conversationId}/messages/${messageId}`,
      {
        method: "PUT",
        body: JSON.stringify({ text }),
      }
    ),
  deleteMessage: (conversationId: string, messageId: string, deleteType: "everyone" | "me") =>
    request<{ success: boolean; deleteType: string; messageId: string }>(
      `/api/conversations/${conversationId}/messages/${messageId}`,
      {
        method: "DELETE",
        body: JSON.stringify({ deleteType }),
      }
    ),
  getMessageInfo: (conversationId: string, messageId: string) =>
    request<{ info: MessageInfoResponse }>(
      `/api/conversations/${conversationId}/messages/${messageId}/info`
    ),
  markConversationRead: (conversationId: string) =>
    request<{ success: boolean; count: number }>(`/api/conversations/${conversationId}/read`, {
      method: "POST",
    }),

  // ==========================================
  // Workspace & Member APIs (Phase 1)
  // ==========================================
  getWorkspaces: () => request<{ workspaces: Workspace[] }>("/api/workspaces"),
  createWorkspace: (name: string) =>
    request<{ workspace: Workspace; membership: any }>("/api/workspaces", {
      method: "POST",
      body: JSON.stringify({ name }),
    }),
  getWorkspace: (workspaceId: string) =>
    request<{ workspace: Workspace }>(`/api/workspaces/${workspaceId}`),
  updateWorkspace: (workspaceId: string, name: string) =>
    request<{ message: string; workspace: Workspace }>(`/api/workspaces/${workspaceId}`, {
      method: "PATCH",
      body: JSON.stringify({ name }),
    }),
  getWorkspaceMembers: (workspaceId: string) =>
    request<{ members: WorkspaceMember[] }>(`/api/workspaces/${workspaceId}/members`),
  inviteWorkspaceMember: (workspaceId: string, email: string, role: string) =>
    request<{ message: string; invitation: WorkspaceInvitation }>(
      `/api/workspaces/${workspaceId}/invitations`,
      {
        method: "POST",
        body: JSON.stringify({ email, role }),
      }
    ),
  getWorkspaceInvitations: (workspaceId: string) =>
    request<{ invitations: WorkspaceInvitation[] }>(`/api/workspaces/${workspaceId}/invitations`),
  revokeWorkspaceInvitation: (workspaceId: string, invitationId: string) =>
    request<{ message: string }>(
      `/api/workspaces/${workspaceId}/invitations/${invitationId}`,
      {
        method: "DELETE",
      }
    ),
  acceptWorkspaceInvitation: (token: string) =>
    request<{ message: string; workspace: Workspace }>(
      `/api/workspaces/invitations/${token}/accept`,
      {
        method: "POST",
      }
    ),
  updateMemberRole: (workspaceId: string, memberId: string, role: WorkspaceRole) =>
    request<{ message: string; member: { id: string; userId: string; role: WorkspaceRole } }>(
      `/api/workspaces/${workspaceId}/members/${memberId}/role`,
      {
        method: "PATCH",
        body: JSON.stringify({ role }),
      }
    ),
  removeWorkspaceMember: (workspaceId: string, memberId: string) =>
    request<{ message: string }>(`/api/workspaces/${workspaceId}/members/${memberId}`, {
      method: "DELETE",
    }),

  // ==========================================
  // Workspace Direct Messaging APIs (Phase 2)
  // ==========================================
  searchWorkspaceColleagues: (workspaceId: string, search?: string) =>
    request<{ users: BackendUser[] }>(
      `/api/workspaces/${workspaceId}/users${search ? `?search=${encodeURIComponent(search)}` : ""}`
    ),
  getWorkspaceConversations: (workspaceId: string) =>
    request<{ conversations: BackendConversation[] }>(`/api/workspaces/${workspaceId}/conversations`),
  createDirectConversation: (workspaceId: string, participantId: string) =>
    request<{ conversation: BackendConversation; isExisting: boolean }>(
      `/api/workspaces/${workspaceId}/conversations/direct`,
      {
        method: "POST",
        body: JSON.stringify({ participantId }),
      }
    ),
  getWorkspaceMessages: (workspaceId: string, conversationId: string, limit = 50, before?: string) =>
    request<{ messages: BackendMessage[]; total: number }>(
      `/api/workspaces/${workspaceId}/conversations/${conversationId}/messages?limit=${limit}${
        before ? `&before=${encodeURIComponent(before)}` : ""
      }`
    ),
  sendWorkspaceMessage: (workspaceId: string, conversationId: string, text: string) =>
    request<{ message: BackendMessage }>(
      `/api/workspaces/${workspaceId}/conversations/${conversationId}/messages`,
      {
        method: "POST",
        body: JSON.stringify({ text }),
      }
    ),
  markWorkspaceConversationRead: (workspaceId: string, conversationId: string) =>
    request<{ success: boolean; count: number }>(
      `/api/workspaces/${workspaceId}/conversations/${conversationId}/read`,
      {
        method: "POST",
      }
    ),

  // ==========================================
  // Workspace Group Messaging APIs (Phase 3)
  // ==========================================
  createGroupConversation: (
    workspaceId: string,
    name: string,
    description?: string,
    participantIds: string[] = []
  ) =>
    request<{ conversation: BackendConversation }>("/api/workspaces/" + workspaceId + "/conversations/group", {
      method: "POST",
      body: JSON.stringify({ name, description, participantIds }),
    }),
  getGroupDetails: (workspaceId: string, conversationId: string) =>
    request<{ conversation: BackendConversation }>(
      `/api/workspaces/${workspaceId}/conversations/${conversationId}`
    ),
  updateGroupDetails: (
    workspaceId: string,
    conversationId: string,
    data: { name?: string; description?: string }
  ) =>
    request<{ message: string; conversation: { id: string; name: string; description: string } }>(
      `/api/workspaces/${workspaceId}/conversations/${conversationId}`,
      {
        method: "PATCH",
        body: JSON.stringify(data),
      }
    ),
  addGroupMember: (workspaceId: string, conversationId: string, userId: string) =>
    request<{ message: string; member: { id: string; displayName: string; role: string } }>(
      `/api/workspaces/${workspaceId}/conversations/${conversationId}/members`,
      {
        method: "POST",
        body: JSON.stringify({ userId }),
      }
    ),
  removeGroupMember: (workspaceId: string, conversationId: string, userId: string) =>
    request<{ message: string }>(
      `/api/workspaces/${workspaceId}/conversations/${conversationId}/members/${userId}`,
      {
        method: "DELETE",
      }
    ),
  leaveGroup: (workspaceId: string, conversationId: string) =>
    request<{ message: string }>(
      `/api/workspaces/${workspaceId}/conversations/${conversationId}/leave`,
      {
        method: "POST",
      }
    ),
  updateGroupMemberRole: (
    workspaceId: string,
    conversationId: string,
    userId: string,
    role: "GROUP_ADMIN" | "MEMBER"
  ) =>
    request<{ message: string; member: { id: string; role: string } }>(
      `/api/workspaces/${workspaceId}/conversations/${conversationId}/admins/${userId}`,
      {
        method: "PATCH",
        body: JSON.stringify({ role }),
      }
    ),

  // ==========================================
  // Workspace Task APIs (Phase 4)
  // ==========================================
  getTasks: (
    workspaceId: string,
    params?: {
      filter?: "all" | "assigned_to_me" | "created_by_me" | "completed" | "overdue";
      status?: TaskStatus;
      priority?: TaskPriority;
      assigneeId?: string;
      search?: string;
    }
  ) => {
    const query = new URLSearchParams();
    if (params?.filter) query.set("filter", params.filter);
    if (params?.status) query.set("status", params.status);
    if (params?.priority) query.set("priority", params.priority);
    if (params?.assigneeId) query.set("assigneeId", params.assigneeId);
    if (params?.search) query.set("search", params.search);
    const qs = query.toString();
    return request<{ tasks: BackendTask[]; total: number }>(
      `/api/workspaces/${workspaceId}/tasks${qs ? `?${qs}` : ""}`
    );
  },
  getTask: (workspaceId: string, taskId: string) =>
    request<{ task: BackendTask }>(`/api/workspaces/${workspaceId}/tasks/${taskId}`),
  createTask: (
    workspaceId: string,
    data: {
      title: string;
      description?: string;
      assigneeId?: string;
      priority?: TaskPriority;
      dueDate?: string;
      sourceMessageId?: string;
      sourceConversationId?: string;
    }
  ) =>
    request<{ task: BackendTask }>(`/api/workspaces/${workspaceId}/tasks`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
  createTaskFromMessage: (
    workspaceId: string,
    data: {
      conversationId: string;
      messageId: string;
      title?: string;
      description?: string;
      assigneeId?: string;
      priority?: TaskPriority;
      dueDate?: string;
    }
  ) =>
    request<{ task: BackendTask }>(`/api/workspaces/${workspaceId}/tasks/from-message`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
  updateTask: (
    workspaceId: string,
    taskId: string,
    data: {
      title?: string;
      description?: string;
      priority?: TaskPriority;
      dueDate?: string | null;
    }
  ) =>
    request<{ message: string; task: BackendTask }>(
      `/api/workspaces/${workspaceId}/tasks/${taskId}`,
      {
        method: "PATCH",
        body: JSON.stringify(data),
      }
    ),
  updateTaskStatus: (workspaceId: string, taskId: string, status: TaskStatus) =>
    request<{ message: string; task: BackendTask }>(
      `/api/workspaces/${workspaceId}/tasks/${taskId}/status`,
      {
        method: "PATCH",
        body: JSON.stringify({ status }),
      }
    ),
  reassignTask: (workspaceId: string, taskId: string, assigneeId: string) =>
    request<{ message: string; task: BackendTask }>(
      `/api/workspaces/${workspaceId}/tasks/${taskId}/assignee`,
      {
        method: "PATCH",
        body: JSON.stringify({ assigneeId }),
      }
    ),
  deleteTask: (workspaceId: string, taskId: string) =>
    request<{ message: string }>(`/api/workspaces/${workspaceId}/tasks/${taskId}`, {
      method: "DELETE",
    }),
  getTaskSummary: (workspaceId: string) =>
    request<{ summary: TaskSummaryResponse }>(`/api/workspaces/${workspaceId}/tasks/summary`),
};

export type WorkspaceRole = "OWNER" | "ADMIN" | "MANAGER" | "MEMBER";

export interface Workspace {
  id: string;
  name: string;
  slug: string;
  createdBy: string;
  createdAt: string;
  updatedAt?: string;
  myRole?: WorkspaceRole;
  myStatus?: string;
  memberCount?: number;
}

export interface WorkspaceMember {
  id: string;
  userId: string;
  displayName: string;
  email: string;
  initials: string;
  avatarUrl?: string;
  role: WorkspaceRole;
  status: "ACTIVE" | "INVITED" | "SUSPENDED";
  joinedAt: string;
  online?: boolean;
}

export interface WorkspaceInvitation {
  id: string;
  email: string;
  role: "ADMIN" | "MANAGER" | "MEMBER";
  token: string;
  expiresAt: string;
  status: "PENDING" | "ACCEPTED" | "REVOKED" | "EXPIRED";
  createdAt: string;
  invitedBy?: {
    displayName: string;
    email: string;
  };
}

export type TaskStatus = "TODO" | "IN_PROGRESS" | "IN_REVIEW" | "DONE";
export type TaskPriority = "LOW" | "MEDIUM" | "HIGH" | "URGENT";

export interface BackendTask {
  id: string;
  workspaceId: string;
  title: string;
  description?: string;
  priority: TaskPriority;
  status: TaskStatus;
  dueDate?: string | null;
  completedAt?: string | null;
  isOverdue?: boolean;
  createdBy: {
    id: string;
    displayName: string;
    email: string;
    initials: string;
    avatarUrl?: string;
  } | null;
  assignee: {
    id: string;
    displayName: string;
    email: string;
    initials: string;
    avatarUrl?: string;
  } | null;
  sourceMessageId?: string | null;
  sourceConversationId?: string | null;
  sourceSnippet?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TaskSummaryResponse {
  total: number;
  activeCount: number;
  completedCount: number;
  overdueCount: number;
  byStatus: {
    TODO: number;
    IN_PROGRESS: number;
    IN_REVIEW: number;
    DONE: number;
  };
  byPriority: {
    LOW: number;
    MEDIUM: number;
    HIGH: number;
    URGENT: number;
  };
  assigneeWorkload: Array<{
    userId: string;
    displayName: string;
    initials: string;
    activeCount: number;
    completedCount: number;
  }>;
}

