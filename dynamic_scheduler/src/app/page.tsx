'use client';
import React, { useState } from 'react';
import { Calendar, Clock, AlertCircle, Play, Plus, BookOpen } from 'lucide-react';
import { cn } from '@/lib/utils';
// Dummy initial data
const initialTasks = [
  { id: '1', title: 'Cellular Biology Ch 4', subject: 'Biology', duration: 45, priority: 5, color: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/50' },
  { id: '2', title: 'Advanced Calculus Lab', subject: 'Math', duration: 90, priority: 4, color: 'bg-blue-500/20 text-blue-400 border-blue-500/50' },
  { id: '3', title: 'Modern Literature Essay', subject: 'Literature', duration: 120, priority: 3, color: 'bg-purple-500/20 text-purple-400 border-purple-500/50' },
];
const deferredTasks = [
  { id: '4', title: 'Physics Practice Exam', subject: 'Physics', reason: 'Scheduling this task requires introducing a 4th distinct subject into your day, violating cognitive load limits.' }
];
export default function SchedulerDashboard() {
  const [tasks, setTasks] = useState(initialTasks);
  const [isGenerating, setIsGenerating] = useState(false);
  const handleGenerate = () => {
    setIsGenerating(true);
    setTimeout(() => setIsGenerating(false), 2000);
  };
  return (
    <div className="min-h-screen bg-slate-950 text-slate-50 font-sans selection:bg-indigo-500/30">
      {/* Header */}
      <header className="border-b border-slate-800/60 bg-slate-900/50 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-indigo-500 flex items-center justify-center shadow-lg shadow-indigo-500/20">
              <Calendar className="w-5 h-5 text-white" />
            </div>
            <h1 className="text-xl font-semibold tracking-tight">Cognitive Scheduler</h1>
          </div>
          <button 
            onClick={handleGenerate}
            disabled={isGenerating}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-5 py-2 rounded-full font-medium transition-all hover:shadow-lg hover:shadow-indigo-500/25 active:scale-95 disabled:opacity-50"
          >
            {isGenerating ? (
              <span className="animate-pulse">Optimizing Schedule...</span>
            ) : (
              <>
                <Play className="w-4 h-4 fill-current" />
                <span>Generate Week</span>
              </>
            )}
          </button>
        </div>
      </header>
      <main className="max-w-7xl mx-auto px-6 py-8 grid grid-cols-12 gap-8">
        {/* Left Sidebar: Task Input & Configuration */}
        <aside className="col-span-12 lg:col-span-3 flex flex-col gap-6">
          <div className="bg-slate-900/40 border border-slate-800 rounded-2xl p-5 shadow-2xl">
            <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-4 flex items-center gap-2">
              <BookOpen className="w-4 h-4" /> Unscheduled Tasks
            </h2>
            <div className="flex flex-col gap-3">
              {tasks.map((task) => (
                <div key={task.id} className="group relative bg-slate-800/40 border border-slate-700 hover:border-slate-600 rounded-xl p-3 transition-colors cursor-pointer">
                  <h3 className="font-medium text-slate-200">{task.title}</h3>
                  <div className="flex items-center gap-3 mt-2 text-xs text-slate-400">
                    <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {task.duration}m</span>
                    <span className="px-2 py-0.5 rounded-md bg-slate-800 text-slate-300">{task.subject}</span>
                  </div>
                </div>
              ))}
            </div>
            <button className="w-full mt-4 flex items-center justify-center gap-2 border border-dashed border-slate-700 hover:border-indigo-500 hover:text-indigo-400 text-slate-500 rounded-xl py-3 text-sm font-medium transition-colors">
              <Plus className="w-4 h-4" /> Add Micro-Task
            </button>
          </div>
          {/* Deferral Inbox */}
          <div className="bg-rose-950/20 border border-rose-900/30 rounded-2xl p-5 relative overflow-hidden group">
            <div className="absolute top-0 left-0 w-1 h-full bg-rose-500/50 group-hover:bg-rose-500 transition-colors" />
            <h2 className="text-sm font-semibold text-rose-400 uppercase tracking-wider mb-4 flex items-center gap-2">
              <AlertCircle className="w-4 h-4" /> Deferral Inbox
            </h2>
            <div className="flex flex-col gap-3">
              {deferredTasks.map((task) => (
                <div key={task.id} className="bg-slate-900/60 border border-rose-900/50 rounded-xl p-3">
                  <h3 className="font-medium text-slate-200 text-sm">{task.title}</h3>
                  <p className="text-xs text-rose-300/80 mt-2 leading-relaxed">
                    {task.reason}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </aside>
        {/* Main Content: The Dynamic Calendar */}
        <section className="col-span-12 lg:col-span-9">
          <div className="bg-slate-900/40 border border-slate-800 rounded-2xl p-6 h-[800px] flex flex-col shadow-2xl">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-medium text-slate-200">Algorithmic Week View</h2>
              <div className="flex items-center gap-4 text-sm text-slate-400">
                <span className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-emerald-500" /> Biology</span>
                <span className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-blue-500" /> Math</span>
                <span className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-purple-500" /> Literature</span>
                <span className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-slate-600" /> Fixed</span>
              </div>
            </div>
            {/* Mock Calendar Grid */}
            <div className="flex-1 border border-slate-800 rounded-xl overflow-hidden flex bg-slate-950/50">
              {/* Time Column */}
              <div className="w-16 border-r border-slate-800 flex flex-col pt-12">
                {[...Array(12)].map((_, i) => (
                  <div key={i} className="flex-1 flex justify-center text-xs text-slate-500 -mt-2">
                    {i + 8}:00
                  </div>
                ))}
              </div>
              {/* Days Columns */}
              {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day, i) => (
                <div key={day} className="flex-1 border-r last:border-r-0 border-slate-800/50 relative">
                  <div className="h-12 border-b border-slate-800 flex items-center justify-center text-sm font-medium text-slate-400 bg-slate-900/50">
                    {day}
                  </div>
                  {/* Mock Scheduled Blocks */}
                  {i === 0 && (
                    <>
                      <div className="absolute top-[20%] left-2 right-2 h-24 bg-slate-800 border border-slate-700 rounded-lg p-2 text-xs text-slate-400 overflow-hidden shadow-lg">
                        <div className="font-medium text-slate-300">College Lectures</div>
                        <div>9:00 - 13:00</div>
                      </div>
                      <div className="absolute top-[45%] left-2 right-2 h-16 bg-blue-500/10 border border-blue-500/30 text-blue-400 rounded-lg p-2 text-xs overflow-hidden shadow-lg hover:border-blue-500/60 transition-colors cursor-pointer backdrop-blur-sm">
                        <div className="font-medium">Advanced Calculus Lab</div>
                        <div>14:30 - 16:00</div>
                      </div>
                    </>
                  )}
                  {i === 1 && (
                    <div className="absolute top-[30%] left-2 right-2 h-12 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 rounded-lg p-2 text-xs overflow-hidden shadow-lg hover:border-emerald-500/60 transition-colors cursor-pointer backdrop-blur-sm">
                      <div className="font-medium">Cellular Biology Ch 4</div>
                      <div>11:00 - 11:45</div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
