import React, { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import {
  Search,
  X,
  MessageSquare,
  CheckSquare,
  Users,
  User,
  Clock,
  ArrowRight,
  Sparkles,
  Command,
  CornerDownLeft,
  AlertCircle,
  RefreshCw,
} from "lucide-react";
import { api, type SearchResultItem, type GlobalSearchResponse } from "@/lib/api";
import { useWorkspace } from "@/context/WorkspaceContext";
import { useAuth } from "@/context/AuthContext";
import { cn } from "@/lib/utils";

type SearchCategory = "all" | "messages" | "tasks" | "conversations" | "people";

interface GlobalSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
}

function HighlightText({ text, query }: { text: string; query: string }) {
  if (!query || !query.trim() || !text) {
    return <span>{text}</span>;
  }

  try {
    const escaped = query.trim().replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&");
    const regex = new RegExp(`(${escaped})`, "gi");
    const parts = text.split(regex);

    return (
      <span>
        {parts.map((part, index) =>
          regex.test(part) ? (
            <mark
              key={index}
              className="bg-primary/25 text-foreground font-semibold px-0.5 rounded-sm"
            >
              {part}
            </mark>
          ) : (
            <span key={index}>{part}</span>
          )
        )}
      </span>
    );
  } catch {
    return <span>{text}</span>;
  }
}

export function GlobalSearchModal({ isOpen, onClose }: GlobalSearchModalProps) {
  const { activeWorkspace } = useWorkspace();
  const { token } = useAuth();

  const [query, setQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<SearchCategory>("all");
  const [results, setResults] = useState<GlobalSearchResponse["results"]>({
    messages: [],
    tasks: [],
    conversations: [],
    people: [],
  });
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);

  const inputRef = useRef<HTMLInputElement>(null);
  const debounceTimer = useRef<NodeJS.Timeout | null>(null);

  // Focus input when modal opens
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 50);
    } else {
      setQuery("");
      setResults({ messages: [], tasks: [], conversations: [], people: [] });
      setTotal(0);
      setSelectedIndex(0);
    }
  }, [isOpen]);

  // Execute search with debounce
  const executeSearch = useCallback(
    async (q: string, category: SearchCategory) => {
      if (!token || !activeWorkspace?.id || !q.trim()) {
        setResults({ messages: [], tasks: [], conversations: [], people: [] });
        setTotal(0);
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        const res = await api.globalSearch(activeWorkspace.id, q.trim(), category, 10);
        setResults(res.results);
        setTotal(res.total);
        setSelectedIndex(0);
      } catch (err) {
        console.error("[GlobalSearch] Search failed:", err);
      } finally {
        setLoading(false);
      }
    },
    [token, activeWorkspace?.id]
  );

  const handleQueryChange = (val: string) => {
    setQuery(val);
    if (debounceTimer.current) clearTimeout(debounceTimer.current);

    if (!val.trim()) {
      setResults({ messages: [], tasks: [], conversations: [], people: [] });
      setTotal(0);
      setLoading(false);
      return;
    }

    setLoading(true);
    debounceTimer.current = setTimeout(() => {
      executeSearch(val, activeCategory);
    }, 280);
  };

  const handleCategoryChange = (category: SearchCategory) => {
    setActiveCategory(category);
    if (query.trim()) {
      executeSearch(query, category);
    }
  };

  // Compile all visible items into a flat list for arrow key navigation
  const flatItems: SearchResultItem[] = [];
  if (activeCategory === "all" || activeCategory === "messages") {
    flatItems.push(...results.messages);
  }
  if (activeCategory === "all" || activeCategory === "tasks") {
    flatItems.push(...results.tasks);
  }
  if (activeCategory === "all" || activeCategory === "conversations") {
    flatItems.push(...results.conversations);
  }
  if (activeCategory === "all" || activeCategory === "people") {
    flatItems.push(...results.people);
  }

  const handleItemClick = (item: SearchResultItem) => {
    onClose();
    if (item.navigationUrl) {
      window.location.href = item.navigationUrl;
    }
  };

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
      return;
    }

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) => (flatItems.length ? (prev + 1) % flatItems.length : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) =>
        flatItems.length ? (prev - 1 + flatItems.length) % flatItems.length : 0
      );
    } else if (e.key === "Enter" && flatItems.length > 0) {
      e.preventDefault();
      const selected = flatItems[selectedIndex];
      if (selected) {
        handleItemClick(selected);
      }
    }
  };

  if (!isOpen || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-16 sm:pt-24 px-4 bg-background/80 backdrop-blur-md animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl flex flex-col rounded-2xl bg-card border border-border shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        {/* Search Header Input */}
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-border bg-card/80">
          <Search className="h-5 w-5 text-muted-foreground shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => handleQueryChange(e.target.value)}
            placeholder="Search messages, tasks, chats, and colleagues... (Press ESC to close)"
            className="flex-1 bg-transparent text-sm sm:text-base text-foreground placeholder:text-muted-foreground/60 focus:outline-none"
          />
          {loading ? (
            <RefreshCw className="h-4 w-4 animate-spin text-primary shrink-0" />
          ) : query ? (
            <button
              type="button"
              onClick={() => handleQueryChange("")}
              className="grid h-6 w-6 place-items-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          ) : (
            <div className="flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">
              <kbd>ESC</kbd>
            </div>
          )}
        </div>

        {/* Category Filter Pills */}
        <div className="flex items-center gap-1 px-4 py-2 border-b border-border/60 bg-muted/20 overflow-x-auto custom-scrollbar">
          {(
            [
              { key: "all", label: "All", count: total },
              { key: "messages", label: "Messages", count: results.messages.length },
              { key: "tasks", label: "Tasks", count: results.tasks.length },
              { key: "conversations", label: "Chats", count: results.conversations.length },
              { key: "people", label: "People", count: results.people.length },
            ] as const
          ).map((cat) => (
            <button
              key={cat.key}
              type="button"
              onClick={() => handleCategoryChange(cat.key)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition-all shrink-0 cursor-pointer",
                activeCategory === cat.key
                  ? "bg-primary text-primary-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
              )}
            >
              <span>{cat.label}</span>
              {query.trim() && cat.count > 0 && (
                <span
                  className={cn(
                    "rounded-full px-1.5 py-0.2 text-[10px]",
                    activeCategory === cat.key
                      ? "bg-primary-foreground/20 text-primary-foreground"
                      : "bg-muted text-muted-foreground"
                  )}
                >
                  {cat.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Search Results List */}
        <div className="max-h-[60vh] overflow-y-auto divide-y divide-border/40 custom-scrollbar p-2">
          {!query.trim() ? (
            <div className="py-14 px-6 text-center text-xs text-muted-foreground">
              <Sparkles className="h-8 w-8 mx-auto mb-3 text-primary/40" />
              <p className="text-sm font-bold text-foreground">Global Workspace Search</p>
              <p className="mt-1 text-muted-foreground max-w-sm mx-auto">
                Type keywords to find any direct or group message, task, project chat, or colleague in Soul Business Solutions.
              </p>
              <div className="flex items-center justify-center gap-4 mt-4 text-[11px] text-muted-foreground/80">
                <span className="flex items-center gap-1">
                  <kbd className="px-1.5 py-0.5 rounded bg-muted text-[10px]">↑↓</kbd> Navigate
                </span>
                <span className="flex items-center gap-1">
                  <kbd className="px-1.5 py-0.5 rounded bg-muted text-[10px]">Enter</kbd> Open
                </span>
                <span className="flex items-center gap-1">
                  <kbd className="px-1.5 py-0.5 rounded bg-muted text-[10px]">Esc</kbd> Close
                </span>
              </div>
            </div>
          ) : flatItems.length === 0 && !loading ? (
            <div className="py-14 px-6 text-center text-xs text-muted-foreground">
              <AlertCircle className="h-8 w-8 mx-auto mb-2 text-muted-foreground/40" />
              <p className="text-sm font-semibold text-foreground">No matches found</p>
              <p className="mt-1">
                We couldn't find any results matching <span className="font-semibold text-foreground">"{query}"</span>.
              </p>
              <p className="mt-0.5 text-muted-foreground">Try a different search term or check spelling.</p>
            </div>
          ) : (
            <div className="space-y-1">
              {flatItems.map((item, idx) => {
                const isSelected = idx === selectedIndex;
                return (
                  <div
                    key={`${item.type}-${item.id}`}
                    onClick={() => handleItemClick(item)}
                    onMouseEnter={() => setSelectedIndex(idx)}
                    className={cn(
                      "group flex items-start gap-3 p-3 rounded-xl transition-all cursor-pointer",
                      isSelected
                        ? "bg-primary/10 border border-primary/20 text-foreground"
                        : "hover:bg-muted/50 border border-transparent"
                    )}
                  >
                    {/* Item Icon */}
                    <div
                      className={cn(
                        "grid h-8 w-8 place-items-center rounded-lg border shadow-xs shrink-0 mt-0.5",
                        item.type === "message" && "bg-blue-500/10 border-blue-500/20 text-blue-500",
                        item.type === "task" && "bg-emerald-500/10 border-emerald-500/20 text-emerald-500",
                        item.type === "conversation" && "bg-indigo-500/10 border-indigo-500/20 text-indigo-500",
                        item.type === "person" && "bg-teal-500/10 border-teal-500/20 text-teal-500"
                      )}
                    >
                      {item.type === "message" && <MessageSquare className="h-4 w-4" />}
                      {item.type === "task" && <CheckSquare className="h-4 w-4" />}
                      {item.type === "conversation" && <Users className="h-4 w-4" />}
                      {item.type === "person" && <User className="h-4 w-4" />}
                    </div>

                    {/* Item Body */}
                    <div className="flex-1 min-w-0 pr-2">
                      <div className="flex items-center justify-between gap-2 mb-0.5">
                        <div className="flex items-center gap-2 truncate">
                          <span className="text-xs font-bold truncate">
                            <HighlightText text={item.title} query={query} />
                          </span>
                          <span
                            className={cn(
                              "text-[10px] font-semibold uppercase px-1.5 py-0.2 rounded",
                              item.type === "message" && "bg-blue-500/10 text-blue-500",
                              item.type === "task" && "bg-emerald-500/10 text-emerald-500",
                              item.type === "conversation" && "bg-indigo-500/10 text-indigo-500",
                              item.type === "person" && "bg-teal-500/10 text-teal-500"
                            )}
                          >
                            {item.type}
                          </span>
                        </div>
                        {item.createdAt && (
                          <span className="text-[10px] text-muted-foreground shrink-0">
                            {new Date(item.createdAt).toLocaleDateString(undefined, {
                              month: "short",
                              day: "numeric",
                            })}
                          </span>
                        )}
                      </div>

                      {/* Snippet / Description */}
                      {item.snippet && (
                        <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                          <HighlightText text={item.snippet} query={query} />
                        </p>
                      )}

                      {/* Extra context info */}
                      {item.type === "message" && item.conversationName && (
                        <span className="inline-block text-[10px] text-muted-foreground/75 mt-1">
                          In: {item.conversationName}
                        </span>
                      )}

                      {item.type === "task" && (
                        <div className="flex items-center gap-2 mt-1.5 text-[10px]">
                          {item.status && (
                            <span
                              className={cn(
                                "font-semibold px-1.5 py-0.2 rounded",
                                item.status === "DONE"
                                  ? "bg-emerald-500/15 text-emerald-500"
                                  : "bg-muted text-muted-foreground"
                              )}
                            >
                              {item.status}
                            </span>
                          )}
                          {item.priority && (
                            <span className="font-semibold text-muted-foreground">
                              Priority: {item.priority}
                            </span>
                          )}
                          {item.assignee && (
                            <span className="text-muted-foreground">
                              Assignee: {item.assignee.displayName}
                            </span>
                          )}
                        </div>
                      )}

                      {item.type === "person" && item.role && (
                        <span className="inline-block text-[10px] font-semibold text-primary mt-1">
                          Role: {item.role}
                        </span>
                      )}
                    </div>

                    {/* Arrow Action */}
                    <div
                      className={cn(
                        "grid h-6 w-6 place-items-center rounded-md text-muted-foreground transition-all shrink-0 self-center",
                        isSelected ? "text-primary translate-x-0.5" : "opacity-0 group-hover:opacity-100"
                      )}
                    >
                      <CornerDownLeft className="h-3.5 w-3.5" />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between px-4 py-2.5 border-t border-border bg-card/60 text-[11px] text-muted-foreground">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 rounded bg-muted text-[10px]">↑↓</kbd> to navigate
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 rounded bg-muted text-[10px]">↵</kbd> to select
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 rounded bg-muted text-[10px]">ESC</kbd> to close
            </span>
          </div>
          <span>Soul Business Solutions</span>
        </div>
      </div>
    </div>,
    document.body
  );
}
