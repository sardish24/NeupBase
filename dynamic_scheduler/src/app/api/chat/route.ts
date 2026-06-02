import { NextRequest } from 'next/server';
import { streamText } from 'ai';
import { google } from '@ai-sdk/google';
import { createClient } from '@/lib/supabase/server';
import { ensureGeminiFileCache } from '@/utils/gemini-file-manager';
export const maxDuration = 60; 
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  // 1. Authenticate Request via Supabase SSR
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return new Response(JSON.stringify({ error: 'Unauthorized access.' }), { status: 401 });
  }
  try {
    const body = await req.json();
    const { 
      subtopic_label, 
      subtopic_node_id, 
      messages: userMessages = [], 
      session_id 
    } = body;
    // 2. State Initialization and Database Query
    let currentSessionId = session_id;
    let geminiFileUri = null;
    let fileExpiresAt = null;
    if (currentSessionId) {
      // Retrieve the existing session metadata to check cache validity
      const { data: session } = await supabase
        .from('chat_sessions')
        .select('gemini_file_uri, file_uri_expires_at, messages')
        .eq('session_id', currentSessionId)
        .single();
      if (session) {
        geminiFileUri = session.gemini_file_uri;
        fileExpiresAt = session.file_uri_expires_at;
      }
    }
    // Resolve the internal Supabase Storage path mapped to the knowledge tree node
    const resourceFilePath = `${subtopic_node_id}/material.pdf`; // Simplified mapping logic
    // 3. Document Ingestion Pipeline
    const { uri: activeUri, newExpiry, extractedText } = await ensureGeminiFileCache(
      resourceFilePath, 
      geminiFileUri, 
      fileExpiresAt
    );
    // 4. Session Upsertion Logic
    // If a new file was uploaded to Gemini, or this is a brand new conversation, persist the state
    if (activeUri !== geminiFileUri || !currentSessionId) {
      const { data: upsertedSession, error: upsertError } = await supabase
        .from('chat_sessions')
        .upsert({
          ...(currentSessionId ? { session_id: currentSessionId } : {}),
          user_id: user.id,
          subtopic_node_id,
          gemini_file_uri: activeUri,
          file_uri_expires_at: newExpiry
        })
        .select('session_id')
        .single();
      if (upsertError) throw upsertError;
      currentSessionId = upsertedSession.session_id;
    }
    // 5. Prompt Engineering and Payload Construction
    let systemPrompt = `You are an expert academic tutor. The user is currently studying the subtopic: "${subtopic_label}".
Your goal is to answer the student's questions strictly based on the provided course material.
Maintain a pedagogical, encouraging, and highly technical tone. Do not hallucinate or invent information outside the bounds of the provided document. `;
    // Inject raw text if the fallback DOCX pipeline was triggered
    if (extractedText) {
      systemPrompt += `\n\nHere is the raw text of the course material for your reference:\n\n${extractedText}`;
    } else {
      systemPrompt += `\nYou have been provided with the official course material document as an attached file.`;
    }
    // Transform messages to explicitly map the Gemini File URI into the Vercel AI SDK format
    const aiSdkMessages = userMessages.map((msg: any) => {
      // Only attach the file to the absolute latest message to prevent redundant multi-attachments
      if (msg.role === 'user' && msg === userMessages[userMessages.length - 1] && activeUri) {
        return {
          role: 'user',
          content: [
            { type: 'text', text: msg.content },
            { type: 'file', data: activeUri, mimeType: 'application/pdf' }
          ]
        };
      }
      return { role: msg.role, content: msg.content };
    });
    // 6. Model Invocation and Streaming Orchestration
    const result = streamText({
      model: google('gemini-1.5-pro'),
      system: systemPrompt,
      messages: aiSdkMessages,
      async onFinish({ text, usage }) {
        // Background Lifecycle Hook: Asynchronously update the database with the completed turn
        const finalMessages = [
          ...userMessages,
          { role: 'assistant', content: text, id: crypto.randomUUID(), annotations: [{ totalTokens: usage.totalTokens }] }
        ];
        await supabase
          .from('chat_sessions')
          .update({ messages: finalMessages })
          .eq('session_id', currentSessionId);
      }
    });
    // 7. Response formatting via Vercel AI SDK
    return result.toTextStreamResponse({
      headers: {
        'x-session-id': currentSessionId
      }
    });
  } catch (error: any) {
    console.error('Chat API Error:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Internal Server Error' }), 
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
