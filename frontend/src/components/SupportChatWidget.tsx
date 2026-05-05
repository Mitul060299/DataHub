import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useSupportChat } from "../hooks/useSupportChat";
import { capture } from "../lib/posthog";

// ── Inline styles ─────────────────────────────────────────────────────────────
// Self-contained so the widget doesn't depend on global CSS classes.

const Z = 10000;

const styles = {
  bubble: (hasUnread: boolean): React.CSSProperties => ({
    position: "fixed",
    bottom: 24,
    right: 24,
    width: 56,
    height: 56,
    borderRadius: "50%",
    background: "linear-gradient(135deg, #5B6AF0 0%, #7c3aed 100%)",
    boxShadow: "0 4px 20px rgba(91,106,240,0.5)",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: Z,
    border: "none",
    outline: "none",
    animation: hasUnread ? "datahub-pulse 2s ease-in-out infinite" : "none",
    transition: "transform 0.15s ease",
  }),
  bubbleIcon: {
    color: "#fff",
    fontSize: 24,
    lineHeight: 1,
    userSelect: "none" as const,
  },
  unreadDot: {
    position: "absolute" as const,
    top: 4,
    right: 4,
    width: 12,
    height: 12,
    borderRadius: "50%",
    background: "#f87171",
    border: "2px solid #fff",
  },
  panel: {
    position: "fixed" as const,
    bottom: 92,
    right: 24,
    width: 380,
    height: 520,
    background: "#0f1117",
    border: "1px solid rgba(91,106,240,0.3)",
    borderRadius: 16,
    boxShadow: "0 16px 48px rgba(0,0,0,0.6)",
    display: "flex",
    flexDirection: "column" as const,
    overflow: "hidden",
    zIndex: Z,
    fontFamily: "inherit",
  },
  header: {
    padding: "14px 16px",
    borderBottom: "1px solid rgba(255,255,255,0.08)",
    display: "flex",
    alignItems: "center",
    gap: 10,
    background: "rgba(91,106,240,0.12)",
  },
  headerDot: {
    width: 8,
    height: 8,
    borderRadius: "50%",
    background: "#4ade80",
    flexShrink: 0,
  },
  headerTitle: {
    color: "#fff",
    fontWeight: 600,
    fontSize: 14,
    flex: 1,
  },
  headerSub: {
    color: "rgba(255,255,255,0.5)",
    fontSize: 11,
  },
  closeBtn: {
    background: "none",
    border: "none",
    color: "rgba(255,255,255,0.4)",
    cursor: "pointer",
    fontSize: 18,
    lineHeight: 1,
    padding: 4,
  },
  messages: {
    flex: 1,
    overflowY: "auto" as const,
    padding: "12px 16px",
    display: "flex",
    flexDirection: "column" as const,
    gap: 10,
  },
  msgUser: {
    alignSelf: "flex-end" as const,
    background: "rgba(91,106,240,0.25)",
    color: "#e8eaff",
    padding: "8px 12px",
    borderRadius: "12px 12px 2px 12px",
    fontSize: 13,
    maxWidth: "80%",
    lineHeight: 1.5,
    wordBreak: "break-word" as const,
  },
  msgAssistant: {
    alignSelf: "flex-start" as const,
    background: "rgba(255,255,255,0.06)",
    color: "#d1d5db",
    padding: "8px 12px",
    borderRadius: "12px 12px 12px 2px",
    fontSize: 13,
    maxWidth: "85%",
    lineHeight: 1.5,
    wordBreak: "break-word" as const,
  },
  ctaBtn: {
    marginTop: 8,
    display: "block",
    background: "linear-gradient(135deg, #5B6AF0, #7c3aed)",
    color: "#fff",
    border: "none",
    borderRadius: 8,
    padding: "8px 14px",
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
    width: "100%",
    textAlign: "left" as const,
  },
  emailPrompt: {
    margin: "4px 16px 8px",
    background: "rgba(91,106,240,0.1)",
    border: "1px solid rgba(91,106,240,0.25)",
    borderRadius: 10,
    padding: "10px 12px",
    fontSize: 12,
    color: "rgba(255,255,255,0.7)",
  },
  emailRow: {
    display: "flex",
    gap: 6,
    marginTop: 6,
  },
  emailInput: {
    flex: 1,
    background: "rgba(255,255,255,0.06)",
    border: "1px solid rgba(255,255,255,0.15)",
    borderRadius: 6,
    color: "#fff",
    padding: "5px 8px",
    fontSize: 12,
    outline: "none",
  },
  emailSubmit: {
    background: "#5B6AF0",
    border: "none",
    borderRadius: 6,
    color: "#fff",
    padding: "5px 10px",
    fontSize: 12,
    fontWeight: 600,
    cursor: "pointer",
  },
  emailDismiss: {
    background: "none",
    border: "none",
    color: "rgba(255,255,255,0.35)",
    cursor: "pointer",
    fontSize: 11,
    padding: "2px 6px",
  },
  inputArea: {
    borderTop: "1px solid rgba(255,255,255,0.08)",
    padding: "10px 12px",
    display: "flex",
    gap: 8,
    alignItems: "flex-end",
  },
  textarea: {
    flex: 1,
    background: "rgba(255,255,255,0.06)",
    border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: 10,
    color: "#e2e8f0",
    padding: "8px 10px",
    fontSize: 13,
    resize: "none" as const,
    outline: "none",
    fontFamily: "inherit",
    lineHeight: 1.5,
    maxHeight: 96,
  },
  sendBtn: (disabled: boolean): React.CSSProperties => ({
    background: disabled ? "rgba(91,106,240,0.3)" : "#5B6AF0",
    border: "none",
    borderRadius: 10,
    color: "#fff",
    width: 36,
    height: 36,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: disabled ? "not-allowed" : "pointer",
    flexShrink: 0,
    fontSize: 16,
  }),
  loadingDots: {
    display: "inline-flex",
    gap: 3,
    alignItems: "center",
    padding: "6px 10px",
  },
  dot: (delay: number): React.CSSProperties => ({
    width: 6,
    height: 6,
    borderRadius: "50%",
    background: "rgba(255,255,255,0.4)",
    animation: `datahub-bounce 1.2s ${delay}s ease-in-out infinite`,
  }),
} as const;

// ── Keyframe injection (done once) ────────────────────────────────────────────

let _stylesInjected = false;
function injectKeyframes() {
  if (_stylesInjected || typeof document === "undefined") return;
  _stylesInjected = true;
  const el = document.createElement("style");
  el.textContent = `
    @keyframes datahub-pulse {
      0%, 100% { box-shadow: 0 4px 20px rgba(91,106,240,0.5); }
      50%       { box-shadow: 0 4px 32px rgba(91,106,240,0.9), 0 0 0 8px rgba(91,106,240,0.15); }
    }
    @keyframes datahub-bounce {
      0%, 80%, 100% { transform: scale(0.7); opacity: 0.4; }
      40%            { transform: scale(1);   opacity: 1;   }
    }
  `;
  document.head.appendChild(el);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function isValidEmail(v: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

// ── Component ─────────────────────────────────────────────────────────────────

export function SupportChatWidget() {
  injectKeyframes();

  const chat = useSupportChat();
  const navigate = useNavigate();
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const [input, setInput] = useState("");
  const [emailInput, setEmailInput] = useState("");
  const [hasUnread, setHasUnread] = useState(true); // pulse until first open

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chat.messages]);

  // Mark as read on open
  useEffect(() => {
    if (chat.isOpen) setHasUnread(false);
  }, [chat.isOpen]);

  // Keyboard: Escape closes
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" && chat.isOpen) chat.close();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [chat.isOpen, chat.close]);

  const handleSend = () => {
    const text = input.trim();
    if (!text || chat.isLoading) return;
    setInput("");
    void chat.sendMessage(text);
    // Reset textarea height
    if (textareaRef.current) textareaRef.current.style.height = "auto";
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleCtaClick = (ctaText: string) => {
    capture("chatbot_cta_clicked", {
      cta_text: ctaText,
      page: window.location.pathname,
    });
    navigate("/workspace");
  };

  const handleEmailSubmit = () => {
    if (!isValidEmail(emailInput)) return;
    void chat.submitEmail(emailInput);
    setEmailInput("");
  };

  return (
    <>
      {/* ── Panel ─────────────────────────────────────────────────────── */}
      {chat.isOpen && (
        <div style={styles.panel} role="dialog" aria-label="DataHub support chat">
          {/* Header */}
          <div style={styles.header}>
            <span style={styles.headerDot} />
            <div style={{ flex: 1 }}>
              <div style={styles.headerTitle}>DataHub Support</div>
              <div style={styles.headerSub}>Typically replies instantly</div>
            </div>
            <button
              style={styles.closeBtn}
              onClick={chat.close}
              aria-label="Close chat"
            >
              ✕
            </button>
          </div>

          {/* Messages */}
          <div style={styles.messages}>
            {chat.messages.map(msg => (
              <div
                key={msg.id}
                style={msg.role === "user" ? styles.msgUser : styles.msgAssistant}
              >
                {msg.text || (
                  msg.role === "assistant" && chat.isLoading ? (
                    <span style={styles.loadingDots}>
                      <span style={styles.dot(0)} />
                      <span style={styles.dot(0.2)} />
                      <span style={styles.dot(0.4)} />
                    </span>
                  ) : null
                )}
                {msg.hasCta && msg.ctaText && (
                  <button
                    style={styles.ctaBtn}
                    onClick={() => handleCtaClick(msg.ctaText!)}
                  >
                    {msg.ctaText} →
                  </button>
                )}
              </div>
            ))}
            <div ref={bottomRef} />
          </div>

          {/* Email prompt */}
          {chat.showEmailPrompt && (
            <div style={styles.emailPrompt}>
              <span>Want a follow-up? Add your email (optional).</span>
              <div style={styles.emailRow}>
                <input
                  type="email"
                  placeholder="you@example.com"
                  value={emailInput}
                  onChange={e => setEmailInput(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") handleEmailSubmit(); }}
                  style={styles.emailInput}
                />
                <button
                  style={styles.emailSubmit}
                  onClick={handleEmailSubmit}
                  disabled={!isValidEmail(emailInput)}
                >
                  Save
                </button>
                <button style={styles.emailDismiss} onClick={chat.dismissEmailPrompt}>
                  Skip
                </button>
              </div>
            </div>
          )}

          {/* Input area */}
          <div style={styles.inputArea}>
            <textarea
              ref={textareaRef}
              rows={1}
              placeholder="Ask anything about DataHub…"
              value={input}
              onChange={e => {
                setInput(e.target.value);
                e.target.style.height = "auto";
                e.target.style.height = `${Math.min(e.target.scrollHeight, 96)}px`;
              }}
              onKeyDown={handleKeyDown}
              disabled={chat.isLoading}
              style={styles.textarea}
            />
            <button
              style={styles.sendBtn(chat.isLoading || !input.trim())}
              onClick={handleSend}
              disabled={chat.isLoading || !input.trim()}
              aria-label="Send message"
            >
              ↑
            </button>
          </div>
        </div>
      )}

      {/* ── Bubble ────────────────────────────────────────────────────── */}
      <button
        style={styles.bubble(!chat.isOpen && hasUnread)}
        onClick={chat.isOpen ? chat.close : chat.open}
        aria-label={chat.isOpen ? "Close support chat" : "Open support chat"}
        title="Chat with us"
      >
        <span style={styles.bubbleIcon}>{chat.isOpen ? "✕" : "💬"}</span>
        {!chat.isOpen && hasUnread && <span style={styles.unreadDot} />}
      </button>
    </>
  );
}
