// server/index.ts
import path from "node:path";
import dotenv from "dotenv";
dotenv.config({ path: path.resolve(process.cwd(), "server", ".env") });

import express from "express";
import { Pinecone } from "@pinecone-database/pinecone";
import { RecursiveUrlLoader } from "@langchain/community/document_loaders/web/recursive_url";
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";
import { GoogleGenAI } from "@google/genai";

const app = express();
app.use(express.json({ limit: "2mb" }));

// --- Config ---
const INDEX_NAME = process.env.PINECONE_INDEX!;
const EMBED_MODEL = "gemini-embedding-001";
const GEN_MODEL = "gemini-1.5-flash";
const SITE_URL = process.env.SITE_URL || "";
const RECRAWL_MS = 6 * 60 * 60 * 1000; // 6h

// --- Logging ---
console.log("[ENV]", {
  GOOGLE_API_KEY: !!process.env.GOOGLE_API_KEY,
  PINECONE_API_KEY: !!process.env.PINECONE_API_KEY,
  PINECONE_INDEX: process.env.PINECONE_INDEX,
  SITE_URL: SITE_URL || "(not set)",
});
app.use((req, _res, next) => { console.log(`[REQ] ${req.method} ${req.url}`); next(); });

// --- Clients ---
const ai = new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY! });
const pc = new Pinecone({ apiKey: process.env.PINECONE_API_KEY! });

// --- In-memory stores ---
type Turn = { role: "user" | "model"; text: string };
const SESSIONS = new Map<string, Turn[]>();
let GUIDE_CACHE: { text: string; lang: "hi" | "en"; ts: number } | null = null;

// Helpers
function getSessionId(req: express.Request) {
  return String(req.header("x-session-id") || req.body?.sessionId || "anon");
}
function getHistory(sessionId: string) { return SESSIONS.get(sessionId) ?? []; }
function pushTurn(sessionId: string, turn: Turn) {
  const h = getHistory(sessionId);
  h.push(turn);
  SESSIONS.set(sessionId, h.slice(-12));
}
function toChatHistory(history: Turn[]) {
  return history.map(h => ({ role: h.role, parts: [{ text: h.text }] }));
}

// Health
app.get("/api/health", (_req, res) => res.json({ ok: true }));

// Embeddings helper
async function embedTexts(
  texts: string[],
  taskType: "RETRIEVAL_QUERY" | "RETRIEVAL_DOCUMENT" | "SEMANTIC_SIMILARITY" = "RETRIEVAL_DOCUMENT",
  outputDimensionality?: number
) {
  const resp = await ai.models.embedContent({
    model: EMBED_MODEL,
    contents: texts.length === 1 ? texts[0] : texts,
    config: { taskType, ...(outputDimensionality ? { outputDimensionality } : {}) },
  });
  if ((resp as any).embeddings) return (resp as any).embeddings.map((e: any) => e.values as number[]);
  return [(resp as any).embedding.values as number[]];
}

// Crawl / index (domain‑bound)
async function crawlAndIndex(base: string, depth = 2) {
  if (!base) return { ok: false, reason: "SITE_URL not set" };
  const loader = new RecursiveUrlLoader(base, { maxDepth: depth, preventOutside: true, timeout: 15_000 });
  const docs = await loader.load();
  const splitter = new RecursiveCharacterTextSplitter({ chunkSize: 800, chunkOverlap: 120 });
  const chunks = await splitter.splitDocuments(docs);

  const texts = chunks.map(c => c.pageContent);
  const vectors = await embedTexts(texts, "RETRIEVAL_DOCUMENT");
  console.log("[EMBED_DIM]", vectors[0]?.length);

  const index = pc.Index(INDEX_NAME);
  for (let i = 0; i < vectors.length; i += 50) {
    const batch = vectors.slice(i, i + 50).map((v, j) => ({
      id: `doc-${i + j}`,
      values: v,
      metadata: {
        url: chunks[i + j].metadata?.source || "",
        text: texts[i + j].slice(0, 35000),
      },
    }));
    await index.upsert({ vectors: batch });
  }
  return { ok: true, pages: docs.length, chunks: chunks.length };
}

app.get("/api/crawl", async (req, res, next) => {
  try {
    const base = String(req.query.url || SITE_URL);
    const depth = Number(req.query.depth ?? 2);
    const r = await crawlAndIndex(base, depth);
    res.json(r);
  } catch (e) { next(e); }
});

// Debug
app.get("/api/debug/embed", async (_req, res, next) => {
  try { const v = (await embedTexts(["ping"], "RETRIEVAL_QUERY"))[0]; res.json({ dim: v.length }); }
  catch (e) { next(e); }
});
app.get("/api/debug/query", async (_req, res, next) => {
  try {
    const v = (await embedTexts(["ping"], "RETRIEVAL_QUERY"))[0];
    const index = pc.Index(INDEX_NAME);
    const r = await index.query({ vector: v, topK: 3, includeMetadata: true });
    res.json({ matches: r.matches?.length ?? 0 });
  } catch (e) { next(e); }
});

// Enhanced BusSeva-specific site guide
app.get("/api/guide", async (req, res, next) => {
  try {
    const lang = (String(req.query.lang || "hi") === "hi") ? "hi" : "en";
    if (GUIDE_CACHE && Date.now() - GUIDE_CACHE.ts < 30 * 60 * 1000 && GUIDE_CACHE.lang === lang) {
      return res.json({ text: GUIDE_CACHE.text, lang });
    }

    // Multi-platform BusSeva intents covering all features across platforms
    const intents = [
      // Platform Access
      "app download","mobile app","android app","ios app","web app","website booking","download busseva app","install app","platform access",
      // Core Features
      "features","busseva features","platform features","app features","web features","service features",
      "bus booking","book bus tickets","online booking","ticket booking","seat selection","booking process",
      "live tracking","bus tracking","track my bus","real time tracking","gps tracking","location tracking",
      "payment options","pay online","payment methods","ticket payment","secure payment","payment gateway",
      "cancel booking","refund policy","cancellation charges","modify booking","reschedule ticket",
      "route information","bus routes","available buses","bus timing","schedule","timetable","route map",
      // User Management
      "user registration","account creation","login","profile management","user dashboard",
      "customer support","helpline","contact us","help center","24x7 support","customer care",
      // Driver Platform
      "driver registration","driver app","become driver","driver onboarding","driver dashboard","driver earnings",
      "driver features","driver tools","trip management","driver support","vehicle registration",
      // Safety & Security
      "safety features","emergency contact","sos","passenger safety","secure travel","safety measures",
      "reviews and ratings","feedback","rate journey","service review","quality assurance",
      // Platform Comparison
      "android vs ios","mobile vs web","platform comparison","cross platform","multi device access"
    ];
    
    const index = pc.Index(INDEX_NAME);
    const qVecs = await embedTexts(intents, "RETRIEVAL_QUERY");
    const matches = await Promise.all(qVecs.map(v => index.query({ vector: v, topK: 4, includeMetadata: true })));
    const contexts = matches
      .flatMap(r => (r.matches ?? []).map(m => `Source: ${m.metadata?.url}\n${m.metadata?.text}`))
      .join("\n\n---\n\n")
      .slice(0, 100000);

    const systemInstruction =
      "Create a comprehensive multi-platform BusSeva guide for Indian users covering: 1) Platform access (Android app, iOS app, Web platform), 2) Complete feature comparison across platforms, 3) Step-by-step processes for booking/tracking/payments on each platform, 4) Driver features across platforms, 5) Safety and support options, 6) Platform-specific advantages. Include specific UI elements, button names, and navigation paths for each platform. Do not invent URLs.";

    const prompt = (lang === "hi")
      ? "BusSeva के लिए एक complete multi-platform गाइड बनाएं जिसमें शामिल हो: 1) सभी platforms की access (Android App, iOS App, Website), 2) हर platform के features और फायदे, 3) Booking/Tracking/Payment के steps हर platform पर, 4) Driver features सभी platforms पर, 5) Safety और Support options, 6) Platform-specific UI elements और navigation। सरल भाषा में, बिना नए लिंक बनाए।"
      : "Create a comprehensive multi-platform BusSeva guide covering: 1) Platform access methods (Android App, iOS App, Website), 2) Feature comparison across all platforms, 3) Step-by-step processes on each platform, 4) Driver features across platforms, 5) Safety and support options, 6) Platform-specific UI and navigation. Use simple language, no fabricated links.";

    const chat = await ai.chats.create({ model: GEN_MODEL, history: [], systemInstruction });
    let text = "";
    if (contexts.trim().length === 0) {
      // Enhanced multi-platform fallback template for BusSeva
      text = (lang === "hi")
        ? [
            "🚌 **BusSeva - सभी Platforms पर उपलब्ध**",
            "",
            "📱 **ANDROID APP**",
            "• Google Play Store से 'BusSeva' डाउनलोड करें",
            "• Features: Push notifications, Offline ticket access, GPS tracking, Quick booking",
            "• Navigation: Bottom tabs → Home, Search, Bookings, Profile",
            "• Booking: Home → 'Book Bus' → Route selection → Seat map → Payment",
            "",
            "🍎 **iOS APP**", 
            "• App Store से 'BusSeva' install करें",
            "• Features: Face ID/Touch ID login, Apple Pay, Siri shortcuts",
            "• Interface: Tab bar navigation, Swipe gestures",
            "• Tracking: 'My Trips' → Select journey → 'Track Live'",
            "",
            "💻 **WEB PLATFORM (busseva.vercel.app)**",
            "• Browser में direct access",
            "• Features: Large screen booking, Print tickets, Bulk booking",
            "• Navigation: Top menu → Home, Routes, Book Now, Track, Support",
            "• Advantages: No download needed, Full keyboard support",
            "",
            "🎯 **PLATFORM COMPARISON**",
            "📱 Mobile Apps: Best for quick booking, live notifications, GPS tracking",
            "💻 Web: Perfect for detailed planning, group bookings, office use",
            "",
            "🚗 **DRIVER PLATFORM**",
            "📱 Driver Mobile App:",
            "• Trip management, Route optimization, Earnings tracker",
            "• Real-time passenger updates, Navigation assistance",
            "💻 Driver Web Dashboard:",
            "• Detailed analytics, Document management, Schedule planning",
            "",
            "🛡️ **SAFETY FEATURES (All Platforms)**",
            "• SOS button with location sharing",
            "• Emergency contact integration", 
            "• Live trip sharing with family",
            "• 24/7 support chat/call",
            "",
            "💡 **PLATFORM-SPECIFIC TIPS**",
            "📱 Mobile: Enable notifications for updates",
            "💻 Web: Bookmark for quick access",
            "🔄 Sync: Same account works across all platforms"
          ].join("\n")
        : [
            "🚌 **BusSeva - Available Across All Platforms**",
            "",
            "📱 **ANDROID APP**",
            "• Download 'BusSeva' from Google Play Store",
            "• Features: Push notifications, Offline tickets, GPS tracking, Quick booking",
            "• Navigation: Bottom tabs → Home, Search, Bookings, Profile", 
            "• Booking Flow: Home → 'Book Bus' → Select route → Choose seat → Pay",
            "",
            "🍎 **iOS APP**",
            "• Install 'BusSeva' from App Store", 
            "• Features: Face ID/Touch ID, Apple Pay, Siri shortcuts",
            "• Interface: Tab bar navigation, Swipe gestures",
            "• Live Tracking: 'My Trips' → Select journey → 'Track Live'",
            "",
            "💻 **WEB PLATFORM (busseva.vercel.app)**",
            "• Direct browser access", 
            "• Features: Large screen view, Print tickets, Bulk booking",
            "• Navigation: Top menu → Home, Routes, Book Now, Track, Support",
            "• Advantages: No download required, Full keyboard support",
            "",
            "🎯 **PLATFORM COMPARISON**",
            "📱 Mobile Apps: Best for quick booking, live notifications, GPS",
            "💻 Web: Perfect for planning, group bookings, office use",
            "",
            "🚗 **DRIVER PLATFORM**", 
            "📱 Driver Mobile App:",
            "• Trip management, Route optimization, Earnings tracking",
            "• Real-time passenger communication, GPS navigation",
            "💻 Driver Web Dashboard:",
            "• Analytics, Document management, Schedule planning",
            "",
            "🛡️ **SAFETY FEATURES (All Platforms)**",
            "• SOS button with location sharing",
            "• Emergency contacts integration",
            "• Live trip sharing with family", 
            "• 24/7 support chat/call",
            "",
            "💡 **PLATFORM-SPECIFIC TIPS**",
            "📱 Mobile: Enable push notifications",
            "💻 Web: Bookmark for quick access", 
            "🔄 Sync: Same account across all platforms"
          ].join("\n");
    } else {
      const result = await chat.sendMessage(`Instruction:\n${prompt}\n\nContext:\n${contexts}`);
      text = result.response.text();
    }

    GUIDE_CACHE = { text, lang, ts: Date.now() };
    res.json({ text, lang });
  } catch (e) { next(e); }
});

// Enhanced Assistant (RAG Q&A) with BusSeva focus
async function askHandler(req: express.Request, res: express.Response, next: express.NextFunction) {
  try {
    const { query, lang, topK = 8 } = (req.body ?? {}) as { query: string; lang?: string; topK?: number; };
    if (!query) return res.status(400).json({ error: "query required" });

    const sessionId = getSessionId(req);
    const normalized = query.toLowerCase().trim();

    // Explicit guide
    if (normalized === "site_guide") {
      const guideLang = lang === "hi" ? "hi" : "en";
      const resp = await fetch(`${req.protocol}://${req.get("host")}/api/guide?lang=${guideLang}`).then(r => r.json());
      pushTurn(sessionId, { role: "user", text: query });
      pushTurn(sessionId, { role: "model", text: resp.text });
      return res.json({ text: resp.text, sources: [], lang: guideLang, sessionId });
    }

    // Enhanced greeting with multi-platform options
    const isPureGreeting = /^(hi+|hello+|hey+|namaste|नमस्ते|हेलो)$/.test(normalized);
    if (isPureGreeting) {
      const isHindi = /namaste|नमस्ते|हेलो/.test(normalized);
      const generalResponse = isHindi
        ? "नमस्कार! BusSeva में आपका स्वागत है! 🚌\n\n📱 **सभी Platforms पर Available:**\n✅ Android App (Play Store)\n✅ iOS App (App Store)\n✅ Web Platform (Browser)\n\n🎯 **Quick Actions:**\n• 'Platform कैसे choose करें?'\n• 'Features क्या हैं?'\n• 'Booking कैसे करें?'\n• 'Tracking कैसे करें?'"
        : "Hello! Welcome to BusSeva! 🚌\n\n📱 **Available on All Platforms:**\n✅ Android App (Play Store)\n✅ iOS App (App Store) \n✅ Web Platform (Browser)\n\n🎯 **Quick Questions:**\n• 'How to choose platform?'\n• 'What are the features?'\n• 'How to book tickets?'\n• 'How to track buses?'";
      pushTurn(sessionId, { role: "user", text: query });
      pushTurn(sessionId, { role: "model", text: generalResponse });
      return res.json({ text: generalResponse, sources: [], lang: isHindi ? "hi" : "en", sessionId });
    }

    // Multi-platform and feature-specific responses
    const isPlatformQuery = /\b(app|एप|ऐप|web|website|platform|प्लेटफॉर्म|android|ios|iphone|browser|download|डाउनलोड|install|इंस्टॉल|mobile|मोबाइल|features|फीचर्स)\b/.test(normalized);
    if (isPlatformQuery && contexts.trim().length === 0) {
      const isHindi = lang === "hi" || /hindi|हिंदी/.test(normalized);
      const platformResponse = isHindi
        ? "🎯 **BusSeva - Platform Selection Guide:**\n\n📱 **MOBILE APPS (Recommended)**\n🟢 **Android App:**\n• Play Store → 'BusSeva' search → Install\n• Best for: Quick booking, Push notifications, GPS tracking\n• Features: Offline tickets, Fingerprint login, Voice search\n\n🔵 **iOS App:**\n• App Store → 'BusSeva' search → Get\n• Best for: Apple Pay, Face ID, Siri integration\n• Features: Widget support, Apple Wallet tickets\n\n💻 **WEB PLATFORM**\n• Browser में busseva.vercel.app पर जाएं\n• Best for: Desktop booking, Group reservations, Printing\n• Features: Large screen view, Multiple bookings, Easy sharing\n\n🎯 **CHOOSE YOUR PLATFORM:**\n📱 Mobile = Daily travel, Quick access\n💻 Web = Planning, Office booking, Groups\n\n✨ **Pro Tip:** Same account works on all platforms!"
        : "🎯 **BusSeva - Platform Selection Guide:**\n\n📱 **MOBILE APPS (Recommended)**\n🟢 **Android App:**\n• Play Store → Search 'BusSeva' → Install\n• Best for: Quick booking, Push notifications, GPS tracking\n• Features: Offline tickets, Fingerprint login, Voice commands\n\n🔵 **iOS App:**\n• App Store → Search 'BusSeva' → Get\n• Best for: Apple Pay, Face ID, Siri shortcuts\n• Features: Widget support, Apple Wallet integration\n\n💻 **WEB PLATFORM**\n• Visit busseva.vercel.app in browser\n• Best for: Desktop booking, Group reservations, Printing\n• Features: Large screen interface, Bulk booking, Easy sharing\n\n🎯 **CHOOSE YOUR PLATFORM:**\n📱 Mobile = Daily travel, On-the-go booking\n💻 Web = Planning ahead, Office use, Groups\n\n✨ **Pro Tip:** Your account syncs across all platforms!";
      
      pushTurn(sessionId, { role: "user", text: query });
      pushTurn(sessionId, { role: "model", text: platformResponse });
      return res.json({ text: platformResponse, sources: [], lang: isHindi ? "hi" : "en", sessionId });
    }

    // A) Embed query
    let qVec: number[];
    try { qVec = (await embedTexts([query], "RETRIEVAL_QUERY"))[0]; }
    catch (e) { console.error("[EMBED] failed", e); return res.status(502).json({ error: "Embedding failed" }); }

    // B) Vector search
    let search: any;
    try {
      const index = pc.Index(INDEX_NAME);
      search = await index.query({ vector: qVec, topK, includeMetadata: true });
    } catch (e) { console.error("[PINECONE] failed", e); return res.status(502).json({ error: "Vector search failed" }); }

    const contexts = (search.matches ?? [])
      .map((m: any) => `Source: ${m.metadata?.url}\n${m.metadata?.text}`)
      .join("\n\n---\n\n")
      .slice(0, 120000);

    const sources = (search.matches ?? []).slice(0, 5).map((m: any) => m.metadata?.url);

    // C) Grounded answer with BusSeva context
    let text = "";
    if (contexts.trim().length === 0) {
      const isHindi = lang === "hi" || /hindi|हिंदी/.test(normalized);
      text = isHindi
        ? " BusSeva से जुड़े सवाल जैसे:\n• App कैसे डाउनलोड करें?\n• Bus booking कैसे करें?\n• Live tracking कैसे करें?\n• Payment के तरीके क्या हैं?\n• Driver registration कैसे करें?"
        : "BusSeva-related questions like:\n• How to download the app?\n• How to book bus tickets?\n• How to use live tracking?\n• What payment methods are available?\n• How to register as driver?";
    } else {
      try {
        const chat = await ai.chats.create({
          model: GEN_MODEL,
          history: toChatHistory(getHistory(sessionId)),
          systemInstruction: "You are BusSeva multi-platform assistant. Always provide platform-specific guidance (Android app, iOS app, Web). Mention UI elements, navigation paths, and platform advantages. For booking/tracking/payments, give step-by-step instructions for each platform. Prioritize user's preferred platform but mention alternatives. Be concise, practical, and helpful for Indian travelers.",
        });
        const result = await chat.sendMessage(`Question:\n${query}\n\nBusSeva Context:\n${contexts}`);
        text = result.response.text();
      } catch (e) {
        console.error("[GEMINI] generate failed", e);
        text = "Context retrieved, but generation failed; please try again shortly.";
      }
    }

    pushTurn(sessionId, { role: "user", text: query });
    pushTurn(sessionId, { role: "model", text });
    res.json({ text, sources, lang, sessionId });
  } catch (err) { next(err); }
}

app.post("/api/ask", askHandler);
app.post("/api/assistant", askHandler);

// Errors
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error("[ERR]", err?.message, err?.stack);
  res.status(500).json({ ok: false, error: String(err?.message || err) });
});

// Boot: auto-crawl + periodic refresh
app.listen(process.env.PORT || 3000, async () => {
  console.log("🚌 BusSeva server up on " + (process.env.PORT || 3000));
  try {
    if (SITE_URL) {
      console.log("[BOOT] Crawling", SITE_URL);
      await crawlAndIndex(SITE_URL, 2);
      setInterval(() => crawlAndIndex(SITE_URL, 2).catch(console.error), RECRAWL_MS);
    }
  } catch (e) { console.error("[BOOT] Crawl failed", e); }
});