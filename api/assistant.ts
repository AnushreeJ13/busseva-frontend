// api/assistant.ts
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { GoogleGenAI } from '@google/genai';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { Pinecone } from '@pinecone-database/pinecone';

const EMBED_MODEL = 'gemini-embedding-001';
const ai = new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY! });
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY!);
const chatModel = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
const pc = new Pinecone({ apiKey: process.env.PINECONE_API_KEY! });
const index = pc.Index(process.env.PINECONE_INDEX!);

async function embed(text: string, taskType: 'RETRIEVAL_QUERY' | 'RETRIEVAL_DOCUMENT') {
  const r = await ai.models.embedContent({
    model: EMBED_MODEL,
    contents: text,
    config: { taskType }
  });
  return r.embedding.values;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  // Vercel parses JSON when Content-Type is application/json
  if (req.headers['content-type']?.includes('application/json') !== true) {
    return res.status(415).json({ error: 'Use Content-Type: application/json' });
  }

  try {
    const { query, lang, topK = 8 } = req.body ?? {};
    if (!query || typeof query !== 'string') {
      return res.status(400).json({ error: 'query required' });
    }

    // A) Embed query
    let qVec: number[];
    try {
      qVec = await embed(query, 'RETRIEVAL_QUERY');
    } catch (e: any) {
      console.error('[EMBED] failed', e?.message);
      return res.status(502).json({ error: 'Embedding failed' });
    }

    // B) Pinecone search
    let search: any;
    try {
      search = await index.query({ vector: qVec, topK, includeMetadata: true });
    } catch (e: any) {
      console.error('[PINECONE] query failed', e?.message);
      return res.status(502).json({ error: 'Vector search failed' });
    }

    const contexts = (search.matches ?? [])
      .map((m: any) => `Source: ${m.metadata?.url}\n${m.metadata?.text}`)
      .join('\n\n---\n\n')
      .slice(0, 120000);

    // C) Generate grounded answer (graceful fallback)
    let text = '';
    try {
      const system = `Answer strictly from provided context; if unknown, say so; respond in the user's language.`;
      const prompt = `Question:\n${query}\n\nContext:\n${contexts}`;
      const out = await chatModel.generateContent(system + '\n\n' + prompt);
      text = out.response.text().trim();
    } catch (e: any) {
      console.error('[GEMINI] generate failed', e?.message);
      text = 'Context retrieved, but generation failed; please try again shortly.';
    }

    const sources = (search.matches ?? []).slice(0, 5).map((m: any) => m.metadata?.url);
    return res.json({ text, sources, lang });
  } catch (e: any) {
    console.error('[ERR] handler failed', e?.message);
    return res.status(500).json({ error: String(e?.message || e) });
  }
}
