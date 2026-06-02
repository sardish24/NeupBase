import { NextResponse } from 'next/server';
import { z } from 'zod';
import { extractNetFreeTime } from '@/lib/scheduler/timeExtraction';
import { solveSchedule } from '@/lib/scheduler/cspSolver';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

const taskSchema = z.object({
  id: z.string().uuid(),
  subjectId: z.string(),
  durationMins: z.number().int().min(15).max(120),
  priority: z.number().int().min(1).max(5),
});

const generateRequestSchema = z.object({
  userId: z.string().uuid(),
  targetWeekStart: z.string().datetime(),
  tasks: z.array(taskSchema),
  overrides: z.object({
    noStudyDays: z.array(z.number().int().min(0).max(6)).optional(),
  }).optional(),
});

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const json = await request.json();
    const payload = generateRequestSchema.parse(json);

    // Fetch User Config
    const { data: user, error: userError } = await supabase
      .from('user_configs')
      .select('*')
      .eq('id', payload.userId)
      .single();

    if (userError || !user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const config = {
      sleepStart: user.sleep_start,
      sleepEnd: user.sleep_end,
      noStudyDays: payload.overrides?.noStudyDays || user.no_study_days || [],
      timezone: user.timezone,
    };

    // Fetch Fixed Commitments & Floating Routines
    const { data: fixedCommitmentsData } = await supabase
      .from('fixed_commitments')
      .select('*, floating_routines(*)');

    const { data: independentRoutinesData } = await supabase
      .from('floating_routines')
      .select('*')
      .eq('user_id', payload.userId)
      .eq('anchor_type', 'INDEPENDENT');

    // 1. Pipeline: Extract Free Time
    const commitmentsFormatted = (fixedCommitmentsData || []).map(fc => ({
      ...fc,
      startTime: fc.start_time,
      durationMins: fc.duration_mins,
      routines: (fc.floating_routines || []).map((r: any) => ({
        ...r, durationMins: r.duration_mins
      }))
    }));

    const independentFormatted = (independentRoutinesData || []).map(r => ({
      ...r, durationMins: r.duration_mins, dailyCount: r.daily_count
    }));

    const availableSlots = extractNetFreeTime(
      new Date(payload.targetWeekStart),
      config as any,
      commitmentsFormatted as any,
      independentFormatted as any
    );

    // 2. Map payload tasks to solver interface
    const microTasks = payload.tasks.map(t => ({
      id: t.id,
      subjectId: t.subjectId,
      estimatedMins: t.durationMins,
      priority: t.priority
    }));

    // 3. Pipeline: CSP Algorithmic Engine
    const result = solveSchedule(microTasks, availableSlots);

    // Return the response
    return NextResponse.json({
      success: result.success,
      schedule: result.schedule,
      deferredTasks: result.deferredTasks
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation Failed', details: (error as any).errors }, { status: 400 });
    }
    console.error(error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
