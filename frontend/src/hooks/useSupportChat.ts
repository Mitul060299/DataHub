import { useCallback, useRef, useState } from "react";
import { capture } from "../lib/posthog";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  intent?: string;
  hasCta?: boolean;   // assistant message contains a [CTA]...[/CTA] block
  ctaText?: string;
  hasEmailPrompt?: boolean;
}

interface SupportChatState {
  isOpen: boolean;
  isLoading: boolean;
  messages: ChatMessage[];
  sessionId: string | null;
  emailCaptured: boolean;
  showEmailPrompt: boolean;
  error: string | null;
}

interface UseSupportChatReturn extends SupportChatState {
  open: () => void;
  close: () => void;
  sendMessage: (text: string) => Promise<void>;
  submitEmail: (email: string) => Promise<void>;
  dismissEmailPrompt: () => void;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const VISITOR_ID_KEY = "datahub_support_visitor_id";
const SESSION_ID_KEY = "datahub_support_session_id";

const GREETING =
  "Hi! I'm the DataHub support assistant. Ask me anything about features, pricing, or how to get started — I'm happy to help.";

// ── URL helper ────────────────────────────────────────────────────────────────
// When VITE_API_BASE_URL is an absolute URL (Render/Vercel deployments), raw
// fetch("/api/...") calls go to the frontend origin and get re-written by
// Vercel's /api/(*) → backend/$1 rule — stripping the /api/ prefix — so the
// backend's /api/support-chat routes 404. Prefix with the configured base URL
// when it is absolute to bypass the rewrite layer and hit the backend directly.
// In Docker+Caddy builds VITE_API_BASE_URL is "/api" (relative), so raw paths
// already flow correctly through Caddy and we leave them unchanged.
const _configuredBase = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim() ?? "";
const _apiBase = _configuredBase.startsWith("http")
  ? _configuredBase.replace(/\/+$/, "")
  : "";
const _url = (path: string) => `${_apiBase}${path}`;

// ── CTA parsing ───────────────────────────────────────────────────────────────

const CTA_RE = /\[CTA\](.*?)\[\/CTA\]/s;

function parseCta(text: string): { clean: string; hasCta: boolean; ctaText: string } {
  const m = CTA_RE.exec(text);
  if (!m) return { clean: text, hasCta: false, ctaText: "" };
  return {
    clean: text.replace(CTA_RE, "").trim(),
    hasCta: true,
    ctaText: m[1].trim(),
  };
}

// ── Visitor ID ────────────────────────────────────────────────────────────────

function getOrCreateVisitorId(): string {
  try {
    let id = localStorage.getItem(VISITOR_ID_KEY);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(VISITOR_ID_KEY, id);
    }
    return id;
  } catch {
    return crypto.randomUUID();
  }
}

function getPersistedSessionId(): string | null {
  try {
    return localStorage.getItem(SESSION_ID_KEY);
  } catch {
    return null;
  }
}

function persistSessionId(id: string): void {
  try {
    localStorage.setItem(SESSION_ID_KEY, id);
  } catch {
    // storage not available — non-fatal
  }
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useSupportChat(): UseSupportChatReturn {
  const [state, setState] = useState<SupportChatState>({
    isOpen: false,
    isLoading: false,
    messages: [],
    sessionId: getPersistedSessionId(),
    emailCaptured: false,
    showEmailPrompt: false,
    error: null,
  });

  const userMessageCountRef = useRef(0);
  const abortControllerRef = useRef<AbortController | null>(null);

  // ── Ensure session exists ─────────────────────────────────────────────────

  const ensureSession = useCallback(async (): Promise<string> => {
    if (state.sessionId) return state.sessionId;

    const visitorId = getOrCreateVisitorId();
    const res = await fetch(_url("/api/support-chat/start"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        visitor_id: visitorId,
        first_page: window.location.pathname,
      }),
    });

    if (!res.ok) throw new Error("Failed to start chat session");

    const data = await res.json() as { session_id: string; greeting: string };
    persistSessionId(data.session_id);

    // Show greeting as first assistant message
    setState(prev => ({
      ...prev,
      sessionId: data.session_id,
      messages: [
        {
          id: crypto.randomUUID(),
          role: "assistant",
          text: GREETING,
        },
      ],
    }));

    return data.session_id;
  }, [state.sessionId]);

  // ── Open ──────────────────────────────────────────────────────────────────

  const open = useCallback(async () => {
    setState(prev => ({ ...prev, isOpen: true, error: null }));
    capture("chatbot_opened", { page: window.location.pathname });

    // If first time opening — initialise session and show greeting
    if (!state.sessionId) {
      try {
        await ensureSession();
      } catch {
        setState(prev => ({
          ...prev,
          messages: [{ id: crypto.randomUUID(), role: "assistant", text: GREETING }],
        }));
      }
    } else if (state.messages.length === 0) {
      setState(prev => ({
        ...prev,
        messages: [{ id: crypto.randomUUID(), role: "assistant", text: GREETING }],
      }));
    }
  }, [state.sessionId, state.messages.length, ensureSession]);

  // ── Close ─────────────────────────────────────────────────────────────────

  const close = useCallback(() => {
    abortControllerRef.current?.abort();
    setState(prev => ({ ...prev, isOpen: false }));
  }, []);

  // ── Send message ─────────────────────────────────────────────────────────

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || state.isLoading) return;

    // ── Step 1: Append the user message immediately so the UI never flickers.
    // The message is visible even if the subsequent network calls fail.
    const userMsgId = crypto.randomUUID();
    setState(prev => ({
      ...prev,
      isLoading: true,
      error: null,
      messages: [...prev.messages, { id: userMsgId, role: "user", text }],
    }));

    userMessageCountRef.current += 1;
    capture("chatbot_message_sent", {
      page: window.location.pathname,
      message_number: userMessageCountRef.current,
    });

    // ── Step 2: Ensure we have a session ID (creates one if needed).
    let sessionId: string;
    try {
      sessionId = await ensureSession();
    } catch {
      // Session creation failed — show an error reply so the user knows.
      setState(prev => ({
        ...prev,
        isLoading: false,
        messages: [
          ...prev.messages,
          {
            id: crypto.randomUUID(),
            role: "assistant" as const,
            text: "Sorry, I couldn't connect right now. Please try again in a moment.",
          },
        ],
      }));
      return;
    }

    // Placeholder assistant message that we'll stream into
    const assistantMsgId = crypto.randomUUID();
    setState(prev => ({
      ...prev,
      messages: [...prev.messages, { id: assistantMsgId, role: "assistant", text: "" }],
    }));

    // ── Abort any in-flight request ───────────────────────────────────────
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const res = await fetch(_url("/api/support-chat/message"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: sessionId, message: text }),
        signal: controller.signal,
      });

      if (!res.ok || !res.body) throw new Error("Stream unavailable");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let accumulated = "";
      let streamDone = false;

      while (!streamDone) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const raw = line.slice(6).trim();
          if (raw === "[DONE]") { streamDone = true; break; }
          try {
            const chunk = JSON.parse(raw) as { text?: string };
            if (chunk.text) {
              accumulated += chunk.text;
              setState(prev => ({
                ...prev,
                messages: prev.messages.map(m =>
                  m.id === assistantMsgId ? { ...m, text: accumulated } : m
                ),
              }));
            }
          } catch {
            // malformed chunk — skip
          }
        }
      }

      // ── Post-stream: parse CTA ──────────────────────────────────────────
      const { clean, hasCta, ctaText } = parseCta(accumulated);
      setState(prev => ({
        ...prev,
        isLoading: false,
        messages: prev.messages.map(m =>
          m.id === assistantMsgId
            ? { ...m, text: clean, hasCta, ctaText }
            : m
        ),
        // Show email prompt after 2nd user message if not yet captured
        showEmailPrompt:
          !prev.emailCaptured && userMessageCountRef.current >= 2
            ? true
            : prev.showEmailPrompt,
      }));
    } catch (err: unknown) {
      if ((err as { name?: string }).name === "AbortError") return;
      setState(prev => ({
        ...prev,
        isLoading: false,
        messages: prev.messages.map(m =>
          m.id === assistantMsgId
            ? { ...m, text: "Sorry, I couldn't process that. Please try again." }
            : m
        ),
      }));
    }
  }, [state.isLoading, ensureSession]);

  // ── Submit email ─────────────────────────────────────────────────────────

  const submitEmail = useCallback(async (email: string) => {
    if (!state.sessionId) return;
    try {
      await fetch(_url("/api/support-chat/email"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: state.sessionId, email }),
      });
      capture("chatbot_email_captured", { page: window.location.pathname });
    } catch {
      // non-fatal
    }
    setState(prev => ({ ...prev, emailCaptured: true, showEmailPrompt: false }));
  }, [state.sessionId]);

  // ── Dismiss email prompt ─────────────────────────────────────────────────

  const dismissEmailPrompt = useCallback(() => {
    setState(prev => ({ ...prev, showEmailPrompt: false }));
  }, []);

  return { ...state, open, close, sendMessage, submitEmail, dismissEmailPrompt };
}
