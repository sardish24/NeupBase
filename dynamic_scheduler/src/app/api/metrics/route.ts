import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const subjectId = searchParams.get('subject_id');
    if (!subjectId) {
      return NextResponse.json({ error: 'subject_id parameter is required' }, { status: 400 });
    }
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const userId = user.id;
    // Supabase RPC call to execute the advanced CTE metric query on the database.
    // Ensure you create the PostgreSQL function `calculate_subject_prep_score(p_user_id UUID, p_subject_id UUID)` 
    // that encapsulates the CTE query defined in the blueprint.
    const { data, error } = await supabase.rpc('calculate_subject_prep_score', {
      p_user_id: userId,
      p_subject_id: subjectId
    });
    if (error) {
      console.error('Failed to calculate metrics:', error);
      return NextResponse.json({ error: 'Database metric computation failed.' }, { status: 500 });
    }
    return NextResponse.json({ preparation_percentage: data || 0.0 }, { status: 200 });
  } catch (err) {
    console.error('Error in metrics API:', err);
    return NextResponse.json({ error: 'Internal server error.' }, { status: 500 });
  }
}
