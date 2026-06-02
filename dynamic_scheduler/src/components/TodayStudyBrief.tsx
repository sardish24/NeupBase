'use client';
import React, { useEffect, useState, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import Link from 'next/link';
// TypeScript Interface reflecting the complex SQL JSON output
interface ResourceData {
  id: string;
  url: string;
  type: string;
}
interface StudyTask {
  task_id: string;
  scheduled_date: string;
  status: 'pending' | 'completed';
  est_duration: number;
  is_carry_over: boolean;
  course_name: string;
  topic_name: string;
  subtopic_name: string;
  subtopic_id: string;
  resources: ResourceData[];
}
export default function TodayStudyBrief() {
  const supabase = useMemo(() => createClient(), []);
  const [tasks, setTasks] = useState<StudyTask[]>([]);
  const [loading, setLoading] = useState(true);
  // Initialize data fetch on component mount
  useEffect(() => {
    let mounted = true;
    const fetchTodayTasks = async () => {
      // Executing the RPC containing the master SQL query
      const { data, error } = await supabase.rpc('get_daily_study_brief');
      if (!mounted) return;
      if (error) {
        console.error('Error fetching study brief:', error);
      } else {
        setTasks(data || []);
      }
      setLoading(false);
    };
    fetchTodayTasks();
    return () => { mounted = false; };
  }, [supabase]);
  // Optimistic Concurrency Control for task toggling
  const toggleTaskStatus = async (taskId: string, currentStatus: string) => {
    const newStatus = currentStatus === 'pending' ? 'completed' : 'pending';
    // 1. Optimistically update the local React state before network confirmation
    setTasks(prevTasks => prevTasks.map(t => 
      t.task_id === taskId ? { ...t, status: newStatus } : t
    ));
    // 2. Transmit the mutation to Supabase
    const { error } = await supabase
      .from('tasks')
      .update({ status: newStatus })
      .eq('id', taskId);
    // 3. Rollback mechanism on network failure
    if (error) {
       console.error("Mutation failed, reverting UI state:", error);
       const { data } = await supabase.rpc('get_daily_study_brief');
       if (data) setTasks(data);
    }
  };
  // Render a skeleton loader during initial network request
  if (loading) {
    return (
      <div className="animate-pulse bg-gray-100 h-64 rounded-xl border border-gray-200"></div>
    );
  }
  // Edge Case 1: Rest Day (No tasks allocated and no carry-over)
  if (tasks.length === 0) {
    return (
      <div className="bg-white rounded-xl p-8 text-center shadow-sm border border-gray-200">
        <h3 className="text-xl font-bold text-gray-800">Rest Day! 🌴</h3>
        <p className="text-gray-500 mt-2">
          You have no study tasks scheduled for today, and no lingering backlog from yesterday. Enjoy your downtime.
        </p>
      </div>
    );
  }
  // Derive mathematical state for progress visualization
  const completedTasks = tasks.filter(t => t.status === 'completed');
  const pendingTasks = tasks.filter(t => t.status === 'pending');
  const progressPercentage = Math.round((completedTasks.length / tasks.length) * 100);
  // Edge Case 2: Completion Screen (All retrieved tasks are marked complete)
  if (pendingTasks.length === 0 && completedTasks.length > 0) {
    return (
      <div className="bg-linear-to-br from-green-50 to-emerald-100 rounded-xl p-8 text-center shadow-sm border border-green-200">
        <h3 className="text-2xl font-bold text-green-800">Incredible Work! 🎉</h3>
        <p className="text-green-700 mt-2">
          You have successfully completed all your study objectives for today. Your momentum is building.
        </p>
        <div className="mt-6 w-full bg-white rounded-full h-4 overflow-hidden shadow-inner">
          <div className="bg-green-500 h-4 rounded-full w-full"></div>
        </div>
      </div>
    );
  }
  // Primary Standard Render State
  return (
    <section className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
      {/* Header and Progress Bar */}
      <header className="p-6 border-b border-gray-100 bg-gray-50/50">
        <h2 className="text-xl font-bold text-gray-900">Today&apos;s Study Brief</h2>
        <div className="mt-5 flex items-center justify-between text-sm text-gray-600 mb-2">
          <span>{completedTasks.length} of {tasks.length} objectives met</span>
          <span className="font-semibold text-blue-700">{progressPercentage}%</span>
        </div>
        {/* Semantic Progress Indicator */}
        <progress 
          className="w-full h-2.5 rounded-full overflow-hidden bg-gray-200 [&::-webkit-progress-bar]:bg-gray-200 [&::-webkit-progress-value]:bg-blue-600 [&::-webkit-progress-value]:transition-all [&::-webkit-progress-value]:duration-700 [&::-moz-progress-bar]:bg-blue-600 [&::-moz-progress-bar]:transition-all [&::-moz-progress-bar]:duration-700" 
          value={progressPercentage} 
          max={100}
        />
      </header>
      {/* Task List Rendering */}
      <div className="divide-y divide-gray-100">
        {tasks.map((task) => (
          <article 
            key={task.task_id} 
            className={`p-6 transition duration-300 hover:bg-gray-50 ${task.status === 'completed' ? 'bg-gray-50/50 opacity-60 grayscale-20' : ''}`}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-4 flex-1">
                {/* Interactive Completion Toggle */}
                <input 
                  type="checkbox" 
                  checked={task.status === 'completed'}
                  onChange={() => toggleTaskStatus(task.task_id, task.status)}
                  className="mt-1.5 w-5 h-5 text-blue-600 rounded border-gray-300 focus:ring-blue-500 transition cursor-pointer"
                  aria-label={`Mark ${task.subtopic_name} as ${task.status === 'pending' ? 'complete' : 'incomplete'}`}
                />
                <div className="flex-1">
                  <div className="flex flex-wrap items-center gap-2 mb-1.5">
                    <span className="text-xs font-bold uppercase tracking-wider text-blue-700 bg-blue-50 px-2 py-0.5 rounded">
                      {task.course_name}
                    </span>
                    {/* Carry-over badge integration */}
                    {task.is_carry_over && task.status === 'pending' && (
                      <span className="bg-amber-100 text-amber-800 text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wide border border-amber-200 shadow-sm">
                        Carry-Over
                      </span>
                    )}
                  </div>
                  <h3 className={`text-lg font-bold leading-tight ${task.status === 'completed' ? 'line-through text-gray-500' : 'text-gray-900'}`}>
                    {task.subtopic_name}
                  </h3>
                  <p className="text-sm text-gray-600 mt-1">
                    <span className="font-medium text-gray-800">Module:</span> {task.topic_name}
                  </p>
                  <div className="flex items-center gap-4 mt-3">
                    <span className="flex items-center text-xs font-medium text-gray-500 bg-gray-100 px-2.5 py-1 rounded-md">
                      <svg className="w-3.5 h-3.5 mr-1.5 opacity-70" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                      ~{task.est_duration} mins
                    </span>
                    {/* Display resource count if available */}
                    {Array.isArray(task.resources) && task.resources.length > 0 && (
                      <span className="flex items-center text-xs font-medium text-gray-500 bg-gray-100 px-2.5 py-1 rounded-md">
                        <svg className="w-3.5 h-3.5 mr-1.5 opacity-70" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"></path></svg>
                        {task.resources.length} resource{task.resources.length > 1 ? 's' : ''}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              {/* Deep Link Navigation */}
              {task.status === 'pending' && (
                <Link 
                  href={`/course-tree?highlight=${task.subtopic_id}&chat=gemini`}
                  className="shrink-0 group bg-gray-900 hover:bg-gray-800 text-white text-sm font-semibold py-2.5 px-5 rounded-lg transition-all shadow-sm flex items-center gap-2"
                >
                  Study now
                  <svg className="w-4 h-4 transform group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14 5l7 7m0 0l-7 7m7-7H3"></path></svg>
                </Link>
              )}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
