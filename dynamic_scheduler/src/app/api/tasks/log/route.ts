import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';
const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Define rigorous cryptographic and structural validation rules for the incoming payload
const TaskLogSchema = z.object({
  task_id: z.string().regex(uuidRegex, "Invalid UUID"),
  subject_id: z.string().regex(uuidRegex, "Invalid UUID"),
  topic_id: z.string().regex(uuidRegex, "Invalid UUID"),
  status: z.enum(['completed', 'skipped', 'deferred', 'partial']),
  time_spent_minutes: z.number().int().nonnegative().max(32767).optional().default(0),
  notes: z.string().max(2000).trim().optional(),
});
export async function POST(request: Request) {
  try {
    // 1. Authenticate the request via Supabase Auth using highly secure HttpOnly cookies
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json(
        { error: 'Cryptographic authentication failed. Unauthorized payload submission.' }, 
        { status: 401 }
      );
    }
    // 2. Parse the raw request stream and validate the JSON body against the strict Zod schema
    const body = await request.json();
    const validationResult = TaskLogSchema.safeParse(body);
    if (!validationResult.success) {
      return NextResponse.json(
        { error: 'Payload failed strict schema validation.', details: validationResult.error.issues },
        { status: 400 }
      );
    }
    const validData = validationResult.data;
    // 3. Execute the append-only insertion against the PostgreSQL ledger
    const { data, error: dbError } = await supabase
      .from('task_completion_logs')
      .insert({
        task_id: validData.task_id,
        subject_id: validData.subject_id,
        topic_id: validData.topic_id,
        user_id: user.id, // Enforce identity natively derived from the cryptographic token
        status: validData.status,
        time_spent_minutes: validData.time_spent_minutes,
        notes: validData.notes,
        // The database automatically assigns the completion_timestamp via the DEFAULT NOW() parameter
      })
      .select('log_id, completion_timestamp')
      .single();
    if (dbError) {
      console.error('PostgreSQL Insertion Error Details:', dbError);
      return NextResponse.json(
        { error: 'Database rejected the event stream insertion.' }, 
        { status: 500 }
      );
    }
    // 4. Return an HTTP 201 Created indicating successful immutable persistence
    return NextResponse.json({ 
      success: true, 
      message: 'Task event logged and synchronized successfully.',
      data: data 
    }, { status: 201 });
  } catch (err) {
    console.error('Unhandled Internal Server Error Exception:', err);
    return NextResponse.json(
      { error: 'A catastrophic internal server error interrupted execution.' }, 
      { status: 500 }
    );
  }
}
