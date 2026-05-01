import { useState, useRef, useEffect } from "react";
import { Send, Bot, User, Loader2, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
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

// ── Lightweight markdown renderer ─────────────────────────────────────────────
// Handles: ## headings, **bold**, bullet lists (- / *), numbered lists, plain text
function MarkdownContent({ text }: { text: string }) {
  const lines = text.split("\n");
  const elements: React.ReactNode[] = [];
  let i = 0;

  function renderInline(raw: string): React.ReactNode[] {
    const parts = raw.split(/(\*\*[^*]+\*\*)/g);
    return parts.map((part, idx) => {
      if (part.startsWith("**") && part.endsWith("**")) {
        return <strong key={idx} className="font-semibold text-foreground">{part.slice(2, -2)}</strong>;
      }
      return part;
    });
  }

  while (i < lines.length) {
    const line = lines[i];

    // Skip blank lines between blocks
    if (!line.trim()) { i++; continue; }

    // ## Section heading
    if (line.startsWith("## ")) {
      elements.push(
        <p key={i} className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mt-3 mb-1 first:mt-0">
          {line.slice(3)}
        </p>
      );
      i++; continue;
    }

    // # Top heading
    if (line.startsWith("# ")) {
      elements.push(
        <p key={i} className="text-xs font-bold text-foreground mt-2 mb-1 first:mt-0">
          {line.slice(2)}
        </p>
      );
      i++; continue;
    }

    // Bullet list block
    if (/^[-*•]\s/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*•]\s/.test(lines[i])) {
        items.push(lines[i].replace(/^[-*•]\s/, ""));
        i++;
      }
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

    // Numbered list block
    if (/^\d+\.\s/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\.\s/.test(lines[i])) {
        items.push(lines[i].replace(/^\d+\.\s/, ""));
        i++;
      }
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

    // Metric / key-value line  (e.g. "Assignment Rate: 72%")
    if (/^[A-Za-z ]+:\s/.test(line) && !line.startsWith("http")) {
      const colonIdx = line.indexOf(":");
      const key = line.slice(0, colonIdx);
      const val = line.slice(colonIdx + 1).trim();
      elements.push(
        <div key={i} className="flex items-baseline gap-1.5 text-xs mt-1">
          <span className="text-muted-foreground shrink-0">{key}:</span>
          <span className="font-semibold text-foreground">{renderInline(val)}</span>
        </div>
      );
      i++; continue;
    }

    // Plain paragraph
    elements.push(
      <p key={i} className="text-xs leading-relaxed mt-1 first:mt-0">
        {renderInline(line)}
      </p>
    );
    i++;
  }

  return <div className="space-y-0.5">{elements}</div>;
}

// ── Typing dots animation ──────────────────────────────────────────────────────
function TypingDots() {
  return (
    <div className="flex items-center gap-1 py-1">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="h-1.5 w-1.5 rounded-full bg-muted-foreground/50 animate-bounce"
          style={{ animationDelay: `${i * 150}ms`, animationDuration: "900ms" }}
        />
      ))}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
export function CRMChatPanel({ brandName, context }: CRMChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

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
      setMessages([
        ...next,
        { role: "assistant", content: "Sorry, something went wrong. Please try again." },
      ]);
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send(input);
    }
  }

  return (
    <div className="flex flex-col h-full min-h-0 rounded-2xl border border-border bg-card overflow-hidden shadow-lg">

      {/* ── Header ── */}
      <div className="flex items-center gap-3 px-4 py-3.5 bg-gradient-to-r from-[#0B1E3D] to-[#1a3560] border-b border-white/5">
        <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-white/10 ring-1 ring-white/10">
          <Sparkles className="h-4 w-4 text-white/90" />
        </div>
        <div>
          <p className="text-sm font-bold text-white leading-tight tracking-tight">Ask Claude</p>
          <p className="text-[10px] text-white/40 leading-tight">{brandName} · CRM Analysis</p>
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-[10px] text-white/35 font-medium">Live</span>
        </div>
      </div>

      {/* ── Messages ── */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 min-h-0 scroll-smooth">

        {/* Empty state */}
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
                <button
                  key={s.text}
                  onClick={() => send(s.text)}
                  className="w-full text-left rounded-xl border border-border bg-muted/30 px-3 py-2.5 text-xs text-foreground/70 hover:bg-muted hover:text-foreground hover:border-blue-500/30 transition-all flex items-center gap-2.5"
                >
                  <span className="text-base leading-none">{s.icon}</span>
                  <span>{s.text}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Message bubbles */}
        {messages.map((msg, i) => (
          <div key={i} className={cn("flex gap-2.5", msg.role === "user" ? "flex-row-reverse" : "flex-row")}>

            {/* Avatar */}
            <div className={cn(
              "flex h-6 w-6 shrink-0 items-center justify-center rounded-full mt-0.5 ring-1",
              msg.role === "user"
                ? "bg-blue-600 ring-blue-500/30"
                : "bg-gradient-to-br from-[#0B1E3D] to-[#1e4080] ring-white/10"
            )}>
              {msg.role === "user"
                ? <User className="h-3 w-3 text-white" />
                : <Bot className="h-3 w-3 text-white/80" />
              }
            </div>

            {/* Bubble */}
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

        {/* Typing indicator */}
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

      {/* ── Input ── */}
      <div className="px-3 pb-3 pt-2 border-t border-border bg-background/60">
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
    </div>
  );
}
