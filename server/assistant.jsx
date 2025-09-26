// server/assistant.js (Express + Gemini + Pinecone RAG)
import express from "express";
import { GoogleGenerativeAI, TaskType } from "@google/generative-ai";
import { Pinecone } from "@pinecone-database/pinecone";

const router = express.Router();

// Env vars required:
// GOOGLE_API_KEY, PINECONE_API_KEY, PINECONE_INDEX
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
const pc = new Pinecone({ apiKey: process.env.PINECONE_API_KEY });
const index = pc.Index(process.env.PINECONE_INDEX);

// Models
const EMBED_MODEL = "gemini-embedding-001";        // multilingual embeddings
const CHAT_MODEL = "gemini-1.5-flash";             // fast, grounded generation

// Helper: embed a single query optimized for retrieval
async function embedQuery(query) {
  const res = await genAI.embedContent({
    model: EMBED_MODEL,
    content: query,
    taskType: TaskType.RETRIEVAL_QUERY, // best for search queries
  });
  return res.embedding.values;
}

router.post("/assistant", async (req, res) => {
  try {
    const { language, query, topK = 8 } = req.body || {};
    if (!query || !query.trim()) {
      return res.status(400).json({ error: "query required" });
    }

    // 1) Embed query with Gemini (multilingual)
    const qVec = await embedQuery(query);

    // 2) Pinecone similarity search
    const search = await index.query({
      vector: qVec,
      topK,
      includeMetadata: true,
    });

    // 3) Build grounded context
    const contexts = (search.matches ?? [])
      .map(m => `Source: ${m.metadata?.url}\n${m.metadata?.text}`)
      .join("\n\n---\n\n")
      .slice(0, 120000);

    // 4) Generate answer with Gemini, mirroring user language
    const system = `Answer strictly from the provided context; if unknown, say you don't know and suggest likely sections; respond in the user's language.`;
    const prompt = `User language hint: ${language || "auto"}\n\nQuestion:\n${query}\n\nContext:\n${contexts}`;

    const model = genAI.getGenerativeModel({ model: CHAT_MODEL });
    const result = await model.generateContent(system + "\n\n" + prompt);
    const text = result.response.text().trim();

    const sources = (search.matches ?? [])
      .slice(0, 5)
      .map(m => m.metadata?.url)
      .filter(Boolean);

    // 5) Return assistant text and sources
    return res.json({ text, sources, language });
  } catch (e) {
    console.error(e);
    // Graceful fallback if retrieval/generation fails
    return res.json({
      text:
        "Couldn’t fetch site context right now. Try: 'Open features', 'Go to how it works', or ask about booking, tracking, safety, and reviews.",
      sources: [],
    });
  }
});

export default router;
