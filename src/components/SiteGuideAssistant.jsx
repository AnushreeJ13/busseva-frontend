// src/components/SiteGuideAssistant.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

// Cross-browser SpeechRecognition
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;

function langToBcp47(i18nLang) {
  // Map short codes to common BCP‑47 tags used by STT/TTS engines
  const map = {
    en: "en-US",
    "en-US": "en-US",
    hi: "hi-IN",
    "hi-IN": "hi-IN",
    mr: "mr-IN",
    "mr-IN": "mr-IN",
    bn: "bn-IN",
    te: "te-IN",
    ta: "ta-IN",
    kn: "kn-IN",
    gu: "gu-IN",
  };
  return map[i18nLang] || i18nLang || "en-US";
}

export default function SiteGuideAssistant() {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [messages, setMessages] = useState([
    { role: "assistant", text: t("hello_how_can_help", "Hi! Ask anything or say: 'Open features', 'Go to how it works', or 'Open admin login'.") },
  ]);
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const recRef = useRef(null);

  // Choose a voice that matches the current language
  const voiceLang = langToBcp47(i18n.language);
  const voice = useMemo(() => {
    const synth = window.speechSynthesis;
    if (!synth) return null;
    const voices = synth.getVoices();
    // Prefer exact language match, else first default voice
    return (
      voices.find(v => v.lang?.toLowerCase().startsWith(voiceLang.toLowerCase())) ||
      voices.find(v => v.default) ||
      voices[0] ||
      null
    );
  }, [voiceLang]);

  // Ensure voices are loaded on some browsers
  useEffect(() => {
    if (!window.speechSynthesis) return;
    const handler = () => {};
    window.speechSynthesis.addEventListener("voiceschanged", handler);
    // Trigger population
    window.speechSynthesis.getVoices();
    return () => window.speechSynthesis.removeEventListener("voiceschanged", handler);
  }, []);

  function speak(text) {
    if (!window.speechSynthesis) return;
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = voiceLang;
    if (voice) utter.voice = voice;
    utter.rate = 1;
    utter.pitch = 1;
    utter.onstart = () => setSpeaking(true);
    utter.onend = () => setSpeaking(false);
    window.speechSynthesis.speak(utter);
  }

  // Simple command router to guide the site
  function handleGuidedActions(text) {
    const lower = text.toLowerCase();
    if (lower.includes("admin") || lower.includes("login")) {
      // Navigate to admin login route or link
      window.location.href = "/login";
      return t("navigating_admin_login", "Opening Admin Login…");
    }
    if (lower.includes("home")) {
      window.location.hash = "#home";
      return t("navigating_home", "Taking you to Home…");
    }
    if (lower.includes("how") || lower.includes("works")) {
      window.location.hash = "#how-it-works";
      return t("navigating_how_it_works", "Taking you to How it works…");
    }
    if (lower.includes("feature")) {
      window.location.hash = "#features";
      return t("navigating_features", "Taking you to Features…");
    }
    if (lower.includes("platform")) {
      window.location.hash = "#platforms";
      return t("navigating_platforms", "Taking you to Platforms…");
    }
    return null; // no direct action
  }

  async function askAssistant(text) {
    // First try guided actions
    const guided = handleGuidedActions(text);
    if (guided) return guided;

    // Optional: call a backend LLM route; fallback to a rule-based hint if not configured
    try {
      const res = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          language: voiceLang,
          history: messages.slice(-10),
          query: text,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        return data.text || t("assistant_generic_help", "Here’s what was found about that on this site.");
      }
    } catch (e) {
      // ignore and fall back
    }

    // Fallback heuristic
    return t(
      "assistant_fallback",
      "Try: 'Open features', 'Go to how it works', 'Open admin login', or ask about booking, tracking, safety and reviews."
    );
  }

  function ensureRecognizer() {
    if (!SR) return null;
    if (recRef.current) return recRef.current;
    const rec = new SR();
    rec.lang = voiceLang;
    rec.continuous = false;
    rec.interimResults = true;
    rec.maxAlternatives = 1;
    rec.onresult = (e) => {
      let interim = "";
      let final = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const transcript = e.results[i][0].transcript;
        if (e.results[i].isFinal) final += transcript;
        else interim += transcript;
      }
      if (interim) setQuery(interim);
      if (final) {
        setQuery("");
        handleSubmit(final.trim());
      }
    };
    rec.onerror = () => setListening(false);
    rec.onend = () => setListening(false);
    recRef.current = rec;
    return rec;
  }

  function startListening() {
    const rec = ensureRecognizer();
    if (!rec) return;
    try {
      setListening(true);
      rec.lang = voiceLang;
      rec.start();
    } catch {
      setListening(false);
    }
  }

  function stopListening() {
    if (recRef.current) {
      try { recRef.current.stop(); } catch {}
    }
    setListening(false);
  }

  async function handleSubmit(textIn) {
    const text = (textIn ?? query).trim();
    if (!text) return;
    const next = [...messages, { role: "user", text }];
    setMessages(next);
    setQuery("");
    const reply = await askAssistant(text);
    const next2 = [...next, { role: "assistant", text: reply }];
    setMessages(next2);
    // Speak answer in the active language
    speak(reply);
  }

  // Basic styles inline to keep it portable
  const styles = {
    fab: {
      position: "fixed",
      bottom: 20,
      right: 20,
      width: 56,
      height: 56,
      borderRadius: "50%",
      background: "#0f1280",
      color: "white",
      border: "none",
      boxShadow: "0 8px 22px rgba(0,0,0,0.25)",
      cursor: "pointer",
      zIndex: 2500
    },
    panel: {
      position: "fixed",
      bottom: 90,
      right: 20,
      width: 340,
      maxWidth: "90vw",
      height: 440,
      background: "white",
      borderRadius: 16,
      boxShadow: "0 16px 40px rgba(0,0,0,0.25)",
      display: "flex",
      flexDirection: "column",
      overflow: "hidden",
      zIndex: 2500
    },
    header: {
      padding: "10px 12px",
      background: "#0f1280",
      color: "white",
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      fontWeight: 700
    },
    body: { flex: 1, padding: 12, overflowY: "auto", background: "#f8fafc" },
    msg: (role) => ({
      background: role === "assistant" ? "white" : "#e0e7ff",
      color: "#0f172a",
      padding: "8px 10px",
      borderRadius: 10,
      maxWidth: "85%",
      alignSelf: role === "assistant" ? "flex-start" : "flex-end",
      margin: "6px 0",
      boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
      whiteSpace: "pre-wrap"
    }),
    footer: { padding: 10, display: "flex", gap: 8, alignItems: "center", background: "white", borderTop: "1px solid #e5e7eb" },
    input: { flex: 1, padding: "10px 12px", borderRadius: 10, border: "1px solid #e5e7eb", outline: "none" },
    btn: { padding: "10px 12px", borderRadius: 10, border: "none", cursor: "pointer", background: "#0f1280", color: "white", fontWeight: 700 }
  };

  return (
    <>
      <button
        style={styles.fab}
        aria-label={t("open_assistant", "Open assistant")}
        onClick={() => setOpen(v => !v)}
        title={t("open_assistant", "Open assistant")}
      >
        {open ? "×" : "🤖"}
      </button>

      {open && (
        <div style={styles.panel} role="dialog" aria-label={t("assistant", "Assistant")}>
          <div style={styles.header}>
            <span>{t("assistant_title", "Site Guide Assistant")}</span>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {speaking ? "🔊" : "🔈"}
              <button onClick={() => setOpen(false)} style={{ background: "transparent", color: "white", border: "none", cursor: "pointer" }}>×</button>
            </div>
          </div>

          <div style={styles.body}>
            <div style={{ display: "flex", flexDirection: "column" }}>
              {messages.map((m, i) => (
                <div key={i} style={styles.msg(m.role)}>{m.text}</div>
              ))}
            </div>
          </div>

          <div style={styles.footer}>
            <input
              style={styles.input}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("ask_anything", "Ask anything…")}
              onKeyDown={(e) => { if (e.key === "Enter") handleSubmit(); }}
            />
            {SR ? (
              listening ? (
                <button style={{ ...styles.btn, background: "#dc2626" }} onClick={stopListening}>
                  {t("stop", "Stop")} 🎙️
                </button>
              ) : (
                <button style={styles.btn} onClick={startListening}>
                  {t("speak", "Speak")} 🎤
                </button>
              )
            ) : (
              <button style={{ ...styles.btn, background: "#64748b" }} disabled title={t("speech_unavailable", "Speech not supported")}>
                🎤
              </button>
            )}
            <button style={styles.btn} onClick={() => handleSubmit()}>{t("send", "Send")}</button>
          </div>
        </div>
      )}
    </>
  );
}
