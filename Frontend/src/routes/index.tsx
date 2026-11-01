import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  Check,
  CheckCheck,
  Plus,
  Search,
  Send,
  Loader2,
  Wifi,
  WifiOff,
  MessageSquare,
  Smile,
  Paperclip,
  MoreVertical,
  Pencil,
  Trash2,
  Info,
  Copy,
  X,
  Ban,
  Phone,
  Video,
  Sparkles,
  Zap,
  ShieldCheck,
  UserPlus,
  MessageCircle,
  Users,
  CheckSquare,
  ChevronUp,
  ChevronDown,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useAuth } from "@/context/AuthContext";
import { useWorkspace } from "@/context/WorkspaceContext";
import {
  api,
  type BackendConversation,
  type BackendMessage,
  type BackendUser,
} from "@/lib/api";
import {
  initSocketClient,
  joinConversationRoom,
  leaveConversationRoom,
  type SocketConnectionStatus,
} from "@/lib/socket";
import { NewConversationModal } from "@/components/chat/NewConversationModal";
import { MessageInfoModal } from "@/components/chat/MessageInfoModal";
import { DeleteMessageModal } from "@/components/chat/DeleteMessageModal";
import { GroupInfoModal } from "@/components/chat/GroupInfoModal";
import { CreateTaskModal } from "@/components/tasks/CreateTaskModal";
import { AiTaskReviewModal } from "@/components/tasks/AiTaskReviewModal";
import type { AiDetectionResponse } from "@/lib/api";

const QUICK_EMOJIS = ["👍", "❤️", "😂", "🔥", "🎉", "🚀", "🙌", "✨", "😊", "👀", "💯", "👏"];

export const Route = createFileRoute("/")({
  validateSearch: (search: Record<string, unknown>) => ({
    conversationId: typeof search?.conversationId === "string" ? search.conversationId : undefined,
    messageId: typeof search?.messageId === "string" ? search.messageId : undefined,
  }),
  head: () => ({
    meta: [
      { title: "ActionFlow — Team Messaging for Professionals" },
      {
        name: "description",
        content:
          "Action Flow is a calm, focused team chat workspace for working professionals: direct messages and clean conversation threads.",
      },
    ],
  }),
  component: ChatApp,
});

function Avatar({
  initials,
  online,
  isGroup,
  size = "md",
}: {
  initials: string;
  online?: boolean;
  isGroup?: boolean;
  size?: "md" | "lg" | "xl";
}) {
  return (
    <div className="relative shrink-0">
      <div
        className={cn(
          "grid place-items-center rounded-2xl font-display font-bold transition-all duration-200 hover:scale-105 border shadow-xs",
          isGroup
            ? "bg-gradient-to-tr from-emerald-500/25 via-primary/20 to-teal-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30"
            : "bg-gradient-to-tr from-primary/25 via-primary/15 to-primary/5 text-primary border-primary/20",
          size === "md" ? "h-11 w-11 text-sm" : size === "lg" ? "h-12 w-12 text-base" : "h-14 w-14 text-lg"
        )}
      >
        {isGroup ? <Users className={size === "md" ? "h-5 w-5" : "h-5.5 w-5.5"} /> : initials || "U"}
      </div>
      {online && !isGroup && (
        <span className="absolute -bottom-0.5 -right-0.5 flex h-3.5 w-3.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-emerald-500 border-2 border-card" />
        </span>
      )}
      {isGroup && (
        <span className="absolute -bottom-1 -right-1 grid h-4 w-4 place-items-center rounded-full bg-primary text-[9px] text-primary-foreground border-2 border-card">
          <Users className="h-2.5 w-2.5" />
        </span>
      )}
    </div>
  );
}

function Ticks({ status }: { status?: "sent" | "delivered" | "read" }) {
  if (!status) return null;
  if (status === "read") return <CheckCheck className="h-3.5 w-3.5 text-sky-500 dark:text-sky-400" title="Read" />;
  if (status === "delivered")
    return <CheckCheck className="h-3.5 w-3.5 text-muted-foreground" title="Delivered" />;
  return <Check className="h-3.5 w-3.5 text-muted-foreground" title="Sent to server" />;
}

function formatDisplayTime(dateString?: string): string {
  if (!dateString) return "";
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return "";
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

function ChatApp() {
  const { user, token } = useAuth();
  const { activeWorkspace } = useWorkspace();
  const search = Route.useSearch();
  const navigate = useNavigate();
  const [conversations, setConversations] = useState<BackendConversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<BackendMessage[]>([]);
  const [loadingConversations, setLoadingConversations] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState("");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isNewChatModalOpen, setIsNewChatModalOpen] = useState(false);
  const [isGroupInfoModalOpen, setIsGroupInfoModalOpen] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<SocketConnectionStatus>("connecting");
  const [networkError, setNetworkError] = useState<string | null>(null);

  // New UI Enhancements State
  const [filterTab, setFilterTab] = useState<"all" | "unread">("all");
  const [teammates, setTeammates] = useState<BackendUser[]>([]);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);

  // WhatsApp Features State: Edit, Delete, Info
  const [editingMessage, setEditingMessage] = useState<BackendMessage | null>(null);
  const [deleteModalMessage, setDeleteModalMessage] = useState<BackendMessage | null>(null);
  const [infoModalMessage, setInfoModalMessage] = useState<BackendMessage | null>(null);
  const [activeMenuMessageId, setActiveMenuMessageId] = useState<string | null>(null);
  const [menuPlacement, setMenuPlacement] = useState<"up" | "down">("down");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Phase 4: Message-to-Task State
  const [createTaskSourceMessage, setCreateTaskSourceMessage] = useState<{
    id: string;
    conversationId: string;
    text: string;
    senderName?: string;
  } | null>(null);
  const [isCreateTaskModalOpen, setIsCreateTaskModalOpen] = useState(false);
  const [isAiTaskReviewModalOpen, setIsAiTaskReviewModalOpen] = useState(false);
  const [aiDetectionData, setAiDetectionData] = useState<AiDetectionResponse | null>(null);
  const [aiDetectingMessageId, setAiDetectingMessageId] = useState<string | null>(null);
  const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(null);
  const [isChatSidebarCollapsed, setIsChatSidebarCollapsed] = useState(false);

  // Phase 6: In-chat message search
  const [inChatSearchOpen, setInChatSearchOpen] = useState(false);
  const [inChatSearchQuery, setInChatSearchQuery] = useState("");
  const [inChatMatchIndex, setInChatMatchIndex] = useState(0);

  // Compute matching message IDs in current conversation
  const matchingMessageIds = useMemo(() => {
    if (!inChatSearchQuery.trim()) return [];
    const q = inChatSearchQuery.trim().toLowerCase();
    return messages
      .filter((m) => m.text && m.text.toLowerCase().includes(q))
      .map((m) => m.id);
  }, [messages, inChatSearchQuery]);

  const jumpToMatch = (index: number) => {
    if (matchingMessageIds.length === 0) return;
    const targetIndex = (index + matchingMessageIds.length) % matchingMessageIds.length;
    setInChatMatchIndex(targetIndex);
    const targetId = matchingMessageIds[targetIndex];
    setHighlightedMessageId(targetId);
    setTimeout(() => {
      const el = document.getElementById(`msg-${targetId}`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }, 50);
  };

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Close message dropdown menu on click outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (!(e.target as HTMLElement)?.closest(".message-menu-container")) {
        setActiveMenuMessageId(null);
      }
    }
    window.addEventListener("click", handleClickOutside);
    return () => window.removeEventListener("click", handleClickOutside);
  }, []);

  // Reset conversation state when switching users or workspaces
  useEffect(() => {
    setActiveId(null);
    setMessages([]);
    setConversations([]);
    setNetworkError(null);
  }, [user?._id, activeWorkspace?.id]);

  // 1. Load Conversations from MongoDB (Workspace Scoped)
  const loadConversations = async (selectConvId?: string) => {
    if (!token) return;
    try {
      setNetworkError(null);
      let convs: BackendConversation[] = [];
      if (activeWorkspace?.id) {
        const res = await api.getWorkspaceConversations(activeWorkspace.id);
        convs = res.conversations;
      } else {
        const res = await api.getConversations();
        convs = res.conversations;
      }
      setConversations(convs);

      if (convs.length > 0) {
        if (selectConvId && convs.some((c) => c.id === selectConvId)) {
          setActiveId(selectConvId);
        } else if (!activeId || !convs.some((c) => c.id === activeId)) {
          setActiveId(convs[0].id);
        }
      } else {
        setActiveId(null);
        setMessages([]);
      }
    } catch (err: any) {
      console.error("[ChatApp] Error fetching conversations:", err);
      setNetworkError(err.message || "Failed to load conversations");
    } finally {
      setLoadingConversations(false);
    }
  };

  useEffect(() => {
    if (token) {
      loadConversations(search?.conversationId);
    }
  }, [token, user?._id, activeWorkspace?.id, search?.conversationId]);

  // 2. Real-Time Socket.IO Setup with WhatsApp Edit, Delete, Read & Delivered Events
  useEffect(() => {
    if (!token) return;

    const socket = initSocketClient(token, (status) => {
      setConnectionStatus(status);
    });

    const handleMessageReceived = (newMsg: any) => {
      if (newMsg.conversationId === activeId) {
        setMessages((prev) => {
          if (prev.some((m) => m.id === newMsg.id)) return prev;
          const isMe = newMsg.senderId === user?._id;
          return [
            ...prev,
            {
              id: newMsg.id,
              from: isMe ? "me" : "them",
              text: newMsg.text,
              time: newMsg.time,
              createdAt: newMsg.createdAt,
              status: newMsg.status,
              isEdited: newMsg.isEdited || false,
              isDeletedForEveryone: newMsg.isDeletedForEveryone || false,
              deliveredAt: newMsg.deliveredAt,
              readAt: newMsg.readAt,
              aiTaskDetection: newMsg.aiTaskDetection,
              sender: {
                id: newMsg.senderId,
                displayName: newMsg.senderName,
                initials: newMsg.senderInitials,
              },
            },
          ];
        });
      }

      // Update conversation preview and bump to top
      setConversations((prev) => {
        const found = prev.find((c) => c.id === newMsg.conversationId);
        if (!found) {
          loadConversations();
          return prev;
        }

        const isCurrentActive = newMsg.conversationId === activeId;
        const updated = {
          ...found,
          lastMessageText: newMsg.text,
          lastMessageTime: newMsg.createdAt,
          unread: isCurrentActive ? 0 : found.unread + 1,
        };

        return [updated, ...prev.filter((c) => c.id !== newMsg.conversationId)];
      });
    };

    const handleMessageEdited = (data: {
      conversationId: string;
      messageId: string;
      text: string;
      isEdited: boolean;
      editedAt: string;
    }) => {
      if (data.conversationId === activeId) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === data.messageId
              ? {
                  ...m,
                  text: data.text,
                  isEdited: true,
                  editedAt: data.editedAt,
                }
              : m
          )
        );
      }

      setConversations((prev) =>
        prev.map((c) =>
          c.id === data.conversationId
            ? { ...c, lastMessageText: data.text }
            : c
        )
      );
    };

    const handleMessageDeleted = (data: {
      conversationId: string;
      messageId: string;
      isDeletedForEveryone: boolean;
      text: string;
    }) => {
      if (data.conversationId === activeId) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === data.messageId
              ? {
                  ...m,
                  isDeletedForEveryone: true,
                  text: data.text,
                }
              : m
          )
        );
      }

      setConversations((prev) =>
        prev.map((c) =>
          c.id === data.conversationId
            ? { ...c, lastMessageText: data.text }
            : c
        )
      );
    };

    const handleMessageDeletedForMe = (data: { conversationId: string; messageId: string }) => {
      if (data.conversationId === activeId) {
        setMessages((prev) => prev.filter((m) => m.id !== data.messageId));
      }
    };

    const handleMessagesRead = (data: {
      conversationId: string;
      readAt: string;
      readBy: string;
      messageIds?: string[];
    }) => {
      if (data.conversationId === activeId) {
        setMessages((prev) =>
          prev.map((m) =>
            m.from === "me"
              ? { ...m, status: "read", readAt: data.readAt }
              : m
          )
        );
      }
    };

    const handleMessagesDelivered = (data: {
      conversationId: string;
      messageIds: string[];
      deliveredAt: string;
    }) => {
      if (data.conversationId === activeId) {
        setMessages((prev) =>
          prev.map((m) =>
            m.from === "me" && m.status === "sent"
              ? { ...m, status: "delivered", deliveredAt: data.deliveredAt }
              : m
          )
        );
      }
    };

    const handleConversationUpdated = (data: any) => {
      if (data.isRemoved && data.conversationId === activeId) {
        setActiveId(null);
        setMessages([]);
        loadConversations();
        return;
      }
      loadConversations(activeId || undefined);
    };

    const handleGroupMemberEvent = (data: any) => {
      if (data.conversationId === activeId && data.userId === user?._id) {
        setActiveId(null);
        setMessages([]);
        loadConversations();
        return;
      }
      loadConversations(activeId || undefined);
    };

    const handleUserStatusChanged = (data: { userId: string; online: boolean }) => {
      setConversations((prev) =>
        prev.map((c) =>
          c.otherUser?.id === data.userId
            ? { ...c, online: data.online }
            : c
        )
      );
    };

    socket.on("message:new", handleMessageReceived);
    socket.on("message_received", handleMessageReceived);
    socket.on("message_edited", handleMessageEdited);
    socket.on("message_deleted", handleMessageDeleted);
    socket.on("message_deleted_for_me", handleMessageDeletedForMe);
    socket.on("conversation:read-updated", handleMessagesRead);
    socket.on("messages_read", handleMessagesRead);
    socket.on("messages_delivered", handleMessagesDelivered);
    socket.on("conversation:updated", handleConversationUpdated);
    socket.on("conversation_updated", handleConversationUpdated);
    socket.on("group:member_added", handleGroupMemberEvent);
    socket.on("group:member_removed", handleGroupMemberEvent);
    socket.on("group:updated", handleConversationUpdated);
    socket.on("presence:updated", (data: any) => handleUserStatusChanged({ userId: data.userId, online: data.online }));
    socket.on("user_status_changed", handleUserStatusChanged);

    return () => {
      socket.off("message:new", handleMessageReceived);
      socket.off("message_received", handleMessageReceived);
      socket.off("message_edited", handleMessageEdited);
      socket.off("message_deleted", handleMessageDeleted);
      socket.off("message_deleted_for_me", handleMessageDeletedForMe);
      socket.off("conversation:read-updated", handleMessagesRead);
      socket.off("messages_read", handleMessagesRead);
      socket.off("messages_delivered", handleMessagesDelivered);
      socket.off("conversation:updated", handleConversationUpdated);
      socket.off("conversation_updated", handleConversationUpdated);
      socket.off("group:member_added", handleGroupMemberEvent);
      socket.off("group:member_removed", handleGroupMemberEvent);
      socket.off("group:updated", handleConversationUpdated);
      socket.off("presence:updated");
      socket.off("user_status_changed", handleUserStatusChanged);
    };
  }, [token, activeId, user?._id]);

  // 3. Load Messages when Active Conversation changes
  useEffect(() => {
    if (!activeId || !token) return;

    // Guard: Only fetch messages if activeId is among current user's conversations
    if (conversations.length > 0 && !conversations.some((c) => c.id === activeId)) {
      setActiveId(null);
      setMessages([]);
      return;
    }

    joinConversationRoom(activeId, activeWorkspace?.id);
    setLoadingMessages(true);
    setEditingMessage(null);
    setActiveMenuMessageId(null);

    const fetchPromise = activeWorkspace?.id
      ? api.getWorkspaceMessages(activeWorkspace.id, activeId)
      : api.getMessages(activeId);

    fetchPromise
      .then((res) => {
        setMessages(res.messages);
        setNetworkError(null);
        setConversations((prev) =>
          prev.map((c) => (c.id === activeId ? { ...c, unread: 0 } : c))
        );

        // Auto-scan conversation messages in the background with the AI model
        if (activeWorkspace?.id && activeId) {
          const hasUnscanned = res.messages.some(
            (m) => !m.isDeletedForEveryone && (!m.aiTaskDetection || !(m.aiTaskDetection as any).detectedAt)
          );
          if (hasUnscanned) {
            api.scanConversationTasks(activeWorkspace.id, activeId)
              .then((scanRes) => {
                if (scanRes?.detections) {
                  setMessages((prev) =>
                    prev.map((m) =>
                      scanRes.detections[m.id]
                        ? { ...m, aiTaskDetection: scanRes.detections[m.id] }
                        : m
                    )
                  );
                }
              })
              .catch(() => {});
          }
        }

        if (search?.messageId && (search?.conversationId === activeId || !search?.conversationId)) {
          const target = res.messages.find((m) => m.id === search.messageId);
          if (target) {
            setHighlightedMessageId(search.messageId);
            setTimeout(() => {
              const el = document.getElementById(`msg-${search.messageId}`);
              if (el) {
                el.scrollIntoView({ behavior: "smooth", block: "center" });
              }
            }, 300);
            setTimeout(() => setHighlightedMessageId(null), 3500);
          } else {
            toast.info("Source message could not be found in recent conversation history.");
          }
        }
      })
      .catch((err) => {
        console.error("[ChatApp] Error loading messages:", err);
        // If user is not authorized for this conversation (e.g. after switching accounts or workspaces), cleanly deselect
        if (
          err.message?.includes("Access denied") ||
          err.message?.includes("403") ||
          err.message?.includes("not a member")
        ) {
          setActiveId(null);
          setMessages([]);
          setNetworkError(null);
        } else {
          setNetworkError(err.message || "Failed to load messages");
        }
      })
      .finally(() => {
        setLoadingMessages(false);
      });

    return () => {
      leaveConversationRoom(activeId);
    };
  }, [activeId, token, activeWorkspace?.id]);

  // Auto-scroll to bottom of chat when new messages arrive
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages.length, activeId]);

  // Load teammates directory for quick launcher in empty state
  useEffect(() => {
    if (token) {
      const fetchPromise = activeWorkspace?.id
        ? api.searchWorkspaceColleagues(activeWorkspace.id)
        : api.getUsers();

      fetchPromise
        .then((res) => {
          setTeammates(res.users);
        })
        .catch(() => {});
    }
  }, [token, user?._id, activeWorkspace?.id]);

  const active = useMemo(
    () => conversations.find((t) => t.id === activeId),
    [conversations, activeId]
  );

  const unreadCount = useMemo(
    () => conversations.reduce((acc, c) => acc + (c.unread > 0 ? 1 : 0), 0),
    [conversations]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = conversations;
    if (filterTab === "unread") {
      list = list.filter((t) => t.unread > 0);
    }
    if (!q) return list;
    return list.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        t.lastMessageText.toLowerCase().includes(q)
    );
  }, [conversations, query, filterTab]);

  function openThread(id: string) {
    setActiveId(id);
    setMobileOpen(true);
    setConversations((prev) =>
      prev.map((t) => (t.id === id ? { ...t, unread: 0 } : t))
    );
  }

  // Quick Chat Launcher with teammate
  async function handleStartChatWithUser(userId: string) {
    try {
      const res = activeWorkspace?.id
        ? await api.createDirectConversation(activeWorkspace.id, userId)
        : await api.createConversation(userId);
      await loadConversations(res.conversation.id);
      setMobileOpen(true);
    } catch (err: any) {
      console.error("[ChatApp] Failed to start conversation:", err);
      setNetworkError(err.message || "Failed to start conversation");
    }
  }

  // Instant Emoji Reaction handler
  async function handleSendReaction(emoji: string) {
    if (!activeId || sending) return;
    try {
      if (activeWorkspace?.id) {
        await api.sendWorkspaceMessage(activeWorkspace.id, activeId, emoji);
      } else {
        await api.sendMessage(activeId, emoji);
      }
    } catch (err: any) {
      console.error("[ChatApp] Failed to send reaction:", err);
    }
  }

  // 4. Send or Edit Message Handler
  async function handleSend() {
    const text = draft.trim();
    if (!text || !activeId || sending) return;

    setSending(true);

    // If we are currently editing an existing message
    if (editingMessage) {
      try {
        const res = await api.editMessage(activeId, editingMessage.id, text);
        setMessages((prev) =>
          prev.map((m) =>
            m.id === editingMessage.id
              ? { ...m, text: res.message.text, isEdited: true, editedAt: res.message.editedAt }
              : m
          )
        );

        setConversations((prev) =>
          prev.map((c) =>
            c.id === activeId ? { ...c, lastMessageText: text } : c
          )
        );

        setDraft("");
        setEditingMessage(null);
      } catch (err: any) {
        console.error("[ChatApp] Failed to edit message:", err);
        setNetworkError(err.message || "Failed to edit message");
      } finally {
        setSending(false);
      }
      return;
    }

    // Normal message send
    setDraft("");
    try {
      const res = activeWorkspace?.id
        ? await api.sendWorkspaceMessage(activeWorkspace.id, activeId, text)
        : await api.sendMessage(activeId, text);
      const newMsg = res.message;

      setMessages((prev) => {
        if (prev.some((m) => m.id === newMsg.id)) return prev;
        return [...prev, newMsg];
      });

      setConversations((prev) => {
        const found = prev.find((c) => c.id === activeId);
        if (!found) return prev;
        const updated = {
          ...found,
          lastMessageText: text,
          lastMessageTime: newMsg.createdAt,
        };
        return [updated, ...prev.filter((c) => c.id !== activeId)];
      });
    } catch (err: any) {
      console.error("[ChatApp] Failed to send message:", err);
      setNetworkError(err.message || "Failed to deliver message. Check backend connection.");
    } finally {
      setSending(false);
    }
  }

  // Handle Edit Action from Dropdown Menu
  function handleStartEdit(msg: BackendMessage) {
    setActiveMenuMessageId(null);
    setEditingMessage(msg);
    setDraft(msg.text);
    setTimeout(() => {
      inputRef.current?.focus();
    }, 50);
  }

  // Handle AI Detect Task from Dropdown Menu
  async function handleAiDetectTask(msg: BackendMessage) {
    if (!activeWorkspace?.id || !activeId) {
      toast.error("Active workspace and conversation are required.");
      return;
    }

    setAiDetectingMessageId(msg.id);
    setActiveMenuMessageId(null);
    const toastId = toast.loading("Analyzing message with trained AI model...");

    try {
      const res = await api.aiDetectTask(activeWorkspace.id, activeId, msg.id);
      toast.dismiss(toastId);
      setAiDetectionData(res);
      setIsAiTaskReviewModalOpen(true);
    } catch (err: any) {
      toast.dismiss(toastId);
      toast.error(err?.message || "Failed to analyze message with AI");
    } finally {
      setAiDetectingMessageId(null);
    }
  }

  // Handle Delete Confirmation from Modal
  async function handleConfirmDelete(deleteType: "everyone" | "me") {
    if (!deleteModalMessage || !activeId) return;

    const messageId = deleteModalMessage.id;
    await api.deleteMessage(activeId, messageId, deleteType);

    if (deleteType === "everyone") {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === messageId
            ? { ...m, isDeletedForEveryone: true, text: "This message was deleted" }
            : m
        )
      );
      setConversations((prev) =>
        prev.map((c) =>
          c.id === activeId ? { ...c, lastMessageText: "This message was deleted" } : c
        )
      );
    } else {
      // Delete for me
      setMessages((prev) => prev.filter((m) => m.id !== messageId));
    }
  }

  // Copy text to clipboard
  function handleCopy(msg: BackendMessage) {
    setActiveMenuMessageId(null);
    navigator.clipboard.writeText(msg.text);
    setCopiedId(msg.id);
    setTimeout(() => setCopiedId(null), 2000);
  }

  return (
    <>
      {/* Sidebar: Conversation List */}
      <aside
        className={cn(
          "flex w-full flex-col border-r border-border bg-card transition-all duration-300 ease-in-out md:w-[22rem]",
          mobileOpen && "hidden md:flex",
          isChatSidebarCollapsed && "md:w-0 md:border-r-0 md:overflow-hidden md:opacity-0 pointer-events-none"
        )}
      >
        <header className="border-b border-border/80 px-5 pb-3 bg-card/60 backdrop-blur-md">
          <div className="flex h-16 items-center justify-between">
            <div className="flex items-center gap-3">
              <img
                src="/logo.png"
                alt="ActionFlow"
                className="h-10 w-10 rounded-xl object-contain shadow-xs"
              />
              <span className="font-display font-extrabold text-lg tracking-tight text-foreground">
                ActionFlow
              </span>
            </div>
            
            <div className="flex items-center gap-1.5">
              {/* Start New Conversation Button */}
              <button
                onClick={() => setIsNewChatModalOpen(true)}
                className="grid h-9 w-9 place-items-center rounded-xl bg-primary/10 text-primary transition-all duration-200 hover:bg-primary hover:text-primary-foreground hover:scale-105 active:scale-95 cursor-pointer shadow-xs"
                aria-label="New chat"
                title="Start new conversation"
              >
                <Plus className="h-5 w-5" />
              </button>

              {/* Collapse conversation list button */}
              <button
                type="button"
                onClick={() => setIsChatSidebarCollapsed(true)}
                className="hidden md:grid h-9 w-9 place-items-center rounded-xl text-muted-foreground hover:bg-muted hover:text-foreground transition-colors cursor-pointer"
                title="Collapse conversation list"
                aria-label="Collapse conversation list"
              >
                <PanelLeftClose className="h-4.5 w-4.5" />
              </button>
            </div>
          </div>

          {/* Search Box with Clear Button */}
          <div className="relative mt-1">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search conversations..."
              className="h-10 w-full rounded-2xl border border-border/60 bg-muted/70 pl-9 pr-9 text-sm outline-none transition-all placeholder:text-muted-foreground focus:border-primary/50 focus:bg-card focus:shadow-xs"
            />
            {query && (
              <button
                onClick={() => setQuery("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* Filter Tabs: All & Unread */}
          <div className="flex items-center gap-1.5 mt-3 pt-1 border-t border-border/40">
            <button
              type="button"
              onClick={() => setFilterTab("all")}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-semibold transition-all duration-200 cursor-pointer",
                filterTab === "all"
                  ? "bg-primary text-primary-foreground shadow-xs scale-100"
                  : "bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              <span>All</span>
              <span className="text-[10px] opacity-75 font-mono">({conversations.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setFilterTab("unread")}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-semibold transition-all duration-200 cursor-pointer",
                filterTab === "unread"
                  ? "bg-primary text-primary-foreground shadow-xs scale-100"
                  : "bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              <span>Unread</span>
              {unreadCount > 0 && (
                <span className="h-4 min-w-4 px-1 rounded-full bg-emerald-500 text-[10px] text-white font-bold grid place-items-center">
                  {unreadCount}
                </span>
              )}
            </button>
          </div>
        </header>

        {/* Network Error Alert */}
        {networkError && (
          <div className="bg-destructive/15 text-destructive text-xs px-4 py-2 border-b border-destructive/20 flex items-center justify-between animate-in slide-in-from-top-1">
            <span className="truncate">{networkError}</span>
            <button
              onClick={() => setNetworkError(null)}
              className="ml-2 font-bold hover:underline cursor-pointer"
            >
              ×
            </button>
          </div>
        )}

        {/* List of Conversations */}
        <div className="flex-1 overflow-y-auto py-2">
          {loadingConversations ? (
            <div className="space-y-2 p-3">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="flex items-center gap-3 p-3 rounded-2xl bg-card/60 border border-border/40">
                  <div className="h-11 w-11 rounded-2xl shimmer-effect shrink-0" />
                  <div className="flex-1 space-y-2">
                    <div className="flex justify-between items-center">
                      <div className="h-3.5 w-24 rounded-md shimmer-effect" />
                      <div className="h-2.5 w-10 rounded-md shimmer-effect" />
                    </div>
                    <div className="h-3 w-36 rounded-md shimmer-effect" />
                  </div>
                </div>
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="px-5 py-12 text-center text-sm text-muted-foreground">
              <div className="h-12 w-12 rounded-2xl bg-primary/10 grid place-items-center mx-auto mb-3 text-primary">
                <MessageSquare className="h-6 w-6" />
              </div>
              <p className="font-semibold text-foreground">
                {filterTab === "unread" ? "No unread messages" : "No conversations yet"}
              </p>
              <p className="mt-1 text-xs max-w-xs mx-auto">
                {filterTab === "unread"
                  ? "You are all caught up with your team!"
                  : "Click the + button above to start a chat with another teammate."}
              </p>
            </div>
          ) : (
            filtered.map((t) => {
              const isActive = t.id === activeId;
              const displayTime = formatDisplayTime(t.lastMessageTime);

              return (
                <button
                  key={t.id}
                  onClick={() => openThread(t.id)}
                  className={cn(
                    "group relative flex w-[calc(100%-1rem)] items-center gap-3 mx-2 my-1 px-3.5 py-3 text-left transition-all duration-200 rounded-2xl cursor-pointer",
                    isActive
                      ? "bg-primary/10 border border-primary/25 shadow-xs"
                      : "hover:bg-muted/70 hover:translate-x-0.5 border border-transparent"
                  )}
                >
                  {isActive && (
                    <span className="absolute left-1 top-2.5 bottom-2.5 w-1 rounded-full bg-primary shadow-[0_0_8px_rgba(0,168,132,0.8)]" />
                  )}
                  <Avatar initials={t.initials} online={t.online} isGroup={t.type === "GROUP"} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className={cn("truncate font-display text-sm", isActive ? "font-bold text-primary" : "font-semibold text-foreground")}>
                        {t.name}
                      </span>
                      <span className="shrink-0 text-[10px] text-muted-foreground font-medium">
                        {displayTime}
                      </span>
                    </div>
                    <div className="mt-0.5 flex items-center justify-between gap-2">
                      <p className="truncate text-xs text-muted-foreground group-hover:text-foreground/90 transition-colors">
                        {t.lastMessageText || (t.type === "GROUP" ? "Created a group chat" : "Started a conversation")}
                      </p>
                      {t.unread > 0 && (
                        <span className="grid h-5 min-w-5 shrink-0 place-items-center rounded-full bg-gradient-to-r from-primary to-emerald-600 px-1.5 text-[10px] font-bold text-primary-foreground shadow-xs animate-pulse-soft">
                          {t.unread}
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </aside>

      {/* Main Chat Thread Area */}
      <section
        className={cn(
          "flex min-w-0 flex-1 flex-col bg-background relative overflow-hidden",
          !mobileOpen && "hidden md:flex"
        )}
      >
        {active ? (
          <>
            {/* Thread Header */}
            <header className="flex h-16 shrink-0 items-center justify-between border-b border-border/80 bg-card/85 backdrop-blur-md px-4 md:px-6 shadow-2xs z-10">
              <div
                onClick={() => {
                  if (active.type === "GROUP") setIsGroupInfoModalOpen(true);
                }}
                className={cn(
                  "flex items-center gap-3 min-w-0",
                  active.type === "GROUP" && "cursor-pointer group/header"
                )}
              >
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setMobileOpen(false);
                  }}
                  className="-ml-1 grid h-9 w-9 place-items-center rounded-xl text-muted-foreground hover:bg-muted md:hidden cursor-pointer transition-colors"
                  aria-label="Back to conversations"
                >
                  <ArrowLeft className="h-5 w-5" />
                </button>

                {/* Desktop Toggle Conversations Sidebar Button */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsChatSidebarCollapsed(!isChatSidebarCollapsed);
                  }}
                  className="hidden md:grid h-9 w-9 place-items-center rounded-xl text-muted-foreground hover:bg-muted hover:text-foreground cursor-pointer transition-colors"
                  title={isChatSidebarCollapsed ? "Show conversation list" : "Hide conversation list"}
                  aria-label={isChatSidebarCollapsed ? "Show conversation list" : "Hide conversation list"}
                >
                  {isChatSidebarCollapsed ? (
                    <PanelLeftOpen className="h-5 w-5 text-primary" />
                  ) : (
                    <PanelLeftClose className="h-5 w-5" />
                  )}
                </button>

                <Avatar initials={active.initials} online={active.online} isGroup={active.type === "GROUP"} size="lg" />

                <div className="min-w-0">
                  <p className={cn(
                    "truncate font-display text-sm font-bold text-foreground tracking-tight",
                    active.type === "GROUP" && "group-hover/header:text-primary transition-colors"
                  )}>
                    {active.name}
                  </p>
                  <p className="truncate text-xs text-muted-foreground flex items-center gap-1.5 mt-0.5">
                    {active.type === "GROUP" ? (
                      <span className="text-primary font-semibold flex items-center gap-1">
                        <Users className="h-3 w-3" />
                        {active.participantCount || active.participants?.length || 2} members • View info
                      </span>
                    ) : active.online ? (
                      <>
                        <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                        <span className="text-emerald-600 dark:text-emerald-400 font-semibold">Active now</span>
                      </>
                    ) : (
                      <span>{active.role}</span>
                    )}
                  </p>
                </div>
              </div>

              {/* Thread Action Buttons with smooth hover */}
              <div className="flex items-center gap-1 text-muted-foreground">
                {active.type === "GROUP" && (
                  <button
                    type="button"
                    onClick={() => setIsGroupInfoModalOpen(true)}
                    className="grid h-9 w-9 place-items-center rounded-xl transition-all duration-200 hover:bg-primary/10 hover:text-primary hover:scale-105 active:scale-95 cursor-pointer text-primary"
                    title="Group details & member management"
                  >
                    <Users className="h-4.5 w-4.5" />
                  </button>
                )}
                {/* Search in this chat */}
                <button
                  type="button"
                  onClick={() => {
                    setInChatSearchOpen(!inChatSearchOpen);
                    if (inChatSearchOpen) setInChatSearchQuery("");
                  }}
                  className={cn(
                    "grid h-9 w-9 place-items-center rounded-xl transition-all duration-200 cursor-pointer",
                    inChatSearchOpen
                      ? "bg-primary text-primary-foreground shadow-xs"
                      : "hover:bg-muted hover:text-foreground hover:scale-105 active:scale-95"
                  )}
                  title="Search messages in conversation"
                >
                  <Search className="h-4 w-4" />
                </button>

                <button
                  type="button"
                  className="grid h-9 w-9 place-items-center rounded-xl transition-all duration-200 hover:bg-muted hover:text-foreground hover:scale-105 active:scale-95 cursor-pointer"
                  title="Voice Call (Mock)"
                >
                  <Phone className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  className="grid h-9 w-9 place-items-center rounded-xl transition-all duration-200 hover:bg-muted hover:text-foreground hover:scale-105 active:scale-95 cursor-pointer"
                  title="Video Call (Mock)"
                >
                  <Video className="h-4 w-4" />
                </button>
                <div className="h-4 w-[1px] bg-border/60 mx-1" />
                <button
                  type="button"
                  onClick={() => setIsNewChatModalOpen(true)}
                  className="grid h-9 w-9 place-items-center rounded-xl transition-all duration-200 hover:bg-muted hover:text-foreground hover:scale-105 active:scale-95 cursor-pointer"
                  title="New conversation"
                >
                  <UserPlus className="h-4 w-4" />
                </button>
              </div>
            </header>

            {/* In-chat Search Bar Banner */}
            {inChatSearchOpen && (
              <div className="flex items-center gap-2 px-6 py-2.5 border-b border-border/80 bg-card/95 backdrop-blur-md animate-in slide-in-from-top-2 shrink-0 z-10">
                <Search className="h-4 w-4 text-primary shrink-0" />
                <input
                  type="text"
                  value={inChatSearchQuery}
                  onChange={(e) => {
                    setInChatSearchQuery(e.target.value);
                    setInChatMatchIndex(0);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      if (e.shiftKey) jumpToMatch(inChatMatchIndex - 1);
                      else jumpToMatch(inChatMatchIndex + 1);
                    } else if (e.key === "Escape") {
                      setInChatSearchOpen(false);
                      setInChatSearchQuery("");
                    }
                  }}
                  placeholder="Search in this conversation... (Press Enter to cycle matches)"
                  className="flex-1 bg-transparent text-xs text-foreground placeholder:text-muted-foreground focus:outline-none"
                  autoFocus
                />
                {inChatSearchQuery && (
                  <span className="text-[11px] text-muted-foreground font-medium shrink-0">
                    {matchingMessageIds.length > 0
                      ? `${inChatMatchIndex + 1} of ${matchingMessageIds.length} matches`
                      : "No matches"}
                  </span>
                )}
                {matchingMessageIds.length > 0 && (
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => jumpToMatch(inChatMatchIndex - 1)}
                      className="grid h-6 w-6 place-items-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted cursor-pointer"
                      title="Previous match (Shift+Enter)"
                    >
                      <ChevronUp className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => jumpToMatch(inChatMatchIndex + 1)}
                      className="grid h-6 w-6 place-items-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted cursor-pointer"
                      title="Next match (Enter)"
                    >
                      <ChevronDown className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setInChatSearchOpen(false);
                    setInChatSearchQuery("");
                  }}
                  className="grid h-6 w-6 place-items-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted cursor-pointer shrink-0"
                  title="Close search"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            )}

            {/* Chat Messages Canvas */}
            <div ref={scrollRef} className="chat-canvas flex-1 overflow-y-auto px-4 pt-6 pb-12 md:px-10">
              <div className="mx-auto flex max-w-3xl flex-col gap-2.5">
                {loadingMessages ? (
                  <div className="flex h-48 flex-col items-center justify-center text-xs text-muted-foreground gap-2.5">
                    <Loader2 className="h-6 w-6 animate-spin text-primary" />
                    <span>Loading message history...</span>
                  </div>
                ) : messages.length === 0 ? (
                  <div className="py-20 text-center text-muted-foreground">
                    <div className="h-12 w-12 rounded-2xl bg-primary/10 grid place-items-center mx-auto mb-3 text-primary animate-float">
                      <MessageCircle className="h-6 w-6" />
                    </div>
                    <p className="text-sm font-semibold text-foreground">No messages yet</p>
                    <p className="mt-1 text-xs">Say hello to start the conversation!</p>
                  </div>
                ) : (
                  messages.map((m) => {
                    const isSender = m.from === "me";
                    const isDeleted = !!m.isDeletedForEveryone;
                    const isMenuOpen = activeMenuMessageId === m.id;
                    const isTaskCandidate = Boolean(
                      !isDeleted && (
                        m.aiTaskDetection?.isTaskCandidate ||
                        /\b(please|can you|could you|schedule|meeting|call|fix|update|prepare|send|review|deploy|by tomorrow|by monday|by friday|urgent|asap|verify|check|test|implement|create|finish)\b/i.test(m.text)
                      )
                    );

                    return (
                      <div
                        key={m.id}
                        id={`msg-${m.id}`}
                        className={cn(
                          "group relative max-w-[85%] md:max-w-[72%]",
                          isSender ? "self-end" : "self-start"
                        )}
                      >
                        {/* Message Bubble */}
                        <div
                          className={cn(
                            "relative rounded-2xl px-4 py-2.5 text-sm leading-relaxed shadow-xs transition-all duration-300 animate-pop-in break-words",
                            isMenuOpen ? "z-40" : "z-0",
                            isSender
                              ? "bubble-tail-out bg-gradient-to-br from-bubble-out to-bubble-out/95 text-bubble-out-foreground hover:shadow-md"
                              : "bubble-tail-in bg-card text-bubble-in-foreground border border-border/60 hover:shadow-sm",
                            highlightedMessageId === m.id && "ring-2 ring-emerald-500 bg-emerald-500/20 shadow-lg scale-[1.02]",
                            isTaskCandidate && "min-w-[170px]"
                          )}
                        >
                          {/* WhatsApp-Style In-Bubble Action Pill (Top-Right inside bubble) */}
                          <div
                            className={cn(
                              "message-menu-container absolute top-1.5 right-1.5 z-20 flex items-center select-none transition-all duration-200",
                              isTaskCandidate
                                ? "px-2 py-0.5 rounded-full bg-card/95 border border-border/80 shadow-xs backdrop-blur-md opacity-95 group-hover:opacity-100"
                                : isMenuOpen
                                ? "p-0.5 rounded-full bg-card/95 border border-border/80 shadow-xs opacity-100"
                                : "p-0.5 rounded-full bg-card/90 border border-border/60 shadow-2xs opacity-0 group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto"
                            )}
                          >
                            {/* AI Detect Button - Shown when AI detected a task candidate */}
                            {isTaskCandidate && (
                              <>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleAiDetectTask(m);
                                  }}
                                  disabled={aiDetectingMessageId === m.id}
                                  className="flex items-center gap-1 text-[11px] font-semibold text-primary hover:opacity-80 transition-all cursor-pointer active:scale-95"
                                  title="AI detected a task in this message • Click to review"
                                >
                                  {aiDetectingMessageId === m.id ? (
                                    <Loader2 className="h-3 w-3 animate-spin text-primary" />
                                  ) : (
                                    <Sparkles className="h-3 w-3 text-primary" />
                                  )}
                                  <span>AI Detect</span>
                                </button>
                                <div className="h-3 w-px bg-border/70 my-auto mx-1" />
                              </>
                            )}

                            {/* More Options Menu Trigger */}
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                if (isMenuOpen) {
                                  setActiveMenuMessageId(null);
                                } else {
                                  const rect = e.currentTarget.getBoundingClientRect();
                                  const spaceBelow = window.innerHeight - rect.bottom;
                                  setMenuPlacement(spaceBelow < 250 ? "up" : "down");
                                  setActiveMenuMessageId(m.id);
                                }
                              }}
                              className="grid h-4 w-4 place-items-center rounded-full text-muted-foreground hover:text-foreground cursor-pointer"
                              title="More options"
                            >
                              <MoreVertical className="h-3.5 w-3.5" />
                            </button>

                            {/* Context Menu Dropdown */}
                            {isMenuOpen && (
                              <div
                                onClick={(e) => e.stopPropagation()}
                                className={cn(
                                  "absolute z-50 w-52 rounded-2xl border border-border bg-card shadow-2xl p-1.5 animate-pop-in pointer-events-auto",
                                  menuPlacement === "up" ? "bottom-full mb-1.5" : "top-full mt-1.5",
                                  "right-0"
                                )}
                              >
                                {/* Message Info */}
                                <button
                                  onClick={() => {
                                    setActiveMenuMessageId(null);
                                    setInfoModalMessage(m);
                                  }}
                                  className="flex w-full items-center gap-2 rounded-xl px-2.5 py-1.5 text-xs text-foreground hover:bg-muted transition-colors cursor-pointer text-left font-medium"
                                >
                                  <Info className="h-3.5 w-3.5 text-primary" />
                                  <span>Message info</span>
                                </button>

                                {/* AI Detect Task */}
                                {!isDeleted && (
                                  <button
                                    onClick={() => handleAiDetectTask(m)}
                                    disabled={aiDetectingMessageId === m.id}
                                    className="flex w-full items-center gap-2 rounded-xl px-2.5 py-1.5 text-xs text-foreground hover:bg-muted transition-colors cursor-pointer text-left font-medium group/ai"
                                  >
                                    {aiDetectingMessageId === m.id ? (
                                      <Loader2 className="h-3.5 w-3.5 text-primary animate-spin" />
                                    ) : (
                                      <Sparkles className="h-3.5 w-3.5 text-primary group-hover/ai:scale-110 transition-transform" />
                                    )}
                                    <span className="font-semibold text-primary">AI Detect Task</span>
                                  </button>
                                )}

                                {/* Create Task from Message */}
                                {!isDeleted && (
                                  <button
                                    onClick={() => {
                                      setActiveMenuMessageId(null);
                                      setCreateTaskSourceMessage({
                                        id: m.id,
                                        conversationId: activeId || "",
                                        text: m.text,
                                        senderName: m.sender?.displayName || (isSender ? "You" : "Teammate"),
                                      });
                                      setIsCreateTaskModalOpen(true);
                                    }}
                                    className="flex w-full items-center gap-2 rounded-xl px-2.5 py-1.5 text-xs text-foreground hover:bg-muted transition-colors cursor-pointer text-left font-medium"
                                  >
                                    <CheckSquare className="h-3.5 w-3.5 text-emerald-500" />
                                    <span>Create Task from Message</span>
                                  </button>
                                )}

                                {/* Edit Message */}
                                {isSender && !isDeleted && (
                                  <button
                                    onClick={() => handleStartEdit(m)}
                                    className="flex w-full items-center gap-2 rounded-xl px-2.5 py-1.5 text-xs text-foreground hover:bg-muted transition-colors cursor-pointer text-left font-medium"
                                  >
                                    <Pencil className="h-3.5 w-3.5 text-amber-500" />
                                    <span>Edit</span>
                                  </button>
                                )}

                                {/* Copy Text */}
                                {!isDeleted && (
                                  <button
                                    onClick={() => handleCopy(m)}
                                    className="flex w-full items-center gap-2 rounded-xl px-2.5 py-1.5 text-xs text-foreground hover:bg-muted transition-colors cursor-pointer text-left font-medium"
                                  >
                                    <Copy className="h-3.5 w-3.5 text-muted-foreground" />
                                    <span>{copiedId === m.id ? "Copied!" : "Copy"}</span>
                                  </button>
                                )}

                                <div className="my-1 border-t border-border/60" />

                                {/* Delete Message */}
                                <button
                                  onClick={() => {
                                    setActiveMenuMessageId(null);
                                    setDeleteModalMessage(m);
                                  }}
                                  className="flex w-full items-center gap-2 rounded-xl px-2.5 py-1.5 text-xs text-destructive hover:bg-destructive/10 transition-colors cursor-pointer text-left font-medium"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                  <span>Delete message</span>
                                </button>
                              </div>
                            )}
                          </div>

                          {/* Group Sender Display Name */}
                          {!isSender && active.type === "GROUP" && m.sender?.displayName && (
                            <p className="text-[11px] font-semibold text-primary mb-1 select-none pr-7">
                              {m.sender.displayName}
                            </p>
                          )}

                          {/* Message Content */}
                          {isDeleted ? (
                            <div className="flex items-center gap-1.5 italic text-muted-foreground text-xs py-0.5">
                              <Ban className="h-3.5 w-3.5 shrink-0 opacity-70" />
                              <span>
                                {isSender ? "You deleted this message" : "This message was deleted"}
                              </span>
                            </div>
                          ) : (
                            <p
                              className={cn(
                                "whitespace-pre-wrap break-words",
                                isTaskCandidate ? "pr-28" : "pr-6"
                              )}
                            >
                              {m.text}
                            </p>
                          )}

                          {/* Footer: timestamp, edited badge, WhatsApp checkmarks */}
                          <div className="mt-1 flex items-center justify-end gap-1.5 text-[10px] text-muted-foreground select-none">
                            {m.isEdited && !isDeleted && (
                              <span className="italic font-medium text-muted-foreground/80">
                                edited •
                              </span>
                            )}
                            <span>{m.time}</span>
                            {isSender && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setInfoModalMessage(m);
                                }}
                                className="ml-0.5 cursor-pointer hover:opacity-80 transition-opacity"
                                title="Click for message info & delivery receipts"
                              >
                                <Ticks status={m.status} />
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Message Input Footer with WhatsApp-style Edit Banner & Emoji Bar */}
            <footer className="border-t border-border/80 bg-card/85 backdrop-blur-md px-4 py-3 md:px-10 shadow-lg">
              {/* WhatsApp Inline Edit Mode Banner */}
              {editingMessage && (
                <div className="mx-auto mb-2 flex max-w-3xl items-center justify-between rounded-2xl bg-amber-500/10 border border-amber-500/25 px-4 py-2.5 text-xs shadow-xs animate-pop-in">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="p-1 rounded-lg bg-amber-500/20 text-amber-600 dark:text-amber-400 shrink-0">
                      <Pencil className="h-3.5 w-3.5" />
                    </div>
                    <div className="min-w-0">
                      <span className="font-semibold text-amber-700 dark:text-amber-300">
                        Editing message
                      </span>
                      <p className="truncate text-muted-foreground text-[11px] mt-0.5 italic">
                        "{editingMessage.text}"
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      setEditingMessage(null);
                      setDraft("");
                    }}
                    className="ml-2 grid h-6 w-6 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground cursor-pointer transition-colors"
                    title="Cancel edit"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              )}

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSend();
                }}
                className="relative mx-auto flex max-w-3xl items-end gap-2"
              >
                {/* Quick Emoji Picker Popover */}
                {showEmojiPicker && (
                  <div className="absolute bottom-full mb-3 left-0 z-30 flex flex-wrap gap-1 p-2.5 rounded-2xl border border-border bg-card/95 backdrop-blur-md shadow-2xl w-64 animate-pop-in">
                    <div className="w-full text-[10px] font-semibold text-muted-foreground px-1 pb-1 border-b border-border/50 mb-1 flex justify-between items-center">
                      <span>Quick Emojis</span>
                      <button
                        type="button"
                        onClick={() => setShowEmojiPicker(false)}
                        className="hover:text-foreground cursor-pointer"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                    {QUICK_EMOJIS.map((emoji) => (
                      <button
                        key={emoji}
                        type="button"
                        onClick={() => {
                          setDraft((prev) => prev + emoji);
                          setShowEmojiPicker(false);
                          inputRef.current?.focus();
                        }}
                        className="grid h-8 w-8 place-items-center rounded-xl text-base hover:bg-muted hover:scale-125 transition-transform cursor-pointer"
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                )}

                <div className="flex items-center gap-1 pb-1">
                  <button
                    type="button"
                    onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                    aria-label="Add emoji"
                    className={cn(
                      "grid h-10 w-10 shrink-0 place-items-center rounded-2xl transition-all cursor-pointer",
                      showEmojiPicker
                        ? "bg-primary/20 text-primary shadow-xs"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground hover:scale-105 active:scale-95"
                    )}
                  >
                    <Smile className="h-5 w-5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setDraft((prev) => prev + "📎 [file] ");
                      inputRef.current?.focus();
                    }}
                    aria-label="Attach file"
                    className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl text-muted-foreground transition-all hover:bg-muted hover:text-foreground hover:scale-105 active:scale-95 cursor-pointer"
                  >
                    <Paperclip className="h-5 w-5" />
                  </button>
                </div>

                <textarea
                  ref={inputRef}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleSend();
                    } else if (e.key === "Escape" && editingMessage) {
                      setEditingMessage(null);
                      setDraft("");
                    }
                  }}
                  rows={1}
                  placeholder={
                    editingMessage
                      ? "Edit your message... (Esc to cancel)"
                      : `Message ${active.name}...`
                  }
                  disabled={sending}
                  className="max-h-32 min-h-12 flex-1 resize-none rounded-2xl border border-border/60 bg-muted/60 px-4 py-3.5 text-sm outline-none transition-all placeholder:text-muted-foreground focus:border-primary/50 focus:bg-card focus:shadow-xs disabled:opacity-50"
                />

                <button
                  type="submit"
                  disabled={!draft.trim() || sending}
                  className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-gradient-to-tr from-primary to-emerald-600 text-primary-foreground shadow-md transition-all duration-200 hover:from-primary/95 hover:to-emerald-500 hover:scale-105 active:scale-95 disabled:opacity-40 disabled:hover:scale-100 cursor-pointer mb-0.5"
                  aria-label={editingMessage ? "Save edit" : "Send message"}
                  title={editingMessage ? "Save edit (Enter)" : "Send message (Enter)"}
                >
                  {sending ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : editingMessage ? (
                    <Check className="h-5 w-5 stroke-[2.5]" />
                  ) : (
                    <Send className="h-5 w-5 stroke-[2.5]" />
                  )}
                </button>
              </form>

              <div className="mx-auto max-w-3xl mt-1.5 flex justify-center items-center text-[10px] text-muted-foreground/75 px-3">
                <span>
                  Press <kbd className="font-mono bg-muted px-1 py-0.5 rounded border border-border/50">Enter ↵</kbd> to send, <kbd className="font-mono bg-muted px-1 py-0.5 rounded border border-border/50">Shift + Enter</kbd> for new line
                </span>
              </div>
            </footer>
          </>
        ) : (
          /* Empty State: Modern Command Center Showcase */
          <div className="flex h-full flex-col items-center justify-center p-6 text-center mesh-ambient overflow-y-auto">
            <div className="relative mb-5">
              <div className="absolute -inset-4 rounded-full bg-primary/20 blur-xl animate-pulse-soft" />
              <div className="relative grid h-16 w-16 place-items-center rounded-2xl bg-primary/10 text-primary border border-primary/20 shadow-md">
                <MessageSquare className="h-8 w-8" />
              </div>
            </div>

            <h2 className="font-display text-2xl font-bold tracking-tight text-foreground">
              {activeWorkspace?.name || "Soul Business Solutions"}
            </h2>
            <p className="mt-1.5 text-sm text-muted-foreground max-w-md leading-relaxed">
              Select a conversation from the sidebar to start messaging, or reach out to a colleague below.
            </p>

            {/* Quick Teammate Launcher Grid */}
            <div className="mt-8 w-full max-w-xl text-left">
              <div className="flex items-center justify-between mb-3 px-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    Teammates Directory
                  </span>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                    {teammates.length} members
                  </span>
                </div>
                <button
                  onClick={() => setIsNewChatModalOpen(true)}
                  className="text-xs font-semibold text-primary hover:underline flex items-center gap-1 cursor-pointer"
                >
                  <Plus className="h-3.5 w-3.5" /> Start custom chat
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {teammates.map((tm) => (
                  <div
                    key={tm._id}
                    className="flex items-center justify-between p-3 rounded-2xl border border-border/80 bg-card/75 backdrop-blur-md shadow-xs transition-all duration-200 hover:bg-card hover:border-primary/50 hover:shadow-md hover:-translate-y-0.5 group"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <Avatar initials={tm.initials} online={tm.online} size="md" />
                      <div className="min-w-0">
                        <p className="font-semibold text-sm truncate text-foreground group-hover:text-primary transition-colors">
                          {tm.displayName}
                        </p>
                        <p className="text-[11px] text-muted-foreground truncate">{tm.role || "Team Member"}</p>
                      </div>
                    </div>
                    <button
                      onClick={() => handleStartChatWithUser(tm._id)}
                      className="shrink-0 ml-2 rounded-xl bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary transition-all hover:bg-primary hover:text-primary-foreground active:scale-95 cursor-pointer shadow-xs"
                    >
                      Chat
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </section>

      {/* Start New Conversation Modal */}
      <NewConversationModal
        open={isNewChatModalOpen}
        onOpenChange={setIsNewChatModalOpen}
        workspaceId={activeWorkspace?.id}
        onConversationCreated={(newConvId) => {
          loadConversations(newConvId);
          setMobileOpen(true);
        }}
      />

      {/* WhatsApp Message Info Modal */}
      <MessageInfoModal
        open={!!infoModalMessage}
        onOpenChange={(open) => !open && setInfoModalMessage(null)}
        conversationId={activeId || ""}
        messageId={infoModalMessage?.id || null}
        cachedMessage={infoModalMessage}
      />

      {/* WhatsApp Delete Confirmation Modal */}
      <DeleteMessageModal
        open={!!deleteModalMessage}
        onOpenChange={(open) => !open && setDeleteModalMessage(null)}
        message={deleteModalMessage}
        onConfirmDelete={handleConfirmDelete}
      />

      {/* Group Info & Management Modal (Phase 3) */}
      <GroupInfoModal
        open={isGroupInfoModalOpen}
        onOpenChange={setIsGroupInfoModalOpen}
        conversation={active}
        workspaceId={activeWorkspace?.id}
        currentUserId={user?._id}
        onGroupUpdated={() => {
          loadConversations(activeId || undefined);
        }}
        onGroupLeft={(leftConvId) => {
          setActiveId(null);
          setMessages([]);
          loadConversations();
        }}
      />

      {/* Create Task from Message Modal (Phase 4) */}
      <CreateTaskModal
        open={isCreateTaskModalOpen}
        onOpenChange={setIsCreateTaskModalOpen}
        workspaceId={activeWorkspace?.id}
        currentUserId={user?._id}
        sourceMessage={createTaskSourceMessage}
        onTaskCreated={(task) => {
          toast.success(`Task "${task.title}" created`, {
            description: "Task has been created and added to workspace tasks.",
            action: {
              label: "View in My Tasks",
              onClick: () => navigate({ to: "/tasks" }),
            },
          });
        }}
      />

      {/* AI Task Suggestion Review Modal */}
      <AiTaskReviewModal
        open={isAiTaskReviewModalOpen}
        onOpenChange={setIsAiTaskReviewModalOpen}
        workspaceId={activeWorkspace?.id}
        currentUserId={user?._id}
        detectionData={aiDetectionData}
        onTasksCreated={(createdTasks) => {
          const count = createdTasks.length;
          toast.success(
            count > 1 ? `${count} Tasks Created Successfully` : `Task "${createdTasks[0]?.title}" created`,
            {
              description: "AI suggested task(s) added to workspace tasks.",
              action: {
                label: "View in My Tasks",
                onClick: () => navigate({ to: "/tasks" }),
              },
            }
          );
        }}
        onManualCreateRequested={() => {
          if (aiDetectionData) {
            setCreateTaskSourceMessage({
              id: aiDetectionData.sourceMessage.id,
              conversationId: aiDetectionData.sourceMessage.conversationId,
              text: aiDetectionData.sourceMessage.text,
              senderName: aiDetectionData.sourceMessage.senderName,
            });
            setIsCreateTaskModalOpen(true);
          }
        }}
      />
    </>
  );
}
