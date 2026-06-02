'use client';
import React from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from 'recharts';
export interface ComplianceData {
  week_number: number;
  planned_tasks: number;
  completed_tasks: number;
}
interface ComplianceChartProps {
  data: ComplianceData[];
}
export default function SemesterComplianceChart({ data }: ComplianceChartProps) {
  return (
    <div className="w-full h-[450px]">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={data}
          margin={{ top: 30, right: 30, left: 20, bottom: 20 }}
        >
          <CartesianGrid strokeDasharray="4 4" vertical={false} stroke="#d1d5db" />
          <XAxis 
            dataKey="week_number" 
            tickFormatter={(value) => `Week ${value}`}
            stroke="#6b7280"
            tickMargin={10}
          />
          <YAxis stroke="#6b7280" tickMargin={10} />
          <Tooltip 
            contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
            labelFormatter={(label) => <span className="font-bold text-gray-600 mb-2 block">Semester Week {label}</span>}
          />
          <Legend iconType="circle" wrapperStyle={{ paddingTop: '25px' }} />
          <Line
            type="monotone"
            dataKey="planned_tasks"
            name="Planned Tasks"
            stroke="#9ca3af" 
            strokeWidth={2}
            strokeDasharray="6 6"
            dot={false}
            activeDot={{ r: 6, fill: '#9ca3af' }}
            connectNulls={true}
          />
          <Line
            type="monotone"
            dataKey="completed_tasks"
            name="Completed Tasks"
            stroke="#4f46e5" 
            strokeWidth={3}
            dot={{ fill: '#4f46e5', r: 4, strokeWidth: 0 }}
            activeDot={{ stroke: '#c7d2fe', strokeWidth: 4, r: 7 }}
            connectNulls={true}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
