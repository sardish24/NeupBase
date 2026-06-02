import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
export async function GET(req: Request) {
  // Instantiates a client utilizing the Service Role Key, 
  // bypassing RLS for background administrative cron execution
  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
  // Security Enforcement: Validate cryptographic signature of Vercel's Cron scheduler
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized Invocation' }, { status: 401 });
  }
  // Fetch active user cohorts
  const { data: users, error: userError } = await supabaseAdmin.auth.admin.listUsers()
  if (!users || userError) {
    return NextResponse.json({ error: 'Failed to fetch users' }, { status: 500 });
  }
  for (const user of users.users || []) {
    // Execute PostgREST RPC function to derive mathematical preparation percentages
    const { data: metrics } = await supabaseAdmin
     .rpc('calculate_preparation_percentage', { p_user_id: user.id })
    // Evaluate Pre-Midterm Condition (Week 8 threshold logic)
    const flaggedSubjects = metrics?.filter((m: any) => m.prep_percentage < 50) || []
    if (flaggedSubjects.length > 0) {
      const subjectNames = flaggedSubjects.map((s:any) => s.name).join(', ')
      // Insert analytical warning into the notifications table
      await supabaseAdmin.from('notifications').insert({
        user_id: user.id,
        message: `System Alert: Midterm preparation for ${subjectNames} currently evaluates below 50%. Immediate triage and prioritization required.`
      })
    }
  }
  return NextResponse.json({ status: 'Report Generation Pipeline Complete' })
}
