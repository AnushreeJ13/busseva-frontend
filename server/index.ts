// server/index.ts
import path from "node:path";
import dotenv from "dotenv";
dotenv.config({ path: path.resolve(process.cwd(), "server", ".env") });

import express from "express";
import { Pinecone } from "@pinecone-database/pinecone";
import { RecursiveUrlLoader } from "@langchain/community/document_loaders/web/recursive_url";
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";
import { GoogleGenerativeAI, TaskType } from "@google/generative-ai";

const app = express();
app.use(express.json({ limit: "2mb" }));

// Quick env guard for visibility
console.log("[ENV]", {
  GOOGLE_API_KEY: !!process.env.GOOGLE_API_KEY,
  PINECONE_API_KEY: !!process.env.PINECONE_API_KEY,
  PINECONE_INDEX: process.env.PINECONE_INDEX,
});

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY!);
const pc = new Pinecone({ apiKey: process.env.PINECONE_API_KEY! });
const INDEX_NAME = process.env.PINECONE_INDEX!;
const EMBED_MODEL = "gemini-embedding-001";
const chatModel = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

// Request logging
app.use((req, _res, next) => {
  console.log(`[REQ] ${req.method} ${req.url}`);
  next();
});

// Health
app.get("/api/health", (_req, res) => res.json({ ok: true }));

async function embedTexts(texts: string[], task: TaskType) {
  const results = await Promise.all(
    texts.map((text) =>
      genAI.embedContent({ model: EMBED_MODEL, content: text, taskType: task })
    )
  );
  return results.map((r) => r.embedding.values);
}

// Crawl to seed Pinecone
app.get("/api/crawl", async (req, res, next) => {
  try {
    const base = String(req.query.url);
    const depth = Number(req.query.depth ?? 2);
    const loader = new RecursiveUrlLoader(base, {
      maxDepth: depth,
      preventOutside: true,
      timeout: 15_000,
    });
    const docs = await loader.load();

    const splitter = new RecursiveCharacterTextSplitter({
      chunkSize: 800,
      chunkOverlap: 120,
    });
    const chunks = await splitter.splitDocuments(docs);

    const texts = chunks.map((c) => c.pageContent);
    const vectors = await embedTexts(texts, TaskType.RETRIEVAL_DOCUMENT);

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

    res.json({ ok: true, pages: docs.length, chunks: chunks.length });
  } catch (e) {
    next(e);
  }
}); // Crawling via RecursiveUrlLoader, chunking, and Pinecone upsert are standard RAG seeding steps. [web:44][web:106]

// Debug: embeddings only
app.get("/api/debug/embed", async (_req, res, next) => {
  try {
    const v = (await embedTexts(["ping"], TaskType.RETRIEVAL_QUERY))[0];
    res.json({ dim: v.length });
  } catch (e) { next(e); }
}); // Confirms Gemini key/quota and model availability quickly. [web:304][web:84]

// Debug: vector search only
app.get("/api/debug/query", async (_req, res, next) => {
  try {
    const v = (await embedTexts(["ping"], TaskType.RETRIEVAL_QUERY))[0];
    const index = pc.Index(INDEX_NAME);
    const r = await index.query({ vector: v, topK: 3, includeMetadata: true });
    res.json({ matches: r.matches?.length ?? 0 });
  } catch (e) { next(e); }
}); // Confirms Pinecone connectivity, index name, and dimension match. [web:106][web:151]

// Unified assistant handler
async function askHandler(req: express.Request, res: express.Response, next: express.NextFunction) {
  try {
    const { query, lang, topK = 8 } = (req.body ?? {}) as { query: string; lang?: string; topK?: number; };
    if (!query) return res.status(400).json({ error: "query required" });

    let qVec: number[];
    try {
      qVec = (await embedTexts([query], TaskType.RETRIEVAL_QUERY))[0];
      console.log("[EMBED] ok", qVec.length);
    } catch (e) {
      console.error("[EMBED] failed", e);
      return res.status(502).json({ error: "Embedding failed" });
    } // Gemini embedding troubleshooting path. [web:304]

    let search: any;
    try {
      const index = pc.Index(INDEX_NAME);
      search = await index.query({ vector: qVec, topK, includeMetadata: true });
      console.log("[PINECONE] ok", (search.matches ?? []).length);
    } catch (e) {
      console.error("[PINECONE] query failed", e);
      return res.status(502).json({ error: "Vector search failed" });
    } // Pinecone query fails on wrong index/dimension or connectivity. [web:106][web:151]

    const contexts = (search.matches ?? [])
      .map((m: any) => `Source: ${m.metadata?.url}\n${m.metadata?.text}`)
      .join("\n\n---\n\n")
      .slice(0, 120000);

    let text = "";
    try {
      const system = `Answer strictly from the provided context; if unknown, say so and suggest likely sections; respond in the user's language.`;
      const prompt = `Question:\n${query}\n\nContext:\n${contexts}`;
      const result = await chatModel.generateContent(system + "\n\n" + prompt);
      text = result.response.text().trim();
      console.log("[GEMINI] ok");
    } catch (e) {
      console.error("[GEMINI] generate failed", e);
      text = "Context retrieved, but generation failed; please try again shortly.";
    } // Graceful generation fallback for quota/timeouts. [web:304][web:307]

    const sources = (search.matches ?? []).slice(0, 5).map((m: any) => m.metadata?.url);
    res.json({ text, sources, lang });
  } catch (err) {
    next(err);
  }
}

// Serve both routes so the widget works without edits
app.post("/api/ask", askHandler);
app.post("/api/assistant", askHandler); // leaves current UI path intact. [web:95]

// Error middleware last
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error("[ERR]", err?.message, err?.stack);
  res.status(500).json({ ok: false, error: String(err?.message || err) });
}); // Standard Express pattern makes 500s visible and actionable. [web:291][web:295]

app.listen(process.env.PORT || 3000, () =>
  console.log("server up on " + (process.env.PORT || 3000))
);
