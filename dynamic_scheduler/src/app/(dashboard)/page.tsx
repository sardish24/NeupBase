import { createClient } from '@/lib/supabase/server'
import dynamic from 'next/dynamic'
// Disabling SSR strictly for the Recharts visualization wrapper
const DynamicComplianceChart = dynamic(
  () => import('@/components/charts/ComplianceChart'), 
  { ssr: false, loading: () => <div className="animate-pulse h-80 w-full bg-slate-800 rounded-xl" /> }
)
export default async function Dashboard() {
  const supabase = await createClient()
  // PostgREST Query: Aggregate analytical task tracking data
  // Assuming a generic mock return here if RPC is not fully populated yet
  const { data: chartData } = await supabase.rpc('get_weekly_compliance_metrics')
  return (
    <main className="p-8 max-w-6xl mx-auto">
      <h1 className="text-4xl font-extrabold mb-8 text-slate-900">Semester Trajectory Analysis</h1>
      <div className="w-full">
        <DynamicComplianceChart data={chartData || []} />
      </div>
    </main>
  )
}
