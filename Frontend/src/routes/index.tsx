import { createFileRoute } from "@tanstack/react-router";
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
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/context/AuthContext";
import {
  api,
  type BackendConversation,
  type BackendMessage,
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

export const Route = createFileRoute("/")({
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
  size = "md",
}: {
  initials: string;
  online?: boolean;
  size?: "md" | "lg";
}) {
  return (
    <div className="relative shrink-0">
      <div
        className={cn(
          "grid place-items-center rounded-full bg-primary/12 font-display font-semibold text-primary",
          size === "md" ? "h-11 w-11 text-sm" : "h-10 w-10 text-sm"
        )}
      >
        {initials || "U"}
      </div>
      {online && (
        <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-card bg-emerald-500" />
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
  const [connectionStatus, setConnectionStatus] = useState<SocketConnectionStatus>("connecting");
  const [networkError, setNetworkError] = useState<string | null>(null);

  // WhatsApp Features State: Edit, Delete, Info
  const [editingMessage, setEditingMessage] = useState<BackendMessage | null>(null);
  const [deleteModalMessage, setDeleteModalMessage] = useState<BackendMessage | null>(null);
  const [infoModalMessage, setInfoModalMessage] = useState<BackendMessage | null>(null);
  const [activeMenuMessageId, setActiveMenuMessageId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

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

  // 1. Load Conversations from MongoDB
  const loadConversations = async (selectConvId?: string) => {
    if (!token) return;
    try {
      setNetworkError(null);
      const res = await api.getConversations();
      setConversations(res.conversations);

      if (res.conversations.length > 0) {
        if (selectConvId && res.conversations.some((c) => c.id === selectConvId)) {
          setActiveId(selectConvId);
        } else if (!activeId || !res.conversations.some((c) => c.id === activeId)) {
          setActiveId(res.conversations[0].id);
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
      loadConversations();
    }
  }, [token]);

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
      setConversations((prev) =>
        prev.map((c) =>
          c.id === data.conversationId
            ? {
                ...c,
                lastMessageText: data.lastMessageText,
                lastMessageTime: data.lastMessageTime,
              }
            : c
        )
      );
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

    socket.on("message_received", handleMessageReceived);
    socket.on("message_edited", handleMessageEdited);
    socket.on("message_deleted", handleMessageDeleted);
    socket.on("message_deleted_for_me", handleMessageDeletedForMe);
    socket.on("messages_read", handleMessagesRead);
    socket.on("messages_delivered", handleMessagesDelivered);
    socket.on("conversation_updated", handleConversationUpdated);
    socket.on("user_status_changed", handleUserStatusChanged);

    return () => {
      socket.off("message_received", handleMessageReceived);
      socket.off("message_edited", handleMessageEdited);
      socket.off("message_deleted", handleMessageDeleted);
      socket.off("message_deleted_for_me", handleMessageDeletedForMe);
      socket.off("messages_read", handleMessagesRead);
      socket.off("messages_delivered", handleMessagesDelivered);
      socket.off("conversation_updated", handleConversationUpdated);
      socket.off("user_status_changed", handleUserStatusChanged);
    };
  }, [token, activeId, user?._id]);

  // 3. Load Messages when Active Conversation changes
  useEffect(() => {
    if (!activeId || !token) return;

    joinConversationRoom(activeId);
    setLoadingMessages(true);
    setNetworkError(null);
    setEditingMessage(null);
    setActiveMenuMessageId(null);

    api
      .getMessages(activeId)
      .then((res) => {
        setMessages(res.messages);
        setConversations((prev) =>
          prev.map((c) => (c.id === activeId ? { ...c, unread: 0 } : c))
        );
      })
      .catch((err) => {
        console.error("[ChatApp] Error loading messages:", err);
        setNetworkError(err.message || "Failed to load messages");
      })
      .finally(() => {
        setLoadingMessages(false);
      });

    return () => {
      leaveConversationRoom(activeId);
    };
  }, [activeId, token]);

  // Auto-scroll to bottom of chat when new messages arrive
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages.length, activeId]);

  const active = useMemo(
    () => conversations.find((t) => t.id === activeId),
    [conversations, activeId]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return conversations;
    return conversations.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        t.lastMessageText.toLowerCase().includes(q)
    );
  }, [conversations, query]);

  function openThread(id: string) {
    setActiveId(id);
    setMobileOpen(true);
    setConversations((prev) =>
      prev.map((t) => (t.id === id ? { ...t, unread: 0 } : t))
    );
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
      const res = await api.sendMessage(activeId, text);
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
          "flex w-full flex-col border-r border-border bg-card md:w-[22rem]",
          mobileOpen && "hidden md:flex"
        )}
      >
        <header className="border-b border-border px-5 pb-4">
          <div className="flex h-16 items-center justify-between">
            <img src="/logo.png" alt="ActionFlow" className="h-6 object-contain" />
            <div className="flex items-center gap-2">
              {/* Connection Status Badge */}
              <div
                title={`Socket status: ${connectionStatus}`}
                className={cn(
                  "flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium border",
                  connectionStatus === "connected"
                    ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20 dark:text-emerald-400"
                    : connectionStatus === "connecting"
                    ? "bg-amber-500/10 text-amber-600 border-amber-500/20 animate-pulse"
                    : "bg-destructive/10 text-destructive border-destructive/20"
                )}
              >
                {connectionStatus === "connected" ? (
                  <Wifi className="h-3 w-3" />
                ) : (
                  <WifiOff className="h-3 w-3" />
                )}
                <span className="capitalize">{connectionStatus}</span>
              </div>

              {/* Start New Conversation Button */}
              <button
                onClick={() => setIsNewChatModalOpen(true)}
                className="grid h-10 w-10 place-items-center rounded-full bg-primary/10 text-primary transition-colors hover:bg-primary/20 cursor-pointer"
                aria-label="New chat"
                title="Start new conversation"
              >
                <Plus className="h-5 w-5" />
              </button>
            </div>
          </div>

          {/* Search Box */}
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search conversations..."
              className="h-10 w-full rounded-full border border-transparent bg-muted pl-9 pr-4 text-sm outline-none transition placeholder:text-muted-foreground focus:border-primary/40 focus:bg-card"
            />
          </div>
        </header>

        {/* Network Error Alert */}
        {networkError && (
          <div className="bg-destructive/15 text-destructive text-xs px-4 py-2 border-b border-destructive/20 flex items-center justify-between">
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
            <div className="flex h-40 flex-col items-center justify-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
              <span>Loading conversations from MongoDB...</span>
            </div>
          ) : filtered.length === 0 ? (
            <div className="px-5 py-12 text-center text-sm text-muted-foreground">
              <MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-30 text-primary" />
              <p className="font-semibold text-foreground">No conversations yet</p>
              <p className="mt-1 text-xs">
                Click the <strong>+</strong> button above to start a chat with another teammate.
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
                    "flex w-full items-center gap-3 px-4 py-3 text-left transition-colors cursor-pointer",
                    isActive ? "bg-primary/8" : "hover:bg-muted"
                  )}
                >
                  <Avatar initials={t.initials} online={t.online} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="truncate font-display text-sm font-semibold">
                        {t.name}
                      </span>
                      <span className="shrink-0 text-[11px] text-muted-foreground">
                        {displayTime}
                      </span>
                    </div>
                    <div className="mt-0.5 flex items-center justify-between gap-2">
                      <p className="truncate text-xs text-muted-foreground">
                        {t.lastMessageText || "Started a conversation"}
                      </p>
                      {t.unread > 0 && (
                        <span className="grid h-5 min-w-5 shrink-0 place-items-center rounded-full bg-primary px-1.5 text-[11px] font-semibold text-primary-foreground">
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
          "flex min-w-0 flex-1 flex-col bg-background",
          !mobileOpen && "hidden md:flex"
        )}
      >
        {active ? (
          <>
            {/* Thread Header */}
            <header className="flex h-16 shrink-0 items-center gap-3 border-b border-border bg-card px-4 md:px-6">
              <button
                onClick={() => setMobileOpen(false)}
                className="-ml-1 grid h-9 w-9 place-items-center rounded-full text-muted-foreground hover:bg-muted md:hidden cursor-pointer"
                aria-label="Back to conversations"
              >
                <ArrowLeft className="h-5 w-5" />
              </button>

              <Avatar initials={active.initials} online={active.online} size="lg" />

              <div className="min-w-0">
                <p className="truncate font-display text-sm font-semibold">{active.name}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {active.online ? (
                    <span className="text-emerald-600 dark:text-emerald-400 font-medium">Online</span>
                  ) : (
                    active.role
                  )}
                </p>
              </div>

              <div className="ml-auto flex items-center gap-2" />
            </header>

            {/* Chat Messages Canvas */}
            <div ref={scrollRef} className="chat-canvas flex-1 overflow-y-auto px-4 py-6 md:px-10">
              <div className="mx-auto flex max-w-3xl flex-col gap-2.5">
                <div className="mb-2 self-center rounded-full bg-card px-3 py-1 text-[11px] font-medium text-muted-foreground shadow-xs border border-border/50">
                  Messages saved & delivered via Socket.IO
                </div>

                {loadingMessages ? (
                  <div className="flex h-48 items-center justify-center text-sm text-muted-foreground gap-2">
                    <Loader2 className="h-5 w-5 animate-spin text-primary" />
                    Loading message history...
                  </div>
                ) : messages.length === 0 ? (
                  <div className="py-20 text-center text-muted-foreground">
                    <p className="text-sm font-semibold text-foreground">No messages yet</p>
                    <p className="mt-1 text-xs">Send a message below to start this conversation.</p>
                  </div>
                ) : (
                  messages.map((m) => {
                    const isSender = m.from === "me";
                    const isDeleted = !!m.isDeletedForEveryone;
                    const isMenuOpen = activeMenuMessageId === m.id;

                    return (
                      <div
                        key={m.id}
                        className={cn(
                          "group relative max-w-[82%] rounded-2xl px-3.5 py-2 text-sm leading-relaxed shadow-xs md:max-w-[65%]",
                          isSender
                            ? "bubble-tail-out self-end bg-bubble-out text-bubble-out-foreground"
                            : "bubble-tail-in self-start bg-bubble-in text-bubble-in-foreground"
                        )}
                      >
                        {/* Hover Action Menu Trigger (WhatsApp Chevron) */}
                        <div className="message-menu-container absolute top-1.5 right-1.5 z-10">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setActiveMenuMessageId(isMenuOpen ? null : m.id);
                            }}
                            className={cn(
                              "grid h-6 w-6 place-items-center rounded-full text-muted-foreground transition-opacity hover:bg-black/10 dark:hover:bg-white/10 hover:text-foreground cursor-pointer",
                              isMenuOpen ? "opacity-100 bg-black/10 dark:bg-white/10" : "opacity-0 group-hover:opacity-100"
                            )}
                            title="Message options"
                          >
                            <MoreVertical className="h-3.5 w-3.5" />
                          </button>

                          {/* WhatsApp Context Menu Dropdown */}
                          {isMenuOpen && (
                            <div
                              onClick={(e) => e.stopPropagation()}
                              className={cn(
                                "absolute z-30 mt-1 w-44 rounded-xl border border-border bg-card p-1 shadow-lg animate-in fade-in zoom-in-95",
                                isSender ? "right-0" : "left-0"
                              )}
                            >
                              {/* Message Info */}
                              <button
                                onClick={() => {
                                  setActiveMenuMessageId(null);
                                  setInfoModalMessage(m);
                                }}
                                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs text-foreground hover:bg-muted transition-colors cursor-pointer text-left"
                              >
                                <Info className="h-3.5 w-3.5 text-primary" />
                                <span>Message info</span>
                              </button>

                              {/* Edit Message (Only for sender and not deleted) */}
                              {isSender && !isDeleted && (
                                <button
                                  onClick={() => handleStartEdit(m)}
                                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs text-foreground hover:bg-muted transition-colors cursor-pointer text-left"
                                >
                                  <Pencil className="h-3.5 w-3.5 text-amber-500" />
                                  <span>Edit</span>
                                </button>
                              )}

                              {/* Copy Text */}
                              {!isDeleted && (
                                <button
                                  onClick={() => handleCopy(m)}
                                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs text-foreground hover:bg-muted transition-colors cursor-pointer text-left"
                                >
                                  <Copy className="h-3.5 w-3.5 text-muted-foreground" />
                                  <span>{copiedId === m.id ? "Copied!" : "Copy"}</span>
                                </button>
                              )}

                              <div className="my-1 border-t border-border" />

                              {/* Delete Message */}
                              <button
                                onClick={() => {
                                  setActiveMenuMessageId(null);
                                  setDeleteModalMessage(m);
                                }}
                                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs text-destructive hover:bg-destructive/10 transition-colors cursor-pointer text-left"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                                <span>Delete message</span>
                              </button>
                            </div>
                          )}
                        </div>

                        {/* Message Content */}
                        {isDeleted ? (
                          <div className="flex items-center gap-1.5 italic text-muted-foreground pr-6 text-xs py-0.5">
                            <Ban className="h-3.5 w-3.5 shrink-0 opacity-70" />
                            <span>
                              {isSender ? "You deleted this message" : "This message was deleted"}
                            </span>
                          </div>
                        ) : (
                          <p className="whitespace-pre-wrap break-words pr-5">{m.text}</p>
                        )}

                        {/* Footer: Edited badge, timestamp, WhatsApp checkmarks */}
                        <div className="mt-1 flex items-center justify-end gap-1 text-[10px] text-muted-foreground">
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
                    );
                  })
                )}
              </div>
            </div>

            {/* Message Input Footer with WhatsApp-style Edit Banner */}
            <footer className="border-t border-border bg-card px-4 py-3 md:px-10">
              {/* WhatsApp Inline Edit Mode Banner */}
              {editingMessage && (
                <div className="mx-auto mb-2 flex max-w-3xl items-center justify-between rounded-xl bg-amber-500/10 border border-amber-500/20 px-3.5 py-2 text-xs">
                  <div className="flex items-center gap-2 min-w-0">
                    <Pencil className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />
                    <div className="min-w-0">
                      <span className="font-semibold text-amber-700 dark:text-amber-300">
                        Edit message
                      </span>
                      <p className="truncate text-muted-foreground text-[11px] mt-0.5">
                        "{editingMessage.text}"
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      setEditingMessage(null);
                      setDraft("");
                    }}
                    className="ml-2 grid h-6 w-6 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground cursor-pointer"
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
                className="mx-auto flex max-w-3xl items-end gap-2"
              >
                <button
                  type="button"
                  aria-label="Add emoji"
                  className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground cursor-pointer"
                >
                  <Smile className="h-5 w-5" />
                </button>
                <button
                  type="button"
                  aria-label="Attach file"
                  className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground cursor-pointer"
                >
                  <Paperclip className="h-5 w-5" />
                </button>

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
                      : `Message ${active.name}`
                  }
                  disabled={sending}
                  className="max-h-32 min-h-11 flex-1 resize-none rounded-2xl border border-transparent bg-muted px-4 py-3 text-sm outline-none transition placeholder:text-muted-foreground focus:border-primary/40 focus:bg-card disabled:opacity-50"
                />

                <button
                  type="submit"
                  disabled={!draft.trim() || sending}
                  className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground transition hover:bg-primary/90 disabled:opacity-40 cursor-pointer"
                  aria-label={editingMessage ? "Save edit" : "Send message"}
                  title={editingMessage ? "Save edit" : "Send message"}
                >
                  {sending ? (
                    <Loader2 className="h-4.5 w-4.5 animate-spin" />
                  ) : editingMessage ? (
                    <Check className="h-5 w-5" />
                  ) : (
                    <Send className="h-4.5 w-4.5" />
                  )}
                </button>
              </form>
            </footer>
          </>
        ) : (
          <div className="flex h-full flex-col items-center justify-center p-6 text-center">
            <div className="grid h-16 w-16 place-items-center rounded-2xl bg-primary/10 text-primary mb-4">
              <MessageSquare className="h-8 w-8" />
            </div>
            <h2 className="font-display text-xl font-bold text-foreground">
              Your ActionFlow Messages
            </h2>
            <p className="mt-1 text-sm text-muted-foreground max-w-sm">
              Select an existing conversation from the list or click below to start a new chat with a teammate.
            </p>
            <button
              onClick={() => setIsNewChatModalOpen(true)}
              className="mt-5 inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow hover:bg-primary/90 transition-all cursor-pointer"
            >
              <Plus className="h-4 w-4" />
              Start New Conversation
            </button>
          </div>
        )}
      </section>

      {/* Start New Conversation Modal */}
      <NewConversationModal
        open={isNewChatModalOpen}
        onOpenChange={setIsNewChatModalOpen}
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
    </>
  );
}
