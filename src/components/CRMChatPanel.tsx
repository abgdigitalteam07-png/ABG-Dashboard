import { useState, useRef, useEffect } from "react";
import {
  Send, Bot, User, Loader2, Sparkles,
  Maximize2, Minimize2, Minus, Plus, Trash2,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface Session {
  id: string;
  name: string;
  messages: ChatMessage[];
  createdAt: Date;
}

interface CRMChatPanelProps {
  brandName: string;
  context: {
    totalContacts?: number;
    dealerAssignedTotal?: number;
    dealerUnassignedTotal?: number;
    dateRange?: string;
    secondaryStats?: {
      total?: number;
      assigned?: number;
      unassigned?: number;
      prevTotal?: number;
      prevAssigned?: number;
      prevUnassigned?: number;
    };
  };
}

const SUGGESTIONS = [
  { icon: "📊", text: "What's my lead assignment rate?" },
  { icon: "📈", text: "How does this period compare to last?" },
  { icon: "⚠️", text: "Which metric needs the most attention?" },
];

function newSession(name?: string): Session {
  return { id: crypto.randomUUID(), name: name ?? "New session", messages: [], createdAt: new Date() };
}

// ── Lightweight markdown renderer ─────────────────────────────────────────────
function MarkdownContent({ text }: { text: string }) {
  const lines = text.split("\n");
  const elements: React.ReactNode[] = [];
  let i = 0;

  function renderInline(raw: string): React.ReactNode[] {
    return raw.split(/(\*\*[^*]+\*\*)/g).map((part, idx) =>
      part.startsWith("**") && part.endsWith("**")
        ? <strong key={idx} className="font-semibold text-foreground">{part.slice(2, -2)}</strong>
        : part
    );
  }

  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }

    if (line.startsWith("## ")) {
      elements.push(
        <p key={i} className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mt-3 mb-1 first:mt-0">
          {line.slice(3)}
        </p>
      );
      i++; continue;
    }
    if (line.startsWith("# ")) {
      elements.push(
        <p key={i} className="text-xs font-bold text-foreground mt-2 mb-1 first:mt-0">{line.slice(2)}</p>
      );
      i++; continue;
    }
    if (/^[-*•]\s/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*•]\s/.test(lines[i])) { items.push(lines[i].replace(/^[-*•]\s/, "")); i++; }
      elements.push(
        <ul key={`ul-${i}`} className="mt-1.5 mb-1.5 space-y-1">
          {items.map((item, idx) => (
            <li key={idx} className="flex items-start gap-2 text-xs leading-relaxed">
              <span className="mt-[5px] h-1 w-1 shrink-0 rounded-full bg-blue-500/70" />
              <span>{renderInline(item)}</span>
            </li>
          ))}
        </ul>
      );
      continue;
    }
    if (/^\d+\.\s/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\.\s/.test(lines[i])) { items.push(lines[i].replace(/^\d+\.\s/, "")); i++; }
      elements.push(
        <ol key={`ol-${i}`} className="mt-1.5 mb-1.5 space-y-1">
          {items.map((item, idx) => (
            <li key={idx} className="flex items-start gap-2 text-xs leading-relaxed">
              <span className="shrink-0 text-[10px] font-bold text-blue-500/80 w-4 mt-[1px]">{idx + 1}.</span>
              <span>{renderInline(item)}</span>
            </li>
          ))}
        </ol>
      );
      continue;
    }
    if (/^[A-Za-z ]+:\s/.test(line) && !line.startsWith("http")) {
      const colonIdx = line.indexOf(":");
      elements.push(
        <div key={i} className="flex items-baseline gap-1.5 text-xs mt-1">
          <span className="text-muted-foreground shrink-0">{line.slice(0, colonIdx)}:</span>
          <span className="font-semibold text-foreground">{renderInline(line.slice(colonIdx + 1).trim())}</span>
        </div>
      );
      i++; continue;
    }
    elements.push(
      <p key={i} className="text-xs leading-relaxed mt-1 first:mt-0">{renderInline(line)}</p>
    );
    i++;
  }
  return <div className="space-y-0.5">{elements}</div>;
}

function TypingDots() {
  return (
    <div className="flex items-center gap-1 py-1">
      {[0, 1, 2].map((i) => (
        <span key={i} className="h-1.5 w-1.5 rounded-full bg-muted-foreground/50 animate-bounce"
          style={{ animationDelay: `${i * 150}ms`, animationDuration: "900ms" }} />
      ))}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
export function CRMChatPanel({ brandName, context }: CRMChatPanelProps) {
  const [sessions, setSessions] = useState<Session[]>([newSession("Session 1")]);
  const [activeId, setActiveId] = useState<string>(sessions[0].id);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [maximized, setMaximized] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const renameRef = useRef<HTMLInputElement>(null);

  const active = sessions.find((s) => s.id === activeId) ?? sessions[0];
  const messages = active.messages;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  useEffect(() => {
    if (renamingId) renameRef.current?.focus();
  }, [renamingId]);

  function setMessages(msgs: ChatMessage[]) {
    setSessions((prev) => prev.map((s) => s.id === activeId ? { ...s, messages: msgs } : s));
  }

  function addSession() {
    const count = sessions.length + 1;
    const s = newSession(`Session ${count}`);
    setSessions((prev) => [...prev, s]);
    setActiveId(s.id);
  }

  function clearSession() {
    setSessions((prev) => prev.map((s) => s.id === activeId ? { ...s, messages: [] } : s));
  }

  function deleteSession(id: string) {
    if (sessions.length === 1) { clearSession(); return; }
    const remaining = sessions.filter((s) => s.id !== id);
    setSessions(remaining);
    if (activeId === id) setActiveId(remaining[remaining.length - 1].id);
  }

  function startRename(id: string, current: string) {
    setRenamingId(id);
    setRenameValue(current);
  }

  function commitRename() {
    if (!renamingId) return;
    setSessions((prev) => prev.map((s) => s.id === renamingId ? { ...s, name: renameValue.trim() || s.name } : s));
    setRenamingId(null);
  }

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || loading) return;
    const userMsg: ChatMessage = { role: "user", content: trimmed };
    const next = [...messages, userMsg];
    setMessages(next);
    setInput("");
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("claude-chat", {
        body: { brandName, messages: next, context },
      });
      if (error) throw error;
      setMessages([...next, { role: "assistant", content: data.reply ?? "No response received." }]);
    } catch {
      setMessages([...next, { role: "assistant", content: "Sorry, something went wrong. Please try again." }]);
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input); }
  }

  // ── Panel size classes ──
  const panelClass = maximized
    ? "fixed right-4 top-4 bottom-4 z-50 w-[700px] shadow-2xl"
    : "h-full";

  return (
    <div className={cn("flex flex-col rounded-2xl border border-border bg-card overflow-hidden", panelClass,
      minimized && "h-auto")}>

      {/* ── Header ── */}
      <div className="flex items-center gap-2.5 px-4 py-3 bg-gradient-to-r from-[#0B1E3D] to-[#1a3560] border-b border-white/5 shrink-0">
        <div className="flex h-7 w-7 items-center justify-center rounded-xl bg-white/10 ring-1 ring-white/10">
          <Sparkles className="h-3.5 w-3.5 text-white/90" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-white leading-tight tracking-tight truncate">Ask Mostafa</p>
          <p className="text-[10px] text-white/40 leading-tight truncate">{brandName} · CRM Analysis</p>
        </div>
        {/* Controls */}
        <div className="flex items-center gap-1 ml-auto">
          {/* Clear session */}
          <button
            onClick={clearSession}
            title="Clear session"
            className="flex h-6 w-6 items-center justify-center rounded-lg text-white/40 hover:text-white hover:bg-white/10 transition-colors"
          >
            <Trash2 className="h-3 w-3" />
          </button>
          {/* New session */}
          <button
            onClick={addSession}
            title="New session"
            className="flex h-6 w-6 items-center justify-center rounded-lg text-white/40 hover:text-white hover:bg-white/10 transition-colors"
          >
            <Plus className="h-3 w-3" />
          </button>
          {/* Minimize */}
          <button
            onClick={() => { setMinimized((v) => !v); if (maximized) setMaximized(false); }}
            title={minimized ? "Expand" : "Minimize"}
            className="flex h-6 w-6 items-center justify-center rounded-lg text-white/40 hover:text-white hover:bg-white/10 transition-colors"
          >
            <Minus className="h-3 w-3" />
          </button>
          {/* Maximize */}
          {!minimized && (
            <button
              onClick={() => setMaximized((v) => !v)}
              title={maximized ? "Restore" : "Maximize"}
              className="flex h-6 w-6 items-center justify-center rounded-lg text-white/40 hover:text-white hover:bg-white/10 transition-colors"
            >
              {maximized ? <Minimize2 className="h-3 w-3" /> : <Maximize2 className="h-3 w-3" />}
            </button>
          )}
        </div>
      </div>

      {/* ── Session tabs (only when multiple) ── */}
      {!minimized && sessions.length > 1 && (
        <div className="flex items-center gap-1 px-3 py-1.5 border-b border-border bg-muted/30 overflow-x-auto shrink-0">
          {sessions.map((s) => (
            <div key={s.id} className="flex items-center gap-1 shrink-0">
              {renamingId === s.id ? (
                <input
                  ref={renameRef}
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  onBlur={commitRename}
                  onKeyDown={(e) => { if (e.key === "Enter") commitRename(); if (e.key === "Escape") setRenamingId(null); }}
                  className="h-6 w-24 rounded px-1.5 text-[11px] bg-background border border-blue-500/50 outline-none text-foreground"
                />
              ) : (
                <button
                  onClick={() => setActiveId(s.id)}
                  onDoubleClick={() => startRename(s.id, s.name)}
                  title="Double-click to rename"
                  className={cn(
                    "h-6 rounded px-2.5 text-[11px] font-medium transition-colors whitespace-nowrap",
                    s.id === activeId
                      ? "bg-blue-600 text-white"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted"
                  )}
                >
                  {s.name}
                </button>
              )}
              {sessions.length > 1 && (
                <button
                  onClick={() => deleteSession(s.id)}
                  className="flex h-4 w-4 items-center justify-center rounded text-muted-foreground/40 hover:text-red-500 transition-colors"
                >
                  <Trash2 className="h-2.5 w-2.5" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── Body (hidden when minimized) ── */}
      {!minimized && (
        <>
          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 min-h-0 scroll-smooth">
            {messages.length === 0 && (
              <div className="space-y-5 pt-1">
                <div className="text-center space-y-1">
                  <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-[#0B1E3D] to-[#1e4080] shadow-md">
                    <Bot className="h-5 w-5 text-white/80" />
                  </div>
                  <p className="text-xs font-semibold text-foreground mt-2">How can I help?</p>
                  <p className="text-[11px] text-muted-foreground">
                    I have your {brandName} CRM data loaded. Ask me anything.
                  </p>
                </div>
                <div className="space-y-2">
                  {SUGGESTIONS.map((s) => (
                    <button key={s.text} onClick={() => send(s.text)}
                      className="w-full text-left rounded-xl border border-border bg-muted/30 px-3 py-2.5 text-xs text-foreground/70 hover:bg-muted hover:text-foreground hover:border-blue-500/30 transition-all flex items-center gap-2.5"
                    >
                      <span className="text-base leading-none">{s.icon}</span>
                      <span>{s.text}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((msg, i) => (
              <div key={i} className={cn("flex gap-2.5", msg.role === "user" ? "flex-row-reverse" : "flex-row")}>
                <div className={cn(
                  "flex h-6 w-6 shrink-0 items-center justify-center rounded-full mt-0.5 ring-1",
                  msg.role === "user"
                    ? "bg-blue-600 ring-blue-500/30"
                    : "bg-gradient-to-br from-[#0B1E3D] to-[#1e4080] ring-white/10"
                )}>
                  {msg.role === "user" ? <User className="h-3 w-3 text-white" /> : <Bot className="h-3 w-3 text-white/80" />}
                </div>
                {msg.role === "user" ? (
                  <div className="max-w-[85%] rounded-2xl rounded-tr-sm bg-blue-600 px-3.5 py-2.5 text-xs text-white leading-relaxed shadow-sm">
                    {msg.content}
                  </div>
                ) : (
                  <div className="max-w-[92%] rounded-2xl rounded-tl-sm border border-border bg-muted/40 px-4 py-3 shadow-sm">
                    <MarkdownContent text={msg.content} />
                  </div>
                )}
              </div>
            ))}

            {loading && (
              <div className="flex gap-2.5">
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#0B1E3D] to-[#1e4080] ring-1 ring-white/10 mt-0.5">
                  <Bot className="h-3 w-3 text-white/80" />
                </div>
                <div className="rounded-2xl rounded-tl-sm border border-border bg-muted/40 px-4 py-3">
                  <TypingDots />
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div className="px-3 pb-3 pt-2 border-t border-border bg-background/60 shrink-0">
            <div className="flex items-end gap-2 rounded-xl border border-border bg-background px-3 py-2.5 focus-within:ring-2 focus-within:ring-blue-500/25 focus-within:border-blue-500/40 transition-all">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask about leads, assignments, trends…"
                rows={1}
                disabled={loading}
                className="flex-1 resize-none bg-transparent text-xs text-foreground placeholder:text-muted-foreground/60 outline-none disabled:opacity-50 max-h-24 leading-relaxed"
              />
              <button
                onClick={() => send(input)}
                disabled={!input.trim() || loading}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-blue-600 text-white hover:bg-blue-700 active:scale-95 disabled:opacity-35 disabled:cursor-not-allowed transition-all"
              >
                {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
              </button>
            </div>
            <p className="mt-1.5 text-[9px] text-muted-foreground/40 text-center">
              Enter to send · Shift+Enter for new line
            </p>
          </div>
        </>
      )}

      {/* Minimized footer hint */}
      {minimized && (
        <button
          onClick={() => setMinimized(false)}
          className="px-4 py-2 text-[10px] text-white/40 hover:text-white/70 text-center transition-colors bg-[#0B1E3D]"
        >
          Click to expand · {messages.length} message{messages.length !== 1 ? "s" : ""}
        </button>
      )}
    </div>
  );
}
