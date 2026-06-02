import { NextRequest, NextResponse } from 'next/server';
import webpush from 'web-push';
import { createClient } from '@supabase/supabase-js';
export async function GET(req: NextRequest) {
  try {
    // 1. Security Authorization
    // Verify that the request originates from Vercel Cron
    const authHeader = req.headers.get('Authorization');
    const cronSecret = process.env.CRON_SECRET;
    if (process.env.NODE_ENV === 'production' && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized invocation' }, { status: 401 });
    }
    // 2. Initialize the web-push library utilizing Secrets
    webpush.setVapidDetails(
      'mailto:admin@academicplanner.app',
      process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
      process.env.VAPID_PRIVATE_KEY!
    );
    // 3. Initialize the Supabase Client with Service Role privileges
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
    // 4. Query global pending tasks for the current date or earlier (carry-over)
    const todayStr = new Date().toISOString().split('T')[0];
    const { data: pendingTasks, error: taskError } = await supabaseAdmin
      .from('tasks')
      .select(`
        user_id,
        subtopics ( name )
      `)
      .lte('scheduled_date', todayStr)
      .eq('status', 'pending');
    if (taskError) throw taskError;
    if (!pendingTasks || pendingTasks.length === 0) {
      return NextResponse.json({ message: 'No pending tasks across network.' }, { status: 200 });
    }
    // 5. Aggregate tasks mathematically by user_id to prevent multi-notification spam
    const userTasks = pendingTasks.reduce((acc, task) => {
      // @ts-ignore - Supabase join typing resolution
      const subtopicName = task.subtopics?.name || 'Study Task';
      if (!acc[task.user_id]) acc[task.user_id] = [];
      acc[task.user_id].push(subtopicName);
      return acc;
    }, {} as Record<string, string[]>);
    // 6. Retrieve active routing endpoints for users possessing pending tasks
    const userIds = Object.keys(userTasks);
    const { data: subscriptions, error: subError } = await supabaseAdmin
      .from('push_subscriptions')
      .select('*')
      .in('user_id', userIds);
    if (subError) throw subError;
    // 7. Dispatch notifications concurrently utilizing Promise.allSettled
    const pushPromises = subscriptions.map((sub) => {
      const taskList = userTasks[sub.user_id];
      const payload = JSON.stringify({
        title: "Today's Study Brief is Ready",
        body: `You have ${taskList.length} pending tasks today. First objective: ${taskList[0]}.`,
        url: "/dashboard"
      });
      const pushSubscription = {
        endpoint: sub.endpoint,
        keys: {
          p256dh: sub.p256dh,
          auth: sub.auth,
        },
      };
      // Handle dispatch and catch specific HTTP status codes indicating stale routing
      return webpush.sendNotification(pushSubscription, payload).catch(async (err: any) => {
        // HTTP 410 (Gone) or 404 (Not Found) indicates the user revoked permissions or cleared data
        if (err.statusCode === 410 || err.statusCode === 404) {
          console.log(`Pruning stale subscription: ${sub.id}`);
          await supabaseAdmin.from('push_subscriptions').delete().eq('id', sub.id);
        } else {
          console.error(`Push failure for ${sub.id}:`, err);
        }
      });
    });
    await Promise.allSettled(pushPromises);
    return NextResponse.json(
      { success: true, dispatched: subscriptions.length },
      { status: 200 }
    );
  } catch (error: any) {
    console.error('Fatal Edge Function Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
