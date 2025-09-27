// api/assistant.ts
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { GoogleGenAI } from '@google/genai';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { Pinecone } from '@pinecone-database/pinecone';

// Keep functions as CJS if root has "type": "module":
// Add api/package.json with: { "type": "commonjs" } on Vercel to avoid ESM/CJS mismatch. [Docs]

const EMBED_MODEL = 'gemini-embedding-001';
const ai = new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY! });
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY!);
const chatModel = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

const pc = new Pinecone({ apiKey: process.env.PINECONE_API_KEY! });
const index = pc.Index(process.env.PINECONE_INDEX!);

// Embedding helper (current JS response shape)
async function embedOne(
  text: string,
  taskType: 'RETRIEVAL_QUERY' | 'RETRIEVAL_DOCUMENT'
): Promise<number[]> {
  const r = await ai.models.embedContent({
    model: EMBED_MODEL,
    contents: text,
    config: { taskType }
  });
  const vec = r.embeddings[0]?.values;
  if (!Array.isArray(vec)) throw new Error('embedding.values missing');
  return vec;
}

// Exponential backoff for transient Gemini errors (429/5xx/timeouts)
async function genWithRetry(system: string, prompt: string, maxRetries = 4) {
  const base = 400;
  let lastErr: any = null;
  for (let i = 0; i <= maxRetries; i++) {
    try {
      const out = await chatModel.generateContent(system + '\n\n' + prompt);
      return out.response.text().trim();
    } catch (e: any) {
      lastErr = e;
      const msg = String(e?.message || e);
      const retryable =
        /429|RESOURCE_EXHAUSTED|UNAVAILABLE|DEADLINE|INTERNAL|ECONNRESET|ETIMEDOUT/i.test(msg);
      if (!retryable || i === maxRetries) break;
      const jitter = Math.floor(Math.random() * 200);
      const delay = Math.min(2000, base * 2 ** i) + jitter;
      await new Promise(r => setTimeout(r, delay));
    }
  }
  throw lastErr;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });
  if (!req.headers['content-type']?.includes('application/json')) {
    return res.status(415).json({ error: 'Use Content-Type: application/json' });
  }

  try {
    const { query, lang, topK = 8 } = req.body ?? {};
    if (!query || typeof query !== 'string') return res.status(400).json({ error: 'query required' });

    // A) Embed query
    let qVec: number[];
    try {
      qVec = await embedOne(query, 'RETRIEVAL_QUERY'); // current response shape [web:75][web:87]
      console.log('[EMBED] ok', qVec.length);
    } catch (e: any) {
      console.error('[EMBED] failed', e?.message);
      return res.status(502).json({ error: 'Embedding failed' });
    }

    // B) Pinecone search
    let search: any;
    try {
      search = await index.query({ vector: qVec, topK, includeMetadata: true });
      console.log('[PINECONE] ok', (search.matches ?? []).length);
    } catch (e: any) {
      console.error('[PINECONE] query failed', e?.message);
      return res.status(502).json({ error: 'Vector search failed' });
    }

    const raw = (search.matches ?? [])
      .map((m: any) => `Source: ${m.metadata?.url}\n${m.metadata?.text}`)
      .join('\n\n---\n\n');

    // Trim context to reduce Gemini errors on large payloads
    const contexts = raw.slice(0, 60_000); // ~60KB cap [web:304]

    // C) Generation with retries
    let text = '';
    try {
      const system = `Answer strictly from provided context; if unknown, say so; respond in the user's language.`;
      const prompt = `Question:\n${query}\n\nContext:\n${contexts}`;
      text = await genWithRetry(system, prompt); // retry/backoff for 429/5xx [web:304][web:521]
      console.log('[GEMINI] ok');
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
