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

// Dynamic Tier‑2 “site guide”
app.get("/api/guide", async (req, res, next) => {
  try {
    const lang = (String(req.query.lang || "hi") === "hi") ? "hi" : "en";
    if (GUIDE_CACHE && Date.now() - GUIDE_CACHE.ts < 30 * 60 * 1000 && GUIDE_CACHE.lang === lang) {
      return res.json({ text: GUIDE_CACHE.text, lang });
    }

    // Expanded intents (includes App + Driver)
    const intents = [
      "features","how it works","booking","tracking","payments","safety","reviews","helpline","admin login",
      "app","mobile app","android app","ios app","download app","driver","driver onboarding","driver app","driver documents","driver shifts","driver sos"
    ];
    const index = pc.Index(INDEX_NAME);
    const qVecs = await embedTexts(intents, "RETRIEVAL_QUERY");
    const matches = await Promise.all(qVecs.map(v => index.query({ vector: v, topK: 4, includeMetadata: true })));
    const contexts = matches
      .flatMap(r => (r.matches ?? []).map(m => `Source: ${m.metadata?.url}\n${m.metadata?.text}`))
      .join("\n\n---\n\n")
      .slice(0, 100000);

    const systemInstruction =
      "Create a short, friendly onboarding guide for Tier‑2 Indian city users in the requested language, using only the provided context; keep language simple; include steps for features, how it works, booking, tracking, payments, reviews, safety, admin login, App (Android/iOS) quick usage, and Driver (onboarding, documents, shifts, SOS); include where to tap/click; do not invent URLs; return concise bullets.";

    const prompt = (lang === "hi")
      ? "कॉन्टेक्स्ट देखकर ‘Features’, ‘How it works’, ‘Booking’, ‘Tracking’, ‘Payments’, ‘Reviews’, ‘Safety’, ‘Admin login’, ‘App (Android/iOS)’, और ‘Driver (onboarding/documents/shifts/SOS)’ का छोटा, सरल गाइड दें—सीधे स्टेप्स में, बिना नए लिंक बनाए।"
      : "From the context, produce a concise guide for ‘Features’, ‘How it works’, ‘Booking’, ‘Tracking’, ‘Payments’, ‘Reviews’, ‘Safety’, ‘Admin login’, ‘App (Android/iOS)’, and ‘Driver (onboarding/documents/shifts/SOS)’—step‑by‑step, no fabricated links.";

    const chat = await ai.chats.create({ model: GEN_MODEL, history: [], systemInstruction });
    let text = "";
    if (contexts.trim().length === 0) {
      // Fallback template if site has not been crawled yet
      text = (lang === "hi")
        ? [
            "• होम: ऊपर मेन्यू से ‘Features’, ‘How it works’, ‘Booking’, ‘Tracking’, ‘App’, ‘Driver’, ‘Admin’ खोलें।",
            "• बुकिंग: रूट/तारीख चुनें → यात्री विवरण → पेमेंट → कन्फर्मेशन।",
            "• ट्रैकिंग: ‘Tracking’ में PNR/बुकिंग ID से लाइव स्टेटस देखें।",
            "• पेमेंट: कार्ड/UPI/नेट बैंकिंग दिखे तो चुनें; SMS/ईमेल पर रिसीट आती है।",
            "• रिव्यू/सेफ्टी: रेटिंग दें, SOS/शिकायत दर्ज करें।",
            "• ऐप: ‘App’ में एंड्रॉइड/iOS डाउनलोड, लॉगिन, और क्विक-यूज़ स्टेप्स देखें।",
            "• ड्राइवर: ‘Driver’ में ऑनबोर्डिंग, ज़रूरी डॉक्यूमेंट्स, शिफ्ट मैनेजमेंट, SOS रिपोर्टिंग।",
            "• एडमिन: ‘Admin login’ से स्टाफ/मैनेजर साइन-इन करें।"
          ].join("\n")
        : [
            "• Home: Use top menu for ‘Features’, ‘How it works’, ‘Booking’, ‘Tracking’, ‘App’, ‘Driver’, ‘Admin’.",
            "• Booking: Choose route/date → passenger details → pay → confirmation.",
            "• Tracking: Use PNR/booking ID for live status.",
            "• Payments: Card/UPI/net banking as available; receipt via SMS/email.",
            "• Reviews/Safety: Give ratings, use SOS/report issue.",
            "• App: In ‘App’, find Android/iOS download, login, and quick usage.",
            "• Driver: In ‘Driver’, see onboarding, required documents, shift management, SOS reporting.",
            "• Admin: Staff/managers sign in via ‘Admin login’."
          ].join("\n");
    } else {
      const result = await chat.sendMessage(`Instruction:\n${prompt}\n\nContext:\n${contexts}`);
      text = result.response.text();
    }

    GUIDE_CACHE = { text, lang, ts: Date.now() };
    res.json({ text, lang });
  } catch (e) { next(e); }
});

// Assistant (RAG Q&A)
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

    // Minimal greeting
    const isPureGreeting = /^(hi+|hello+|hey+|namaste|नमस्ते|हेलो)$/.test(normalized);
    if (isPureGreeting) {
      const isHindi = /namaste|नमस्ते|हेलो/.test(normalized);
      const generalResponse = isHindi
        ? "नमस्कार! जल्दी शुरू करें: ‘Features’, ‘How it works’, ‘Booking’, ‘Tracking’, ‘App’, ‘Driver’, ‘Reviews’, ‘Safety’."
        : "Hello! Quick picks: ‘Features’, ‘How it works’, ‘Booking’, ‘Tracking’, ‘App’, ‘Driver’, ‘Reviews’, ‘Safety’.";
      pushTurn(sessionId, { role: "user", text: query });
      pushTurn(sessionId, { role: "model", text: generalResponse });
      return res.json({ text: generalResponse, sources: [], lang: isHindi ? "hi" : "en", sessionId });
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

    // C) Grounded answer
    let text = "";
    if (contexts.trim().length === 0) {
      text = (lang === "hi")
        ? "माफ़ करें, इस सवाल के लिए साइट कॉन्टेक्स्ट नहीं मिला; कृपया साइट से जुड़े और खास शब्दों के साथ पूछें (जैसे App, Driver, Booking, Tracking)।"
        : "Sorry, no site context found; try a more specific site-related question (e.g., App, Driver, Booking, Tracking).";
    } else {
      try {
        const chat = await ai.chats.create({
          model: GEN_MODEL,
          history: toChatHistory(getHistory(sessionId)),
          systemInstruction: "Answer strictly from the provided context; if unknown, say so; respond in the user's language; be concise and step‑wise for Tier‑2 users.",
        });
        const result = await chat.sendMessage(`Question:\n${query}\n\nContext:\n${contexts}`);
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
  console.log("server up on " + (process.env.PORT || 3000));
  try {
    if (SITE_URL) {
      console.log("[BOOT] Crawling", SITE_URL);
      await crawlAndIndex(SITE_URL, 2);
      setInterval(() => crawlAndIndex(SITE_URL, 2).catch(console.error), RECRAWL_MS);
    }
  } catch (e) { console.error("[BOOT] Crawl failed", e); }
});
