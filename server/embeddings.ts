// server/embeddings.ts
import { GoogleGenerativeAI, TaskType } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY!);
const EMBED_MODEL = "gemini-embedding-001";

export async function embedTexts(texts: string[], task: TaskType) {
  const results = await Promise.all(
    texts.map(text =>
      genAI.embedContent({ model: EMBED_MODEL, content: text, taskType: task })
    )
  );
  // returns number[] for Pinecone
  return results.map(r => r.embedding.values);
}
