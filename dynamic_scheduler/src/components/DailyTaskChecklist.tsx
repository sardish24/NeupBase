'use client';
import { useState } from 'react';
import { useRealtimeTaskMetrics } from '@/hooks/useRealtimeTaskMetrics';
interface TaskEntity {
  task_id: string;
  subject_id: string;
  topic_id: string;
  title: string;
  status: 'pending' | 'completed' | 'skipped' | 'deferred' | 'partial';
}
export default function DailyTaskChecklist({ 
  initialTasks, 
  subjectId, 
  initialScore 
}: Readonly<{ 
  initialTasks: TaskEntity[]; 
  subjectId: string;
  initialScore: number;
}>) {
  const [tasks, setTasks] = useState<TaskEntity[]>(initialTasks);
  const [activeTimeLogId, setActiveTimeLogId] = useState<string | null>(null);
  const [timeSpentDuration, setTimeSpentDuration] = useState<number>(0);
  // Initialize the persistent real-time websocket connection for live dashboard graph updates
  const { prepScore } = useRealtimeTaskMetrics(subjectId, initialScore);
  const executeTaskCompletion = async (task: TaskEntity) => {
    // 1. Optimistic UI Update: Instantly mutate local state to appear complete
    setTasks(prevTasks => prevTasks.map(t => 
      t.task_id === task.task_id ? { ...t, status: 'completed' } : t
    ));
    // 2. Prepare the highly structured payload
    const telemetryPayload = {
      task_id: task.task_id,
      subject_id: task.subject_id,
      topic_id: task.topic_id,
      status: 'completed',
      // Attach time logged if the active input matches the current task, otherwise default to 0
      time_spent_minutes: activeTimeLogId === task.task_id ? timeSpentDuration : 0,
      notes: ''
    };
    // 3. Dispatch the asynchronous API Request
    try {
      const response = await fetch('/api/tasks/log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(telemetryPayload),
      });
      if (!response.ok) {
        throw new Error('Network synchronization failure.');
      }
      // Cleanup local UI memory state for the time logging mechanism
      setActiveTimeLogId(null);
      setTimeSpentDuration(0);
    } catch (error) {
      console.error('Optimistic UI update failed. Reverting local state:', error);
      // Rollback the optimistic update on failure to ensure visual consistency with database reality
      setTasks(prevTasks => prevTasks.map(t => 
        t.task_id === task.task_id ? { ...t, status: task.status } : t
      ));
    }
  };
  return (
    <div className="max-w-3xl mx-auto p-8 bg-white rounded-2xl shadow-sm border border-gray-100">
      <header className="flex justify-between items-center mb-8 border-b pb-4">
        <div>
          <h2 className="text-3xl font-extrabold text-gray-900 tracking-tight">Today&apos;s Academic Plan</h2>
          <p className="text-gray-500 mt-1">Focus on high-yield topics.</p>
        </div>
        <div className="flex flex-col items-end bg-blue-50 px-4 py-2 rounded-lg">
          <span className="text-xs text-blue-600 uppercase tracking-widest font-bold">Preparation Index</span>
          <span className="text-4xl font-black text-blue-700 tabular-nums">
             {/* The prepScore dynamically and instantaneously updates via the WebSocket stream */}
             {prepScore.toFixed(1)}%
          </span>
        </div>
      </header>
      <ul className="space-y-4">
        {tasks.map(task => (
          <li 
            key={task.task_id} 
            className={`flex flex-col p-5 rounded-xl transition-all duration-200 border shadow-sm ${
              task.status === 'completed' 
              ? 'bg-green-50 border-green-200 opacity-75' 
              : 'bg-white border-gray-200 hover:border-blue-300 hover:shadow-md'
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-5">
                <input 
                  type="checkbox" 
                  checked={task.status === 'completed'}
                  onChange={() => executeTaskCompletion(task)}
                  className="w-7 h-7 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 cursor-pointer transition-transform hover:scale-110"
                  disabled={task.status === 'completed'}
                  aria-label={`Mark ${task.title} as completed`}
                />
                <span className={`text-xl font-semibold transition-colors duration-200 ${
                  task.status === 'completed' ? 'text-gray-400 line-through' : 'text-gray-800'
                }`}>
                  {task.title}
                </span>
              </div>
              {/* Optional Advanced Time Logging Interface */}
              {task.status !== 'completed' && (
                <div className="flex items-center space-x-3">
                  {activeTimeLogId === task.task_id ? (
                    <div className="flex items-center animate-fade-in">
                      <input 
                        type="number" 
                        min="0"
                        max="999"
                        value={timeSpentDuration}
                        onChange={(e) => setTimeSpentDuration(Number.parseInt(e.target.value) || 0)}
                        className="w-24 px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-shadow"
                        placeholder="Minutes"
                      />
                    </div>
                  ) : (
                    <button 
                      onClick={() => setActiveTimeLogId(task.task_id)}
                      className="text-sm font-medium text-gray-400 hover:text-blue-600 transition-colors border border-transparent hover:border-blue-100 hover:bg-blue-50 px-3 py-1 rounded-md"
                    >
                      + Log Time
                    </button>
                  )}
                </div>
              )}
            </div>
          </li>
        ))}
        {tasks.length === 0 && (
          <li className="text-center py-16 text-gray-400 border-2 border-dashed border-gray-200 rounded-xl">
            <span className="block text-4xl mb-3">🎉</span>
            <p className="text-lg font-medium">All tasks mathematically resolved.</p>
            <p className="text-sm">Your analytical readiness is maximized.</p>
          </li>
        )}
      </ul>
    </div>
  );
}
