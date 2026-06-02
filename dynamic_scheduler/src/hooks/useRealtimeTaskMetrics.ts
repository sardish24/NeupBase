import { useEffect, useState, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
export function useRealtimeTaskMetrics(subjectId: string, initialPrepScore: number) {
  const supabase = useMemo(() => createClient(), []);
  const [prepScore, setPrepScore] = useState<number>(initialPrepScore);
  useEffect(() => {
    // Instantiate and configure the WebSocket channel subscription
    const channel = supabase
      .channel(`realtime_metrics_${subjectId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'task_completion_logs',
          // Push payload filtering to the server to heavily reduce network bandwidth utilization
          filter: `subject_id=eq.${subjectId}` 
        },
        async (payload) => {
          console.log('Realtime WAL database broadcast received:', payload);
          // Upon receiving an immutable insert event, the client triggers a lightweight 
          // re-fetch of the analytical query to update the visual metrics seamlessly.
          fetchUpdatedMetrics();
        }
      )
      .subscribe((status, err) => {
        if (status === 'SUBSCRIBED') {
          console.log('Successfully secured connection to Supabase Realtime WebSocket edge node');
        }
        if (err) {
          console.error('WebSocket connection failure:', err);
        }
      });
    const fetchUpdatedMetrics = async () => {
      // Invokes a dedicated Next.js Server Action or API route to execute the complex CTE metric query
      try {
        const response = await fetch(`/api/metrics?subject_id=${subjectId}`);
        if (response.ok) {
          const data = await response.json();
          // React state reconciliation triggers a highly optimized DOM update
          setPrepScore(data.preparation_percentage);
        }
      } catch (error) {
        console.error('Failed to retrieve recalculated metrics from database:', error);
      }
    };
    // Rigorously cleanup the WebSocket connection when the React component unmounts to prevent memory leaks
    return () => {
      supabase.removeChannel(channel);
    };
  }, [subjectId, supabase]);
  return { prepScore };
}
