// src/components/SiteGuideAssistant.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

const SR = typeof window !== "undefined" ? (window.SpeechRecognition || window.webkitSpeechRecognition) : null;

function getSessionId() {
  try {
    const k = "busseva-session-id";
    let v = localStorage.getItem(k);
    if (!v) { v = (crypto?.randomUUID?.() || Math.random().toString(36).slice(2)); localStorage.setItem(k, v); }
    return v;
  } catch { return "anon"; }
}
function normalizeLang(i18nLang) {
  const l = String(i18nLang || "hi").toLowerCase();
  if (l.startsWith("hi")) return "hi";
  if (l.startsWith("en")) return "en";
  return "hi";
}
function langToBcp47(i18nLang) {
  const map = {
    en: "en-US","en-US": "en-US",
    hi: "hi-IN","hi-IN":"hi-IN",
    mr:"mr-IN","mr-IN":"mr-IN",
    bn:"bn-IN","bn-IN":"bn-IN",
    te:"te-IN","te-IN":"te-IN",
    ta:"ta-IN","ta-IN":"ta-IN",
    kn:"kn-IN","kn-IN":"kn-IN",
    gu:"gu-IN","gu-IN":"gu-IN"
  };
  return map[i18nLang] || i18nLang || "hi-IN";
}

async function fetchJSON(url, options = {}, { retries = 2, timeoutMs = 12000 } = {}) {
  const controller = new AbortController();
  const timeoutSignal = AbortSignal.timeout ? AbortSignal.timeout(timeoutMs) : null;
  const onTimeout = () => controller.abort("timeout");
  let timeoutId = null;
  try {
    if (!timeoutSignal) { timeoutId = setTimeout(onTimeout, timeoutMs); }
    const res = await fetch(url, { ...options, signal: timeoutSignal || controller.signal });
    if (!res.ok) {
      if ((res.status >= 500 || res.status === 429) && retries > 0) {
        await new Promise(r => setTimeout(r, (3 - retries) * 700 + 300));
        return fetchJSON(url, options, { retries: retries - 1, timeoutMs });
      }
      throw new Error(`HTTP ${res.status}`);
    }
    return await res.json();
  } catch (err) {
    if (retries > 0) {
      await new Promise(r => setTimeout(r, (3 - retries) * 700 + 300));
      return fetchJSON(url, options, { retries: retries - 1, timeoutMs });
    }
    throw err;
  } finally { if (timeoutId) clearTimeout(timeoutId); }
}

export default function SiteGuideAssistant() {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [messages, setMessages] = useState([
    { role: "assistant", text: t("hello_how_can_help",
      "Namaste! Jaldi madad ke liye bolo: ‘Features kholo’, ‘How it works dikhao’, ‘Booking’, ‘Tracking’, ‘App’, ‘Driver’, ya ‘Admin login’.") },
  ]);
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [status, setStatus] = useState("ready");
  const recRef = useRef(null);
  const sessionIdRef = useRef(getSessionId());

  const voiceLang = langToBcp47(normalizeLang(i18n.language));
  const voice = useMemo(() => {
    const synth = typeof window !== "undefined" ? window.speechSynthesis : null;
    if (!synth) return null;
    const pick = () => {
      const voices = synth.getVoices();
      return voices.find(v => v.lang?.toLowerCase().startsWith(voiceLang.toLowerCase()))
          || voices.find(v => v.default)
          || voices[0]
          || null;
    };
    const v = pick();
    return v;
  }, [voiceLang]);

  useEffect(() => {
    if (!window.speechSynthesis) return;
    const handler = () => { window.speechSynthesis.getVoices(); };
    window.speechSynthesis.addEventListener("voiceschanged", handler);
    window.speechSynthesis.getVoices();
    return () => window.speechSynthesis.removeEventListener("voiceschanged", handler);
  }, []);

  function speak(text) {
    if (!window.speechSynthesis) return;
    try {
      window.speechSynthesis.cancel();
      const utter = new SpeechSynthesisUtterance(text);
      utter.lang = voiceLang;
      if (voice) utter.voice = voice;
      utter.rate = 1; utter.pitch = 1;
      utter.onstart = () => setSpeaking(true);
      utter.onend = () => setSpeaking(false);
      window.speechSynthesis.speak(utter);
    } catch {
      // ignore speech errors
    }
  }

  function handleGuidedActions(text) {
    const lower = text.toLowerCase();

    const hiHow = ["कैसे काम", "kaise", "kaam", "किस तरह", "किस तरह काम", "how it works", "how"];
    const hiFeatures = ["फीचर", "फ़ीचर", "features", "feature", "विकल्प"];
    const hiHome = ["होम", "home", "मुखपृष्ठ"];
    const hiAdmin = ["एडमिन", "लॉगिन", "admin", "login"];
    const hiApp = ["ऐप", "app", "mobile app", "android", "ios", "download"];
    const hiDriver = ["ड्राइवर", "driver", "chalan", "shift", "verification", "onboarding"];

    if (lower.includes("admin") || lower.includes("login") || hiAdmin.some(x => lower.includes(x))) {
      window.location.href = "/login"; return t("navigating_admin_login", "Admin login khol raha/rahi hoon…");
    }
    // Home => platform
    if (lower.includes("home") || hiHome.some(x => lower.includes(x))) {
      window.location.hash = ""; return t("navigating_home", "Home me Platform section dikhaya jaa raha hai…");
    }
    if (hiHow.some(x => lower.includes(x))) {
      window.location.hash = "#how-it-works"; return t("navigating_how_it_works", "How it works section khol diya…");
    }
    if (lower.includes("feature") || hiFeatures.some(x => lower.includes(x))) {
      window.location.hash = "#features"; return t("navigating_features", "Features khol diye…");
    }
    // Platform keywords => platform
    if (lower.includes("platform")) {
      window.location.hash = "#platforms"; return t("navigating_platforms", "Platform section khul gaya…");
    }
    // App/Driver => platform (centralized)
    if (hiApp.some(x => lower.includes(x))) {
      window.location.hash = "#platforms"; return t("navigating_app", "Platform section me App details dikh rahe hain…");
    }
    if (hiDriver.some(x => lower.includes(x))) {
      window.location.hash = "#platforms"; return t("navigating_driver", "Platform section me Driver details dikh rahe hain…");
    }
    return null;
  }

  async function askAssistant(text) {
    const guided = handleGuidedActions(text);
    if (guided) return guided;
    try {
      setStatus("querying");
      const lang = normalizeLang(i18n.language);
      const data = await fetchJSON("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-session-id": sessionIdRef.current },
        body: JSON.stringify({ query: text, lang, sessionId: sessionIdRef.current }),
      }, { retries: 2, timeoutMs: 12000 });
      setStatus("ready");
      return data.text || t("assistant_generic_help", "Site se related jo mila, woh neeche diya gaya hai.");
    } catch {
      setStatus("error");
    }
    return t("assistant_fallback", "Try: ‘Features kholo’, ‘How it works dikhao’, ‘Admin login’, ya booking, tracking, safety, reviews, app, driver ke baare mein puchho.");
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
      let interim = "", final = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const transcript = e.results[i][0].transcript;
        if (e.results[i].isFinal) final += transcript; else interim += transcript;
      }
      if (interim) setQuery(interim);
      if (final) { setQuery(""); handleSubmit(final.trim()); }
    };
    rec.onerror = () => setListening(false);
    rec.onend = () => setListening(false);
    recRef.current = rec;
    return rec;
  }

  function startListening() {
    const rec = ensureRecognizer();
    if (!rec) return;
    try { setListening(true); rec.lang = voiceLang; rec.start(); } catch { setListening(false); }
  }
  function stopListening() {
    if (recRef.current) { try { recRef.current.stop(); } catch {} }
    setListening(false);
  }

  async function handleSubmit(textIn) {
    const text = (textIn ?? query).trim();
    if (!text) return;
    const next = [...messages, { role: "user", text }]; setMessages(next); setQuery("");
    const reply = await askAssistant(text);
    const next2 = [...next, { role: "assistant", text: reply }]; setMessages(next2);
    speak(reply);
  }

  // Auto open + fetch dynamic site guide once per browser (Hindi-first)
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const key = "busseva-assistant-seen-guide";
        const seen = localStorage.getItem(key);
        if (!seen) {
          setOpen(true);
          const lang = normalizeLang(i18n.language);
          // Prefer the explicit guide endpoint for a dense Tier-2 guide
          let data = null;
          try {
            data = await fetchJSON(`/api/guide?lang=${lang}`, {}, { retries: 1, timeoutMs: 10000 });
          } catch {
            data = await fetchJSON("/api/assistant", {
              method: "POST",
              headers: { "Content-Type": "application/json", "x-session-id": sessionIdRef.current },
              body: JSON.stringify({ query: "site_guide", lang, sessionId: sessionIdRef.current }),
            }, { retries: 1, timeoutMs: 12000 });
          }
          if (!mounted) return;
          const text = data?.text || (lang === "hi"
            ? [
                "• होम: ऊपर मेन्यू से ‘Features’, ‘How it works’, ‘Booking’, ‘Tracking’, ‘App’, ‘Driver’, ‘Admin’ देखें।",
                "• बुकिंग: रूट/तारीख चुनें → यात्री विवरण → पेमेंट → कन्फर्मेशन।",
                "• ट्रैकिंग: PNR/बुकिंग ID डालें, बस की लाइव लोकेशन देखें।",
                "• ऐप: ‘App’ सेक्शन में एंड्रॉइड/iOS डाउनलोड और उपयोग स्टेप्स देखें।",
                "• ड्राइवर: ‘Driver’ में ऑनबोर्डिंग, दस्तावेज़, शिफ्ट, और SOS रिपोर्टिंग।",
                "• सेफ्टी/रिव्यू: SOS, शिकायत, और रेटिंग देकर मदद करें।",
                "• एडमिन: स्टाफ/मैनेजर्स ‘Admin login’ से साइन-इन करें।"
              ].join("\n")
            : [
                "• Home: Top menu → ‘Features’, ‘How it works’, ‘Booking’, ‘Tracking’, ‘App’, ‘Driver’, ‘Admin’.",
                "• Booking: Pick route/date → passenger details → payment → confirmation.",
                "• User: See Android/iOS download and quick usage in ‘App’.",
                "• Driver: Download Driver app ‘Driver’.",
                "• Safety/Reviews: Use SOS, file issues, and give ratings.",
                "• Admin: Staff/managers use ‘Admin login’."
              ].join("\n"));
          setMessages(m => [...m, { role: "assistant", text }]);
          speak(text);
          localStorage.setItem(key, "1");
        }
      } catch { /* ignore */ }
    })();
    return () => { mounted = false; };
  }, [i18n.language]);

  // NEW: Default to #platform and smooth-scroll on load and on hash changes
  useEffect(() => {
    const ensureDefaultAndScroll = () => {
      if (!window.location.hash || window.location.hash === "#home") {
        history.replaceState(null, "", "#platforms");
      }
      const id = (window.location.hash || "#platforms").slice(1);
      const el = document.getElementById(id);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start", inline: "nearest" });
    };
    const t = setTimeout(ensureDefaultAndScroll, 0);
    window.addEventListener("hashchange", ensureDefaultAndScroll);
    return () => { clearTimeout(t); window.removeEventListener("hashchange", ensureDefaultAndScroll); };
  }, []);

  const styles = {
    fab: { position: "fixed", bottom: 20, right: 20, width: 56, height: 56, borderRadius: "50%", background: "#0f1280", color: "white", border: "none", boxShadow: "0 8px 22px rgba(0,0,0,0.25)", cursor: "pointer", zIndex: 2500 },
    panel: { position: "fixed", bottom: 90, right: 20, width: 360, maxWidth: "92vw", height: 520, background: "white", borderRadius: 16, boxShadow: "0 16px 40px rgba(0,0,0,0.25)", display: "flex", flexDirection: "column", overflow: "hidden", zIndex: 2500 },
    header: { padding: "10px 12px", background: "#0f1280", color: "white", display: "flex", alignItems: "center", justifyContent: "space-between", fontWeight: 700 },
    statusBar: { padding: "6px 12px", fontSize: 12, background: "#f1f5f9", color: "#334155" },
    body: { flex: 1, padding: 12, overflowY: "auto", background: "#f8fafc" },
    msg: (role) => ({ background: role === "assistant" ? "white" : "#e0e7ff", color: "#0f172a", padding: "8px 10px", borderRadius: 10, maxWidth: "85%", alignSelf: role === "assistant" ? "flex-start" : "flex-end", margin: "6px 0", boxShadow: "0 2px 8px rgba(0,0,0,0.08)", whiteSpace: "pre-wrap" }),
    footer: { padding: 10, display: "flex", gap: 8, alignItems: "center", background: "white", borderTop: "1px solid #e5e7eb", flexWrap: "wrap" },
    input: { flex: 1, minWidth: 160, padding: "10px 12px", borderRadius: 10, border: "1px solid #e5e7eb", outline: "none" },
    btn: { padding: "10px 12px", borderRadius: 10, border: "none", cursor: "pointer", background: "#0f1280", color: "white", fontWeight: 700 },
    chips: { display: "flex", gap: 8, flexWrap: "wrap", padding: "8px 10px", background: "white", borderTop: "1px solid #e5e7eb" },
    chip: { padding: "6px 10px", border: "1px solid #e5e7eb", borderRadius: 999, background: "white", color: "#0f172a", cursor: "pointer", fontSize: 12 }
  };

  const quickChips = [
    { k: "Features", q: "Open features" },
    { k: "How it works", q: "Go to how it works" },
    { k: "Reviews", q: "Reviews kaise du" },
    { k: "User", q: "App download aur use" },
    { k: "Driver", q: "Driver App download aur use" },
    { k: "Admin", q: "Open admin login" },
  ];

  return (
    <>
      <button style={styles.fab} aria-label={t("open_assistant", "Open assistant")} onClick={() => setOpen(v => !v)} title={t("open_assistant", "Open assistant")}>
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

          <div style={styles.statusBar}>
            {status === "querying" ? t("assistant_status_querying", "Soch raha/rahi hoon…") :
             status === "error" ? t("assistant_status_error", "Assistant abhi busy hai—tips aur navigation dikhaya ja raha hai.") :
             t("assistant_status_ready", "Assistant tayyar hai.")}
          </div>

          <div style={styles.body}>
            <div style={{ display: "flex", flexDirection: "column" }}>
              {messages.map((m, i) => (<div key={i} style={styles.msg(m.role)}>{m.text}</div>))}
            </div>
          </div>

          <div style={styles.chips}>
            {quickChips.map((c, i) => (
              <button key={i} style={styles.chip} onClick={() => handleSubmit(c.q)}>{c.k}</button>
            ))}
          </div>

          <div style={styles.footer}>
            <input
              style={styles.input}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("ask_anything", "Kuch bhi puchho…")}
              onKeyDown={(e) => { if (e.key === "Enter") handleSubmit(); }}
            />
            {SR ? (
              listening ? (
                <button style={{ ...styles.btn, background: "#dc2626" }} onClick={stopListening}>{t("stop", "Roko")} 🎙️</button>
              ) : (
                <button style={styles.btn} onClick={startListening}>{t("speak", "Bolo")} 🎤</button>
              )
            ) : (
              <button style={{ ...styles.btn, background: "#64748b" }} disabled title={t("speech_unavailable", "Speech supported nahi hai")}>🎤</button>
            )}
            <button style={styles.btn} onClick={() => handleSubmit()}>{t("send", "Send")}</button>
          </div>
        </div>
      )}
    </>
  );
}
