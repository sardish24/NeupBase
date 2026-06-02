import { urlBase64ToUint8Array } from '@/utils/webpush';
import { createClient } from '@/lib/supabase/client';
export async function subscribeToDailyBrief() {
  // Gracefully degrade if the browser lacks support
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    console.warn('Web Push is not supported in this browser.');
    return;
  }
  const supabase = createClient();
  const registration = await navigator.serviceWorker.register('/sw.js');
  // Wait for the service worker thread to initialize
  await navigator.serviceWorker.ready;
  try {
    // Interrogate the browser's PushManager to generate cryptographic keys
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!)
    });
    const subJSON = subscription.toJSON();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("User must be authenticated to subscribe.");
    // Persist the endpoint and keys to the Supabase Schema
    const { error } = await supabase.from('push_subscriptions').upsert({
      user_id: user.id,
      endpoint: subJSON.endpoint,
      p256dh: subJSON.keys?.p256dh,
      auth: subJSON.keys?.auth,
    }, { onConflict: 'endpoint' });
    if (error) throw error;
    console.log("Successfully subscribed to Today's Study Brief.");
  } catch (error) {
    console.error("Failed to establish push subscription:", error);
  }
}
