'use client'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
export default function ComplianceChart({ data }: { data: any }) {
  // Executed exclusively on the client, evading hydration discrepancies
  return (
    <div className="h-80 w-full bg-slate-900 rounded-xl p-6 shadow-lg">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
          <XAxis dataKey="week" stroke="#94a3b8" tickFormatter={(v) => `W${v}`} />
          <YAxis stroke="#94a3b8" />
          <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: 'none', borderRadius: '8px', color: '#f8fafc' }} />
          <Line type="monotone" dataKey="compliance" stroke="#82ca9d" strokeWidth={3} dot={{ fill: '#82ca9d', r: 4 }} activeDot={{ r: 6 }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
