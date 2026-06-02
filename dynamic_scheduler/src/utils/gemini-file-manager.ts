import { GoogleGenAI } from '@google/genai';
import { createClient } from '@/lib/supabase/server';
import { extractTextFromDocxBuffer } from './docx-extractor';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
// Initialize the newly unified Google GenAI SDK client
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
export async function ensureGeminiFileCache(
  supabaseFilePath: string, 
  existingUri: string | null, 
  expiresAt: string | null
): Promise<{ uri: string | null; newExpiry: string | null; extractedText: string | null }> {
  const now = new Date();
  // Cache Hit Validation: Verify the URI exists and will remain valid for at least 1 hour
  if (existingUri && expiresAt) {
    const expiryDate = new Date(expiresAt);
    if (expiryDate.getTime() - now.getTime() > 3600000) {
      return { uri: existingUri, newExpiry: expiresAt, extractedText: null };
    }
  }
  // Cache Miss / Expiration: Initiate secure download from Supabase Storage
  const supabase = await createClient();
  const { data, error } = await supabase.storage
    .from('course-materials')
    .download(supabaseFilePath);
  if (error || !data) {
    throw new Error(`Failed to retrieve file from Supabase Storage: ${error?.message}`);
  }
  // Convert the retrieved Blob into a Node.js Buffer for filesystem manipulation
  const buffer = Buffer.from(await data.arrayBuffer());
  const isDocx = supabaseFilePath.endsWith('.docx');
  // DOCX Fallback Architecture
  if (isDocx) {
    const extractedText = await extractTextFromDocxBuffer(buffer);
    return { uri: null, newExpiry: null, extractedText };
  }
  // Write the Buffer to the ephemeral serverless /tmp directory
  const tempFileName = `temp_${Date.now()}_${path.basename(supabaseFilePath)}`;
  const tempFilePath = path.join(os.tmpdir(), tempFileName);
  await fs.writeFile(tempFilePath, buffer);
  try {
    const mimeType = 'application/pdf';
    // Execute the upload via the centralized ai.files object
    const uploadedFile = await ai.files.upload({
      file: tempFilePath,
      config: { mimeType }
    });
    // Calculate the new TTL constraints (exactly 47 hours from current execution)
    const newExpiryDate = new Date(now.getTime() + 47 * 60 * 60 * 1000);
    return { 
      uri: uploadedFile.uri ?? null, 
      newExpiry: newExpiryDate.toISOString(),
      extractedText: null
    };
  } finally {
    // Crucial cleanup operation to prevent ENOSPC (Error No Space Left on Device)
    await fs.unlink(tempFilePath).catch(console.error);
  }
}
