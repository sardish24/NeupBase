import { RRule } from 'rrule';
export interface TimeSlot {
  start: Date;
  end: Date;
}
export interface UserConfig {
  sleepStart: string; // "22:30:00"
  sleepEnd: string;   // "06:30:00"
  noStudyDays: number[]; // [0, 6] (Sun, Sat)
  timezone: string;
}
export interface FixedCommitment {
  rrule?: string;
  startTime: Date;
  durationMins: number;
  routines: FloatingRoutine[];
}
export interface FloatingRoutine {
  anchorType: 'PRE_EVENT' | 'POST_EVENT' | 'INDEPENDENT';
  durationMins: number;
  dailyCount?: number;
}
/**
 * Extracts Net Free Time for the target week.
 */
export function extractNetFreeTime(
  weekStartDate: Date,
  config: UserConfig,
  commitments: FixedCommitment[],
  independentRoutines: FloatingRoutine[]
): TimeSlot[] {
  // 1. Initialize the whole week as one giant free block.
  const weekEndDate = new Date(weekStartDate);
  weekEndDate.setDate(weekEndDate.getDate() + 7);
  let freeSlots: TimeSlot[] = [{ start: weekStartDate, end: weekEndDate }];
  // Helper to subtract a block from our list of free slots.
  const subtractBlock = (blockStart: Date, blockEnd: Date) => {
    const newSlots: TimeSlot[] = [];
    for (const slot of freeSlots) {
      if (blockEnd <= slot.start || blockStart >= slot.end) {
        newSlots.push(slot); // No overlap
      } else {
        // Overlap. Split the slot if necessary.
        if (slot.start < blockStart) {
          newSlots.push({ start: slot.start, end: blockStart });
        }
        if (blockEnd < slot.end) {
          newSlots.push({ start: blockEnd, end: slot.end });
        }
      }
    }
    freeSlots = newSlots;
  };
  // 2. Biological Blackouts: Sleep & noStudyDays
  for (let i = 0; i < 7; i++) {
    const currentDay = new Date(weekStartDate);
    currentDay.setDate(currentDay.getDate() + i);
    // Check if it's a no-study day
    const dayOfWeek = currentDay.getDay(); // 0=Sun, 1=Mon, etc.
    if (config.noStudyDays.includes(dayOfWeek)) {
      const endOfDay = new Date(currentDay);
      endOfDay.setDate(endOfDay.getDate() + 1);
      subtractBlock(currentDay, endOfDay);
      continue;
    }
    // Subtract sleep. Assume sleepStart is something like "22:30:00" and sleepEnd is "06:30:00"
    // Sleep ends in the morning:
    const [wakeH, wakeM] = config.sleepEnd.split(':').map(Number);
    const wakeTime = new Date(currentDay);
    wakeTime.setHours(wakeH, wakeM, 0, 0);
    subtractBlock(currentDay, wakeTime);
    // Sleep starts in the evening:
    const [sleepH, sleepM] = config.sleepStart.split(':').map(Number);
    const sleepTime = new Date(currentDay);
    sleepTime.setHours(sleepH, sleepM, 0, 0);
    const endOfDay = new Date(currentDay);
    endOfDay.setDate(endOfDay.getDate() + 1);
    subtractBlock(sleepTime, endOfDay);
  }
  // 3. Physical Constraints: Fixed Commitments & PRE/POST Anchors
  for (const c of commitments) {
    let instances: Date[] = [c.startTime];
    if (c.rrule) {
      const rule = RRule.fromString(c.rrule);
      instances = rule.between(weekStartDate, weekEndDate);
    }
    for (const instance of instances) {
      let blockStart = new Date(instance);
      let blockEnd = new Date(instance.getTime() + c.durationMins * 60000);
      // Pad with floating routines
      for (const r of c.routines) {
        if (r.anchorType === 'PRE_EVENT') {
          blockStart = new Date(blockStart.getTime() - r.durationMins * 60000);
        } else if (r.anchorType === 'POST_EVENT') {
          blockEnd = new Date(blockEnd.getTime() + r.durationMins * 60000);
        }
      }
      subtractBlock(blockStart, blockEnd);
    }
  }
  // 4. Independent Floating Routines (e.g., meals)
  // Simplified spacing heuristic: find the largest blocks and carve out time.
  for (let i = 0; i < 7; i++) {
    const currentDay = new Date(weekStartDate);
    currentDay.setDate(currentDay.getDate() + i);
    const endOfDay = new Date(currentDay);
    endOfDay.setDate(endOfDay.getDate() + 1);
    for (const routine of independentRoutines) {
      let count = routine.dailyCount || 0;
      while (count > 0) {
        // Find largest free block on this day
        let largestSlot: TimeSlot | null = null;
        let maxDuration = 0;
        for (const slot of freeSlots) {
          if (slot.start >= currentDay && slot.start < endOfDay) {
            const dur = slot.end.getTime() - slot.start.getTime();
            if (dur > maxDuration) {
              maxDuration = dur;
              largestSlot = slot;
            }
          }
        }
        if (largestSlot && maxDuration >= routine.durationMins * 60000) {
          // Carve out from the middle of the slot
          const middleTime = new Date(largestSlot.start.getTime() + maxDuration / 2);
          const rStart = new Date(middleTime.getTime() - (routine.durationMins * 60000) / 2);
          const rEnd = new Date(rStart.getTime() + routine.durationMins * 60000);
          subtractBlock(rStart, rEnd);
        }
        count--;
      }
    }
  }
  // 5. Final Filter: Purge slots < 15 minutes
  freeSlots = freeSlots.filter(
    (slot) => (slot.end.getTime() - slot.start.getTime()) >= 15 * 60000
  );
  return freeSlots;
}
