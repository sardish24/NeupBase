'use client'
import { createClient } from '@/lib/supabase/client'
import { useState } from 'react'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState('')
  const supabase = createClient()
  const handleMagicLink = async (e: React.FormEvent) => {
    e.preventDefault()
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${location.origin}/auth/callback` },
    })
    if (error) setMessage(error.message)
    else setMessage('Check your university inbox for the secure magic link.')
  }
  return (
    <div className="flex items-center justify-center min-h-screen bg-slate-900">
      <div className="bg-slate-800 p-8 rounded-2xl shadow-xl w-full max-w-md">
        <h1 className="text-2xl font-bold text-white mb-6 text-center">StudyBrain Authentication</h1>
        <form onSubmit={handleMagicLink} className="space-y-4">
          <input 
            type="email" 
            value={email} 
            onChange={(e) => setEmail(e.target.value)} 
            placeholder="student@university.edu" 
            className="w-full px-4 py-3 rounded-lg bg-slate-700 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            required 
          />
          <button 
            type="submit"
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-4 rounded-lg transition duration-200"
          >
            Authenticate
          </button>
        </form>
        {message && <p className="mt-4 text-center text-sm font-medium text-emerald-400">{message}</p>}
      </div>
    </div>
  )
}
