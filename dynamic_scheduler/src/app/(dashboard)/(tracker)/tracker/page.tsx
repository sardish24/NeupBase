'use client'
import { createClient } from '@/lib/supabase/client'
import { useEffect, useState, useCallback, useMemo } from 'react'
interface Task {
  id: string;
  title: string;
  status: string;
  time_spent_minutes: number;
  subjects: { name: string } | null;
}

export default function DailyTracker() {
  const [tasks, setTasks] = useState<Task[]>([])
  const supabase = useMemo(() => createClient(), [])

  const handleTaskUpdate = useCallback((payload: { new: { id: string; status: string } }) => {
    if (payload.new.status === 'completed') {
      setTasks((current) => current.filter(t => t.id !== payload.new.id))
    }
  }, [])

  useEffect(() => {
    // PostgREST Query: Fetch pending tasks mapped to current temporal window
    const fetchTasks = async () => {
      const today = new Date().toISOString().split('T')[0]
      const { data, error } = await supabase.from('tasks')
       .select(`id, title, status, time_spent_minutes, subjects(name)`)
       .eq('status', 'pending')
       .lte('planned_date', today)
      if (data && !error) setTasks(data as unknown as Task[])
    }
    fetchTasks()

    // Realtime Subscription: Bind to PostgreSQL replication slot
    const channel = supabase.channel('realtime_tasks')
     .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'tasks'
      }, handleTaskUpdate)
     .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [supabase, handleTaskUpdate])
  const markAsDone = async (id: string): Promise<void> => {
    const timestamp = new Date().toISOString()
    await supabase.from('tasks').update({ 
      status: 'completed', 
      completion_timestamp: timestamp 
    }).eq('id', id)
  }
  return (
    <div className="p-8 max-w-4xl mx-auto">
      <h2 className="text-3xl font-bold mb-6 text-slate-800">Daily Mission Checklist</h2>
      <div className="space-y-4">
        {tasks.map(task => (
          <div key={task.id} className="flex justify-between items-center p-4 bg-white rounded-lg shadow-sm border border-slate-200">
            <span className="font-medium text-slate-700">
              <span className="text-blue-600 font-bold mr-2">[{task.subjects?.name}]</span>
              {task.title}
            </span>
            <button 
              onClick={() => markAsDone(task.id)} 
              className="bg-emerald-500 hover:bg-emerald-600 text-white font-semibold py-2 px-4 rounded-md transition duration-150"
            >
              Mark Complete
            </button>
          </div>
        ))}
        {tasks.length === 0 && (
          <p className="text-slate-500 italic">No pending tasks for today. You're all caught up!</p>
        )}
      </div>
    </div>
  )
}
