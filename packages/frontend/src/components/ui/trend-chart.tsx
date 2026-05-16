import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

interface TrendDataPoint {
  date: string;
  passed: number;
  failed: number;
}

interface TrendChartProps {
  data: TrendDataPoint[];
}

export function TrendChart({ data }: TrendChartProps) {
  const hasData = data.some(d => d.passed > 0 || d.failed > 0);

  if (!hasData) {
    return (
      <div className="flex h-48 items-center justify-center text-sm text-zinc-600">
        暂无执行数据
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={200}>
      <AreaChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="colorPassed" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="colorFailed" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
        <XAxis
          dataKey="date"
          tick={{ fill: '#71717a', fontSize: 11 }}
          tickLine={{ stroke: '#27272a' }}
          axisLine={{ stroke: '#27272a' }}
        />
        <YAxis
          tick={{ fill: '#71717a', fontSize: 11 }}
          tickLine={{ stroke: '#27272a' }}
          axisLine={{ stroke: '#27272a' }}
          allowDecimals={false}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: '#18181b',
            border: '1px solid #27272a',
            borderRadius: '8px',
            color: '#f4f4f5',
            fontSize: '12px',
          }}
          labelStyle={{ color: '#a1a1aa', marginBottom: '4px' }}
        />
        <Area
          type="monotone"
          dataKey="passed"
          name="通过"
          stroke="#22c55e"
          strokeWidth={2}
          fill="url(#colorPassed)"
        />
        <Area
          type="monotone"
          dataKey="failed"
          name="失败"
          stroke="#ef4444"
          strokeWidth={2}
          fill="url(#colorFailed)"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
