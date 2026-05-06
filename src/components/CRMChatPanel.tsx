import { useState, useRef, useEffect } from "react";
import { Send, Bot, Loader2, Sparkles, Maximize2, Minimize2, Minus, Plus, Trash2, ChevronDown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  time: string;
}

interface Session {
  id: string;
  name: string;
  messages: ChatMessage[];
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
  { icon: "📊", text: "Compare current period with previous period", prompt: "Compare the current period with the previous period. Keep it short — only highlight the top lead sources (Organic Search, Direct, Referral) with their % change, for example: Organic Search +21.9%, Direct +24.9%. Then in 1-2 sentences explain the likely reason for the biggest change. No tables, no full breakdowns." },
  { icon: "📅", text: "Compare current period with last year", prompt: "Compare the current period with the same period last year. Keep it short — only highlight the top lead sources (Organic Search, Direct, Referral) with their % change, for example: Organic Search +21.9%, Direct -56.1%. Then in 1-2 sentences explain the likely reason for the biggest change. No tables, no full breakdowns." },
];

function nowTime() {
  return new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function newSession(name?: string): Session {
  return { id: crypto.randomUUID(), name: name ?? "New session", messages: [] };
}

// ── Markdown renderer (messenger-friendly) ────────────────────────────────────
function MsgContent({ text }: { text: string }) {
  const lines = text.split("\n");
  const nodes: React.ReactNode[] = [];
  let i = 0;

  function inline(raw: string): React.ReactNode[] {
    return raw.split(/(\*\*[^*]+\*\*)/g).map((p, k) =>
      p.startsWith("**") && p.endsWith("**")
        ? <strong key={k} className="font-semibold">{p.slice(2, -2)}</strong>
        : p
    );
  }

  while (i < lines.length) {
    const l = lines[i];
    if (!l.trim()) { i++; continue; }

    if (l.startsWith("## ")) {
      nodes.push(
        <p key={i} className="text-[10px] font-bold uppercase tracking-widest text-black/40 mt-2.5 mb-0.5 first:mt-0">
          {l.slice(3)}
        </p>
      );
      i++; continue;
    }
    if (/^[-*•]\s/.test(l)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*•]\s/.test(lines[i])) { items.push(lines[i].replace(/^[-*•]\s/, "")); i++; }
      nodes.push(
        <ul key={`ul${i}`} className="mt-1 mb-1 space-y-0.5">
          {items.map((it, ix) => (
            <li key={ix} className="flex items-start gap-1.5 text-[12.5px] leading-snug">
              <span className="mt-[6px] h-1 w-1 shrink-0 rounded-full bg-blue-400" />
              <span>{inline(it)}</span>
            </li>
          ))}
        </ul>
      );
      continue;
    }
    if (/^\d+\.\s/.test(l)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\.\s/.test(lines[i])) { items.push(lines[i].replace(/^\d+\.\s/, "")); i++; }
      nodes.push(
        <ol key={`ol${i}`} className="mt-1 mb-1 space-y-0.5">
          {items.map((it, ix) => (
            <li key={ix} className="flex items-start gap-1.5 text-[12.5px] leading-snug">
              <span className="shrink-0 text-[11px] font-bold text-blue-400 w-4">{ix + 1}.</span>
              <span>{inline(it)}</span>
            </li>
          ))}
        </ol>
      );
      continue;
    }
    if (/^[A-Za-z ]+:\s/.test(l) && !l.startsWith("http")) {
      const ci = l.indexOf(":");
      nodes.push(
        <div key={i} className="flex items-baseline gap-1 text-[12.5px] leading-snug mt-0.5">
          <span className="text-black/50 shrink-0">{l.slice(0, ci)}:</span>
          <span className="font-semibold">{inline(l.slice(ci + 1).trim())}</span>
        </div>
      );
      i++; continue;
    }
    nodes.push(<p key={i} className="text-[12.5px] leading-snug mt-0.5 first:mt-0">{inline(l)}</p>);
    i++;
  }
  return <div className="space-y-0.5">{nodes}</div>;
}

function TypingDots() {
  return (
    <div className="flex items-end gap-[3px] h-4 px-1">
      {[0, 1, 2].map((i) => (
        <span key={i} className="h-2 w-2 rounded-full bg-gray-400 animate-bounce"
          style={{ animationDelay: `${i * 160}ms`, animationDuration: "800ms" }} />
      ))}
    </div>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────
export function CRMChatPanel({ brandName, context }: CRMChatPanelProps) {
  const [sessions, setSessions] = useState<Session[]>([newSession("Session 1")]);
  const [activeId, setActiveId] = useState(sessions[0].id);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [maximized, setMaximized] = useState(false);
  const [minimized, setMinimized] = useState(true);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameVal, setRenameVal] = useState("");

  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const renameRef = useRef<HTMLInputElement>(null);

  const active = sessions.find((s) => s.id === activeId) ?? sessions[0];
  const messages = active.messages;

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, loading]);
  useEffect(() => { if (renamingId) renameRef.current?.focus(); }, [renamingId]);

  function setMessages(msgs: ChatMessage[]) {
    setSessions((p) => p.map((s) => s.id === activeId ? { ...s, messages: msgs } : s));
  }

  function addSession() {
    const s = newSession(`Session ${sessions.length + 1}`);
    setSessions((p) => [...p, s]);
    setActiveId(s.id);
  }

  function clearSession() {
    setSessions((p) => p.map((s) => s.id === activeId ? { ...s, messages: [] } : s));
  }

  function deleteSession(id: string) {
    if (sessions.length === 1) { clearSession(); return; }
    const rem = sessions.filter((s) => s.id !== id);
    setSessions(rem);
    if (activeId === id) setActiveId(rem[rem.length - 1].id);
  }

  function commitRename() {
    if (!renamingId) return;
    setSessions((p) => p.map((s) => s.id === renamingId ? { ...s, name: renameVal.trim() || s.name } : s));
    setRenamingId(null);
  }

  async function send(text: string) {
    const t = text.trim();
    if (!t || loading) return;
    const userMsg: ChatMessage = { role: "user", content: t, time: nowTime() };
    const next = [...messages, userMsg];
    setMessages(next);
    setInput("");
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("claude-chat", {
        body: { brandName, messages: next.map(({ role, content }) => ({ role, content })), context },
      });
      if (error) throw error;
      setMessages([...next, { role: "assistant", content: data.reply ?? "No response.", time: nowTime() }]);
    } catch {
      setMessages([...next, { role: "assistant", content: "Sorry, something went wrong. Please try again.", time: nowTime() }]);
    } finally {
      setLoading(false);
    }
  }

  function onKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input); }
  }

  // ── Size ──
  const W = maximized ? "w-[700px]" : "w-[460px]";

  if (minimized) {
    return (
      <button
        onClick={() => setMinimized(false)}
        title="Ask Me"
        className="fixed bottom-5 right-5 z-40 h-20 w-20 rounded-full shadow-2xl hover:scale-110 transition-transform duration-200 overflow-hidden p-0 border-0"
      >
        <img src="https://24202603.fs1.hubspotusercontent-na1.net/hubfs/24202603/Swan/website/common/abg-logo-legacy-2c.png" alt="ABG" className="h-full w-full object-cover" />
        <span className="absolute bottom-1 right-1 h-4 w-4 rounded-full bg-emerald-400 ring-2 ring-white" />
      </button>
    );
  }

  return (
    <div className={cn(
      "fixed bottom-5 right-5 z-40 flex flex-col rounded-2xl overflow-hidden shadow-2xl border border-black/10 transition-all duration-300",
      W,
      maximized ? "h-[88vh]" : "h-[78vh]"
    )}>

      {/* ── Header ── */}
      <div className="flex items-center gap-2.5 px-4 py-3 shrink-0 bg-gradient-to-r from-[#0B1E3D] to-[#1e3f70] cursor-default select-none">
        {/* Avatar */}
        <div className="relative shrink-0">
          <div className="h-9 w-9 rounded-full bg-gradient-to-br from-blue-400 to-indigo-600 flex items-center justify-center ring-2 ring-white/20">
            <Sparkles className="h-4 w-4 text-white" />
          </div>
          <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full bg-emerald-400 ring-2 ring-[#0B1E3D]" />
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-bold text-white leading-tight">Ask Me</p>
          <p className="text-[10px] text-white/45 leading-tight truncate">{brandName} · Active now</p>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-0.5 ml-1">
          <button onClick={clearSession} title="Clear chat"
            className="h-7 w-7 flex items-center justify-center rounded-lg text-white/40 hover:text-white hover:bg-white/10 transition-colors">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
          <button onClick={addSession} title="New session"
            className="h-7 w-7 flex items-center justify-center rounded-lg text-white/40 hover:text-white hover:bg-white/10 transition-colors">
            <Plus className="h-3.5 w-3.5" />
          </button>
          <button onClick={() => { setMinimized((v) => !v); setMaximized(false); }} title={minimized ? "Open" : "Minimize"}
            className="h-7 w-7 flex items-center justify-center rounded-lg text-white/40 hover:text-white hover:bg-white/10 transition-colors">
            {minimized ? <ChevronDown className="h-3.5 w-3.5 rotate-180" /> : <Minus className="h-3.5 w-3.5" />}
          </button>
          {!minimized && (
            <button onClick={() => setMaximized((v) => !v)} title={maximized ? "Restore" : "Maximize"}
              className="h-7 w-7 flex items-center justify-center rounded-lg text-white/40 hover:text-white hover:bg-white/10 transition-colors">
              {maximized ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
            </button>
          )}
        </div>
      </div>

      {/* ── Session tabs ── */}
      {!minimized && sessions.length > 1 && (
        <div className="flex items-center gap-1 px-3 py-1.5 bg-[#f0f2f5] border-b border-black/8 overflow-x-auto shrink-0">
          {sessions.map((s) => (
            <div key={s.id} className="flex items-center gap-0.5 shrink-0">
              {renamingId === s.id ? (
                <input ref={renameRef} value={renameVal} onChange={(e) => setRenameVal(e.target.value)}
                  onBlur={commitRename}
                  onKeyDown={(e) => { if (e.key === "Enter") commitRename(); if (e.key === "Escape") setRenamingId(null); }}
                  className="h-6 w-24 rounded px-1.5 text-[11px] bg-white border border-blue-400 outline-none" />
              ) : (
                <button onClick={() => setActiveId(s.id)} onDoubleClick={() => { setRenamingId(s.id); setRenameVal(s.name); }}
                  title="Double-click to rename"
                  className={cn("h-6 rounded-full px-3 text-[11px] font-medium transition-all whitespace-nowrap",
                    s.id === activeId ? "bg-[#0084FF] text-white shadow-sm" : "text-gray-500 hover:bg-black/8 hover:text-gray-800"
                  )}>
                  {s.name}
                </button>
              )}
              <button onClick={() => deleteSession(s.id)}
                className="flex h-4 w-4 items-center justify-center rounded-full text-gray-300 hover:text-red-400 transition-colors">
                <Trash2 className="h-2.5 w-2.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* ── Body ── */}
      <>
          {/* Messages area — WhatsApp-style bg */}
          <div
            className="flex-1 overflow-y-auto px-4 py-4 space-y-2 min-h-0"
            style={{ background: "linear-gradient(180deg, #dfe3ee 0%, #e8ecf3 100%)" }}
          >
            {/* Empty state */}
            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full gap-4 pb-4">
                <div className="text-center space-y-1">
                  <div className="mx-auto h-14 w-14 rounded-full bg-gradient-to-br from-[#0B1E3D] to-[#1e4080] flex items-center justify-center shadow-lg">
                    <Bot className="h-6 w-6 text-white/80" />
                  </div>
                  <p className="text-[13px] font-semibold text-gray-700 mt-2">How can I help?</p>
                  <p className="text-[11px] text-gray-500 max-w-[240px] mx-auto">
                    I have {brandName}'s CRM data loaded. Ask me anything about leads and performance.
                  </p>
                </div>
                <div className="w-full space-y-2">
                  {SUGGESTIONS.map((s) => (
                    <button key={s.text} onClick={() => send(s.prompt)}
                      className="w-full text-left rounded-2xl bg-white/80 backdrop-blur-sm px-4 py-2.5 text-[12.5px] text-gray-700 hover:bg-white shadow-sm hover:shadow-md transition-all flex items-center gap-3">
                      <span className="text-lg leading-none">{s.icon}</span>
                      <span>{s.text}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Messages */}
            {messages.map((msg, i) => {
              const isUser = msg.role === "user";
              return (
                <div key={i} className={cn("flex flex-col", isUser ? "items-end" : "items-start")}>
                  <div className={cn(
                    "max-w-[82%] px-4 py-2.5 shadow-sm",
                    isUser
                      ? "bg-[#0084FF] text-white rounded-[20px] rounded-br-[5px]"
                      : "bg-white text-gray-800 rounded-[20px] rounded-bl-[5px]"
                  )}>
                    {isUser
                      ? <p className="text-[13px] leading-snug">{msg.content}</p>
                      : <MsgContent text={msg.content} />
                    }
                  </div>
                  <p className="text-[10px] text-gray-400 mt-0.5 px-1">{msg.time}</p>
                </div>
              );
            })}

            {/* Typing indicator */}
            {loading && (
              <div className="flex items-start">
                <div className="bg-white rounded-[20px] rounded-bl-[5px] px-4 py-3 shadow-sm">
                  <TypingDots />
                </div>
              </div>
            )}

            <div ref={bottomRef} />
          </div>

          {/* ── Input bar ── */}
          <div className="px-3 py-2.5 bg-[#f0f2f5] border-t border-black/8 shrink-0">
            <div className="flex items-end gap-2">
              <div className="flex-1 min-w-0 rounded-[22px] bg-white border border-black/10 px-4 py-2 focus-within:border-blue-400/60 transition-colors shadow-sm">
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={onKey}
                  placeholder="Message Ask Me…"
                  rows={1}
                  disabled={loading}
                  className="w-full resize-none bg-transparent text-[13px] text-gray-800 placeholder:text-gray-400 outline-none disabled:opacity-50 max-h-28 leading-snug"
                />
              </div>
              <button
                onClick={() => send(input)}
                disabled={!input.trim() || loading}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#0084FF] text-white hover:bg-blue-600 active:scale-95 disabled:opacity-35 disabled:cursor-not-allowed transition-all shadow-md"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </button>
            </div>
          </div>
      </>
    </div>
  );
}
