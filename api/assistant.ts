// api/assistant.ts
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { GoogleGenAI } from '@google/genai';      // embeddings
import { GoogleGenerativeAI } from '@google/generative-ai'; // generation
import { Pinecone } from '@pinecone-database/pinecone';

const EMBED_MODEL = 'gemini-embedding-001';
const ai = new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY! });
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY!);
const chatModel = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
const pc = new Pinecone({ apiKey: process.env.PINECONE_API_KEY! });
const index = pc.Index(process.env.PINECONE_INDEX!);

async function embed(text: string, taskType: 'RETRIEVAL_QUERY' | 'RETRIEVAL_DOCUMENT') {
  const r = await ai.models.embedContent({ model: EMBED_MODEL, contents: text, config: { taskType } });
  return r.embedding.values;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });
  try {
    const { query, lang, topK = 8 } = req.body ?? {};
    if (!query) return res.status(400).json({ error: 'query required' });

    const qVec = await embed(query, 'RETRIEVAL_QUERY');
    const search = await index.query({ vector: qVec, topK, includeMetadata: true });

    const contexts = (search.matches ?? [])
      .map((m: any) => `Source: ${m.metadata?.url}\n${m.metadata?.text}`)
      .join('\n\n---\n\n')
      .slice(0, 120000);

    const system = `Answer strictly from provided context; if unknown, say so; respond in user's language.`;
    const prompt = `Question:\n${query}\n\nContext:\n${contexts}`;
    let text = '';
    try {
      const out = await chatModel.generateContent(system + '\n\n' + prompt);
      text = out.response.text().trim();
    } catch {
      text = 'Context retrieved, but generation failed; please try again shortly.';
    }
    const sources = (search.matches ?? []).slice(0, 5).map((m: any) => m.metadata?.url);
    return res.json({ text, sources, lang });
  } catch (e: any) {
    return res.status(500).json({ error: String(e?.message || e) });
  }
}
