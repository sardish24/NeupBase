'use client';
import React, { useMemo } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell
} from 'recharts';
export interface SubjectProgressData {
  subject_id: string;
  subject_name: string;
  topics_completed: number;
  topics_in_progress: number;
  topics_not_started: number;
  urgency_status: 'red' | 'amber' | 'green';
}
interface StackedProgressBarProps {
  data: SubjectProgressData[];
}
const URGENCY_PALETTE = {
  red: '#ef4444',   
  amber: '#f59e0b', 
  green: '#10b981', 
};
const STATE_PALETTE = {
  inProgress: '#93c5fd', 
  notStarted: '#e5e7eb', 
};
export default function StackedSubjectProgress({ data }: StackedProgressBarProps) {
  const formattedData = useMemo(() => {
    return data.map(item => ({
      ...item,
      displayName: item.subject_name.length > 18 
        ? `${item.subject_name.substring(0, 18)}...` 
        : item.subject_name
    }));
  }, [data]);
  return (
    <div className="w-full h-[400px]">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          layout="vertical"
          data={formattedData}
          margin={{ top: 20, right: 30, left: 40, bottom: 5 }}
        >
          <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#e5e7eb"/>
          <XAxis type="number" tick={{ fill: '#6b7280' }} />
          <YAxis dataKey="displayName" type="category" width={120} tick={{ fill: '#374151', fontSize: 13 }} />
          <Tooltip content={<CustomTooltip />} cursor={{ fill: '#f3f4f6' }} />
          <Legend wrapperStyle={{ paddingTop: '20px' }} />
          <Bar dataKey="topics_completed" name="Completed" stackId="a">
            {formattedData.map((entry, index) => (
              <Cell 
                key={`cell-completed-${index}`} 
                fill={URGENCY_PALETTE[entry.urgency_status]} 
              />
            ))}
          </Bar>
          <Bar dataKey="topics_in_progress" name="In Progress" stackId="a" fill={STATE_PALETTE.inProgress} />
          <Bar dataKey="topics_not_started" name="Not Started" stackId="a" fill={STATE_PALETTE.notStarted} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      // payload[0] corresponds to the first Bar (completed)
      const urgencyStatus = payload[0]?.payload?.urgency_status;
      const color = urgencyStatus === 'red' ? URGENCY_PALETTE.red : 
                    (urgencyStatus === 'green' ? URGENCY_PALETTE.green : URGENCY_PALETTE.amber);
      return (
        <div className="bg-white p-4 border border-gray-200 shadow-xl rounded-lg">
          <p className="font-semibold text-gray-900 border-b pb-2 mb-2">{label}</p>
          <div className="flex flex-col space-y-1">
            <span className="text-sm font-medium" style={{ color }}>
              Completed Topics: {payload[0]?.value}
            </span>
            <span className="text-sm text-blue-600">
              In Progress Topics: {payload[1]?.value}
            </span>
            <span className="text-sm text-gray-500">
              Unstarted Topics: {payload[2]?.value}
            </span>
          </div>
        </div>
      );
    }
    return null;
  };
