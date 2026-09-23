import { Bar, BarChart, CartesianGrid, Cell, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

/** 검증된 범주형 팔레트 (dataviz 기준, 순서 고정) */
export const SERIES = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4'] as const
const GRID = 'color-mix(in oklch, var(--foreground) 10%, transparent)'
const TICK = { fontSize: 11, fill: 'var(--muted-foreground)' }
const TOOLTIP_STYLE = { fontSize: 12, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--popover)', color: 'var(--popover-foreground)' }

interface SeriesDef {
  key: string
  name: string
  color?: string
}

interface BarsChartProps {
  data: ReadonlyArray<object>
  xKey: string
  series: SeriesDef[]
  layout?: 'horizontal' | 'vertical'
  height?: number
  stacked?: boolean
  unit?: string
  highlightMax?: boolean
}

/** 단일/다중 시리즈 막대 차트. 축 하나, 얇은 마크, 툴팁, 2개 이상 시리즈면 범례 */
export function BarsChart({ data, xKey, series, layout = 'horizontal', height = 220, stacked, unit = '', highlightMax }: BarsChartProps) {
  const vertical = layout === 'vertical'
  const rows = data as ReadonlyArray<Record<string, unknown>>
  const maxVal = highlightMax && series.length === 1 ? Math.max(...rows.map((d) => Number(d[series[0].key] ?? 0))) : undefined
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={rows as Array<Record<string, unknown>>} layout={vertical ? 'vertical' : 'horizontal'} margin={{ top: 8, right: 12, left: vertical ? 8 : -16, bottom: 0 }} barCategoryGap={vertical ? 6 : '30%'}>
        <CartesianGrid stroke={GRID} vertical={vertical} horizontal={!vertical} />
        {vertical ? (
          <>
            <XAxis type="number" tick={TICK} axisLine={false} tickLine={false} allowDecimals={false} />
            <YAxis type="category" dataKey={xKey} tick={TICK} axisLine={false} tickLine={false} width={96} />
          </>
        ) : (
          <>
            <XAxis dataKey={xKey} tick={TICK} axisLine={false} tickLine={false} interval="preserveStartEnd" />
            <YAxis tick={TICK} axisLine={false} tickLine={false} allowDecimals={false} />
          </>
        )}
        <Tooltip cursor={{ fill: GRID }} contentStyle={TOOLTIP_STYLE} formatter={(v) => `${v}${unit}`} />
        {series.length > 1 && <Legend wrapperStyle={{ fontSize: 11 }} iconSize={8} />}
        {series.map((s, i) => (
          <Bar key={s.key} dataKey={s.key} name={s.name} stackId={stacked ? 'a' : undefined} fill={s.color ?? SERIES[i % SERIES.length]} radius={stacked ? 0 : vertical ? [0, 4, 4, 0] : [4, 4, 0, 0]} maxBarSize={vertical ? 14 : 28}>
            {maxVal !== undefined &&
              rows.map((d, j) => <Cell key={j} fill={Number(d[s.key] ?? 0) === maxVal ? SERIES[1] : (s.color ?? SERIES[0])} />)}
          </Bar>
        ))}
      </BarChart>
    </ResponsiveContainer>
  )
}
