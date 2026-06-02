import { TimeSlot } from './timeExtraction';
export interface MicroTask {
  id: string;
  subjectId: string;
  estimatedMins: number;
  priority: number;
}
export interface ScheduledBlock {
  taskId: string;
  subjectId: string;
  start: Date;
  end: Date;
}
interface SolveResult {
  success: boolean;
  schedule: ScheduledBlock[];
  deferredTasks: { taskId: string; reason: string }[];
}
const L_MAX = 240; // Max 4 hours of study per day
const S_MAX = 3;   // Max 3 subjects per day
export function solveSchedule(tasks: MicroTask[], availableSlots: TimeSlot[]): SolveResult {
  const currentTasks = [...tasks];
  const deferredTasks: { taskId: string; reason: string }[] = [];
  while (currentTasks.length > 0) {
    const result = attemptSolve(currentTasks, availableSlots);
    if (result.success) {
      return {
        success: true,
        schedule: result.schedule,
        deferredTasks
      };
    } else {
      // Infeasible. Defer the lowest priority task.
      currentTasks.sort((a, b) => a.priority - b.priority); // ascending
      const lowestPriorityTask = currentTasks.shift(); // remove the lowest
      if (lowestPriorityTask) {
        deferredTasks.push({
          taskId: lowestPriorityTask.id,
          reason: result.reason || "Algorithm constraints could not be satisfied."
        });
      }
    }
  }
  return { success: true, schedule: [], deferredTasks };
}
function attemptSolve(tasks: MicroTask[], slots: TimeSlot[]): { success: boolean, schedule: ScheduledBlock[], reason?: string } {
  // ORR Heuristic: Order variables (tasks) by duration (descending), then priority (descending)
  const sortedTasks = [...tasks].sort((a, b) => {
    if (b.estimatedMins !== a.estimatedMins) return b.estimatedMins - a.estimatedMins;
    return b.priority - a.priority;
  });
  const schedule: ScheduledBlock[] = [];
  // Clone slots since we will be cutting into them
  const currentSlots = slots.map(s => ({ start: new Date(s.start), end: new Date(s.end) }));
  // Backtracking function
  function backtrack(taskIndex: number): boolean | string {
    if (taskIndex === sortedTasks.length) return true; // All tasks scheduled
    const task = sortedTasks[taskIndex];
    const durationMs = task.estimatedMins * 60000;
    // FSS Heuristic: Value ordering
    // Prioritize slots on days where this subject is already scheduled.
    const sortedSlots = [...currentSlots].sort((a, b) => {
      const dayA = a.start.toDateString();
      const dayB = b.start.toDateString();
      const hasSubjA = schedule.some(s => s.subjectId === task.subjectId && s.start.toDateString() === dayA);
      const hasSubjB = schedule.some(s => s.subjectId === task.subjectId && s.start.toDateString() === dayB);
      if (hasSubjA && !hasSubjB) return -1;
      if (!hasSubjA && hasSubjB) return 1;
      return a.start.getTime() - b.start.getTime(); // Chronological
    });
    let failureReason = "Insufficient physical time blocks remaining this week to accommodate this task.";
    for (let i = 0; i < sortedSlots.length; i++) {
      const slot = sortedSlots[i];
      const slotDuration = slot.end.getTime() - slot.start.getTime();
      if (slotDuration >= durationMs) {
        // Attempt assignment
        const proposedStart = new Date(slot.start);
        const proposedEnd = new Date(proposedStart.getTime() + durationMs);
        const dayStr = proposedStart.toDateString();
        // Check Constraint 2: Cognitive Fatigue (Max duration per day)
        const dayTasks = schedule.filter(s => s.start.toDateString() === dayStr);
        const dayDurationMins = dayTasks.reduce((sum, s) => sum + ((s.end.getTime() - s.start.getTime()) / 60000), 0);
        if (dayDurationMins + task.estimatedMins > L_MAX) {
          failureReason = `Scheduling this task would exceed your limit of ${L_MAX/60} hours of intense study per day.`;
          continue; 
        }
        // Check Constraint 3: Context-Switching (Max subjects per day)
        const subjectsOnDay = new Set(dayTasks.map(s => s.subjectId));
        subjectsOnDay.add(task.subjectId);
        if (subjectsOnDay.size > S_MAX) {
          failureReason = `Scheduling this task requires introducing a ${S_MAX + 1}th distinct subject into your day, violating cognitive load limits.`;
          continue; 
        }
        // Constraints passed. Apply assignment.
        schedule.push({
          taskId: task.id,
          subjectId: task.subjectId,
          start: proposedStart,
          end: proposedEnd
        });
        // Adjust slots
        const originalSlot = { ...slot };
        slot.start = proposedEnd; // Shrink slot
        // Recurse
        const result = backtrack(taskIndex + 1);
        if (result === true) return true;
        if (typeof result === 'string') failureReason = result; // Bubble up deep failure
        // Backtrack
        schedule.pop();
        slot.start = originalSlot.start; // Restore slot
      }
    }
    return failureReason;
  }
  const result = backtrack(0);
  if (result === true) {
    return { success: true, schedule };
  } else {
    return { success: false, schedule: [], reason: result as string };
  }
}
