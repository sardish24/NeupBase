'use client';
import React, { useState, useEffect, useRef } from 'react';
// @ts-expect-error - missing types
import { useChat } from 'ai/react';
import { createClient } from '@/lib/supabase/client';
interface StudyChatUIProps {
  subtopicLabel: string;
  subtopicNodeId: string;
}
interface ChatSessionInfo {
  session_id: string;
  created_at: string;
}
export default function StudyChatUI({ subtopicLabel, subtopicNodeId }: StudyChatUIProps) {
  // Application State Definition
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [pastSessions, setPastSessions] = useState<ChatSessionInfo[]>([]);
  const [isViewingPast, setIsViewingPast] = useState<boolean>(false);
  const supabase = createClient();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  // Vercel AI SDK Core Integration
  const { messages, input, handleInputChange, handleSubmit, isLoading, setMessages } = useChat({
    api: '/api/chat',
    body: {
      subtopic_label: subtopicLabel,
      subtopic_node_id: subtopicNodeId,
      session_id: currentSessionId, // Note: Bound tightly to React state
    },
    onResponse: (response: Response) => {
      // Header Capture Mechanism: Locks the client to the newly minted database row
      const serverSessionId = response.headers.get('x-session-id');
      if (serverSessionId && serverSessionId !== currentSessionId) {
        setCurrentSessionId(serverSessionId);
      }
    },
    onError: (error: Error) => {
      console.error('Streaming failure detected in transport layer:', error);
    }
  });
  // Automated layout shift stabilization
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);
  // Database Query: Retrieve historical metadata for the specific subtopic node
  const fetchPastSessions = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase
      .from('chat_sessions')
      .select('session_id, created_at')
      .eq('subtopic_node_id', subtopicNodeId)
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });
    if (data) setPastSessions(data as any);
    setIsViewingPast(true);
  };
  // Database Query: Rehydrate the useChat state with a historical JSONB message array
  const loadPastSession = async (sessionId: string) => {
    const { data } = await supabase
      .from('chat_sessions')
      .select('messages')
      .eq('session_id', sessionId)
      .single();
    if (data) {
      setMessages(data.messages || []);
      setCurrentSessionId(sessionId);
      setIsViewingPast(false);
    }
  };
  // State Reset Mechanism
  const startNewConversation = () => {
    setCurrentSessionId(null);
    setMessages([]);
    setIsViewingPast(false);
  };
  return (
    <div className="flex flex-col h-[700px] w-full max-w-3xl border rounded-xl shadow-lg bg-white overflow-hidden font-sans">
      {/* Header and Control Panel */}
      <div className="flex justify-between items-center p-4 bg-slate-50 border-b">
        <h3 className="font-semibold text-lg text-slate-800">{subtopicLabel} Tutor</h3>
        <div className="flex gap-2">
          <button 
            onClick={startNewConversation}
            className="text-sm px-4 py-2 bg-blue-600 text-white rounded shadow-sm hover:bg-blue-700 transition font-medium"
          >
            New Conversation
          </button>
          <button 
            onClick={isViewingPast ? () => setIsViewingPast(false) : fetchPastSessions}
            className="text-sm px-4 py-2 border border-slate-300 bg-white text-slate-700 rounded shadow-sm hover:bg-slate-50 transition font-medium"
          >
            {isViewingPast ? 'Back to Active Chat' : 'View Past Conversations'}
          </button>
        </div>
      </div>
      {/* Main Content Area Toggle Logic */}
      {isViewingPast ? (
        <div className="flex-1 overflow-y-auto p-6 bg-slate-50">
          <h4 className="text-md font-semibold mb-4 text-slate-700 border-b pb-2">Historical Study Sessions</h4>
          {pastSessions.length === 0 ? (
            <div className="flex h-40 items-center justify-center text-sm text-slate-500 italic">
              No historical transcripts found for this specific subtopic.
            </div>
          ) : (
            <ul className="space-y-3">
              {pastSessions.map((session) => (
                <li key={session.session_id}>
                  <button 
                    onClick={() => loadPastSession(session.session_id)}
                    className="w-full text-left p-4 bg-white border border-slate-200 rounded shadow-sm hover:border-blue-400 transition"
                  >
                    <span className="text-sm font-medium text-slate-800">
                      Session Date: {new Date(session.created_at).toLocaleString(undefined, {
                        dateStyle: 'medium', timeStyle: 'short'
                      })}
                    </span>
                    <p className="text-xs text-slate-500 mt-1">ID: {session.session_id.split('-')[0]}...</p>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <>
          {/* Active Conversational Thread View */}
          <div className="flex-1 overflow-y-auto p-4 space-y-6 bg-slate-50">
            {messages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-slate-400 italic text-sm space-y-2">
                <svg className="w-12 h-12 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                </svg>
                <p>Submit a question regarding the material. The tutor is analyzing the document...</p>
              </div>
            ) : (
              messages.map((m: any) => (
                <div key={m.id} className={`flex flex-col ${m.role === 'user' ? 'items-end' : 'items-start'}`}>
                  <div className={`max-w-[85%] p-4 rounded-2xl ${
                    m.role === 'user' ? 'bg-blue-600 text-white rounded-br-none shadow-md' : 'bg-white border border-slate-200 shadow-sm rounded-bl-none text-slate-800'
                  }`}>
                    {/* Native rendering of raw text streams. In a production environment, this would be wrapped in react-markdown to parse code blocks and lists natively. */}
                    <span className="whitespace-pre-wrap text-sm leading-relaxed">{String(m.content)}</span>
                  </div>
                  {/* Streaming Token Usage Metadata Display */}
                  {m.role === 'assistant' && (
                    <div className="mt-2 ml-2 flex items-center text-[11px] text-slate-500 font-medium gap-2">
                      <span className="flex items-center gap-1">
                        <svg className="w-3 h-3 text-blue-500" fill="currentColor" viewBox="0 0 20 20"><path d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" /></svg>
                        Gemini 1.5 Pro
                      </span>
                      {(m as any).annotations && (m as any).annotations.length > 0 && (
                        <span>• Tokens Processed: {(m as any).annotations?.[0]?.totalTokens || 0}</span>
                      )}
                    </div>
                  )}
                </div>
              ))
            )}
            {/* Visual indicator of active inference execution */}
            {isLoading && (
              <div className="flex items-center gap-1 text-slate-400 text-sm p-2 bg-white w-fit rounded-full border shadow-sm ml-2">
                <span className="animate-bounce inline-block w-1.5 h-1.5 bg-slate-400 rounded-full"></span>
                <span className="animate-bounce delay-100 inline-block w-1.5 h-1.5 bg-slate-400 rounded-full"></span>
                <span className="animate-bounce delay-200 inline-block w-1.5 h-1.5 bg-slate-400 rounded-full"></span>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
          {/* Form Input Interface */}
          <form onSubmit={handleSubmit} className="p-4 bg-white border-t flex gap-3 shadow-inner">
            <input
              className="flex-1 border border-slate-300 rounded-full px-5 py-3 text-sm focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition"
              value={input}
              onChange={handleInputChange}
              placeholder={`Ask a specific question about ${subtopicLabel}...`}
              disabled={isLoading}
            />
            <button 
              type="submit" 
              disabled={isLoading || !input.trim()}
              className="bg-blue-600 text-white px-6 py-3 rounded-full font-semibold text-sm disabled:opacity-50 hover:bg-blue-700 transition shadow-md hover:shadow-lg disabled:shadow-none"
            >
              Send Request
            </button>
          </form>
        </>
      )}
    </div>
  );
}
