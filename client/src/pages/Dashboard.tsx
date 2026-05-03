import { useState } from 'react'
import { ArrowUp, ArrowDown, Download, FileJson, MapPin, Clock, Shield, TrendingUp } from 'lucide-react'
import { Line, LineChart, XAxis, YAxis, ReferenceLine, Tooltip, ResponsiveContainer, BarChart, Bar, Cell, PieChart, Pie } from 'recharts'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { ChartConfig, ChartContainer, ChartTooltip } from '@/components/ui/chart'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

/* ── Helpers ── */
function fmt(n: number) {
  if (n >= 1e7) return '₹' + (n / 1e7).toFixed(2) + ' Cr'
  if (n >= 1e5) return '₹' + (n / 1e5).toFixed(2) + ' L'
  return '₹' + n.toLocaleString('en-IN')
}

function downloadJSON(data: any, filename: string) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename; a.click(); URL.revokeObjectURL(a.href)
}

/* ── Sparkline data generator — creates a wavy curve from start→end ── */
function generateSparkline(startVal: number, endVal: number, points = 30) {
  const data = []
  for (let i = 0; i < points; i++) {
    const t = i / (points - 1)
    const base = startVal + (endVal - startVal) * t
    const wave = Math.sin(t * Math.PI * 4) * (endVal - startVal) * 0.15
    const noise = (Math.random() - 0.5) * (endVal - startVal) * 0.08
    data.push({ value: Math.round(base + wave + noise) })
  }
  return data
}

/* ── Chart configs ── */
const mainChartConfig = {
  market: { label: 'Market Value', color: 'var(--color-emerald-500)' },
  distress: { label: 'Distress Value', color: 'var(--color-amber-500)' },
  confidence: { label: 'Confidence', color: 'var(--color-sky-500)' },
  resale: { label: 'Resale Index', color: 'var(--color-teal-500)' },
} satisfies ChartConfig

const tooltipStyle = { background: '#0a0a0a', border: '1px solid #27272a', borderRadius: 10, fontSize: 11, padding: '8px 12px' }
const DONUT_COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#06b6d4', '#ec4899', '#8b5cf6', '#ef4444']

/* ══════════════════════════════════════════════════════════
   DASHBOARD COMPONENT
   ══════════════════════════════════════════════════════════ */
export default function Dashboard({ data: { result: d, debug, input } }: { data: any }) {
  const [showDebug, setShowDebug] = useState(false)
  const [selectedMetric, setSelectedMetric] = useState<string>('market')
  const geo = debug?.geo || {}
  const adj = debug?.adjustments || {}

  const confPct = Math.round(d.confidence_score * 100)
  const resaleLabel = d.resale_potential_index >= 80 ? 'Highly Liquid' : d.resale_potential_index >= 50 ? 'Moderate' : 'Illiquid'
  const resaleColor = d.resale_potential_index >= 80 ? '#10b981' : d.resale_potential_index >= 50 ? '#f59e0b' : '#ef4444'

  /* Sparkline cards data */
  const metricCards = [
    {
      key: 'market', label: 'Market Value', icon: TrendingUp,
      value: d.market_value_range[1], previousValue: d.market_value_range[0],
      format: fmt, color: 'var(--color-emerald-500)',
      sparkData: generateSparkline(d.market_value_range[0], d.market_value_range[1]),
    },
    {
      key: 'distress', label: 'Distress Value', icon: ArrowDown,
      value: d.distress_value_range[1], previousValue: d.distress_value_range[0],
      format: fmt, color: 'var(--color-amber-500)',
      sparkData: generateSparkline(d.distress_value_range[0], d.distress_value_range[1]),
    },
    {
      key: 'confidence', label: 'Confidence', icon: Shield,
      value: confPct, previousValue: 50,
      format: (v: number) => `${v}%`, color: 'var(--color-sky-500)',
      sparkData: generateSparkline(40, confPct),
    },
    {
      key: 'resale', label: 'Resale Potential', icon: Clock,
      value: d.resale_potential_index, previousValue: 50,
      format: (v: number) => `${v}/100`, color: 'var(--color-teal-500)',
      sparkData: generateSparkline(30, d.resale_potential_index),
    },
  ]

  /* Main interactive chart data — simulate a valuation timeline */
  const mainChartData = Array.from({ length: 24 }, (_, i) => {
    const month = new Date(2024, i).toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
    const marketBase = d.market_value_range[0] + (d.market_value_range[1] - d.market_value_range[0]) * (i / 23)
    const distressBase = d.distress_value_range[0] + (d.distress_value_range[1] - d.distress_value_range[0]) * (i / 23)
    const wave = Math.sin(i * 0.5) * (d.market_value_range[1] - d.market_value_range[0]) * 0.08
    return {
      date: month,
      market: Math.round(marketBase + wave),
      distress: Math.round(distressBase + wave * 0.6),
      confidence: Math.round(40 + (confPct - 40) * (i / 23) + Math.sin(i * 0.7) * 5),
      resale: Math.round(30 + (d.resale_potential_index - 30) * (i / 23) + Math.sin(i * 0.9) * 4),
    }
  })

  /* Adjustment donut */
  const adjEntries = Object.entries(adj)
    .map(([k, v]: [string, any]) => ({ name: k.replace(/_/g, ' '), value: Math.round(Math.abs(v as number) * 100) }))
    .filter(a => a.value > 0)

  /* Value comparison bars */
  const compData = [
    { name: 'Market High', value: d.market_value_range[1], color: '#34d399' },
    { name: 'Market Low', value: d.market_value_range[0], color: '#10b981' },
    { name: 'Distress High', value: d.distress_value_range[1], color: '#fbbf24' },
    { name: 'Distress Low', value: d.distress_value_range[0], color: '#f59e0b' },
  ]

  const confData = [
    { name: 'Confidence', value: confPct, fill: '#10b981' },
    { name: '', value: 100 - confPct, fill: '#1c1c1e' },
  ]

  const mapQuery = encodeURIComponent(geo.resolved_address || input.address || '')

  /* Custom tooltip for the main chart */
  const MainTooltip = ({ active, payload, label }: any) => {
    if (active && payload?.length) {
      const metric = metricCards.find(m => m.key === selectedMetric)
      const entry = payload[0]
      return (
        <div className="rounded-lg border border-border bg-popover p-3 shadow-sm shadow-black/5 min-w-[120px]">
          <div className="text-[10px] text-muted-foreground mb-1">{label}</div>
          <div className="flex items-center gap-2 text-sm">
            <div className="size-1.5 rounded-full" style={{ backgroundColor: entry.color || metric?.color }} />
            <span className="text-muted-foreground">{metric?.label}:</span>
            <span className="font-semibold text-popover-foreground font-mono">
              {metric?.key === 'confidence' || metric?.key === 'resale' ? `${entry.value}` : fmt(entry.value)}
            </span>
          </div>
        </div>
      )
    }
    return null
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] pt-20 pb-12 px-4 md:px-6 print:bg-white print:text-black print:pt-0">
      <div className="max-w-6xl mx-auto">

        {/* ── Header ── */}
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-6">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">Report Generated</span>
            </div>
            <h1 className="text-xl font-bold text-foreground tracking-tight">Valuation Report</h1>
            <p className="text-sm text-muted-foreground mt-0.5 font-mono">{input.address} · {input.property_type} · {input.sub_type}</p>
          </div>
          <div className="flex gap-2 print:hidden">
            <button onClick={() => window.print()} className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-border bg-card text-xs font-medium text-muted-foreground hover:text-foreground hover:border-zinc-600 transition cursor-pointer">
              <Download className="size-3.5" /> PDF
            </button>
            <button onClick={() => downloadJSON({ result: d, debug, input }, 'exitiq-report.json')} className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-border bg-card text-xs font-medium text-muted-foreground hover:text-foreground hover:border-zinc-600 transition cursor-pointer">
              <FileJson className="size-3.5" /> JSON
            </button>
          </div>
        </div>

        {/* ── Metrics Row (LineChart8-style sparkline cards) ── */}
        <Card className="mb-4">
          <CardHeader className="p-0">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
              {metricCards.map((m) => {
                const change = ((m.value - m.previousValue) / m.previousValue) * 100
                const isPositive = change >= 0
                return (
                  <button
                    key={m.key}
                    onClick={() => setSelectedMetric(m.key)}
                    className={cn(
                      'cursor-pointer flex-1 text-start p-4 border-b lg:border-b-0 lg:border-r last:border-r-0 last:border-b-0 border-border transition-all',
                      selectedMetric === m.key && 'bg-muted/50',
                    )}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm text-muted-foreground">{m.label}</span>
                      <Badge variant={isPositive ? 'success' : 'destructive'} appearance="outline" size="sm">
                        {isPositive ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />}
                        {Math.abs(change).toFixed(1)}%
                      </Badge>
                    </div>
                    <div className="text-2xl font-bold font-mono">{m.format(m.value)}</div>
                    <div className="text-xs text-muted-foreground mt-1">from {m.format(m.previousValue)}</div>
                  </button>
                )
              })}
            </div>
          </CardHeader>

          {/* ── Main Interactive Line Chart (LineChart6-style) ── */}
          <CardContent className="px-2.5 py-6">
            <ChartContainer config={mainChartConfig} className="h-80 w-full overflow-visible [&_.recharts-curve.recharts-tooltip-cursor]:stroke-initial">
              <LineChart data={mainChartData} margin={{ top: 20, right: 20, left: 5, bottom: 20 }} style={{ overflow: 'visible' }}>
                <defs>
                  <pattern id="dotGrid" x="0" y="0" width="20" height="20" patternUnits="userSpaceOnUse">
                    <circle cx="10" cy="10" r="1" fill="var(--input)" fillOpacity="1" />
                  </pattern>
                  <filter id="lineShadow" x="-100%" y="-100%" width="300%" height="300%">
                    <feDropShadow dx="4" dy="6" stdDeviation="25" floodColor={`${mainChartConfig[selectedMetric as keyof typeof mainChartConfig]?.color}60`} />
                  </filter>
                  <filter id="dotShadow" x="-50%" y="-50%" width="200%" height="200%">
                    <feDropShadow dx="2" dy="2" stdDeviation="3" floodColor="rgba(0,0,0,0.5)" />
                  </filter>
                </defs>
                <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} tickMargin={10} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} tickMargin={10} tickCount={6}
                  tickFormatter={(value) => {
                    const m = metricCards.find(mc => mc.key === selectedMetric)
                    if (selectedMetric === 'confidence' || selectedMetric === 'resale') return `${value}`
                    return value >= 1e7 ? (value / 1e7).toFixed(1) + 'Cr' : value >= 1e5 ? (value / 1e5).toFixed(0) + 'L' : String(value)
                  }}
                />
                <ChartTooltip content={<MainTooltip />} cursor={{ strokeDasharray: '3 3', stroke: '#52525a' }} />
                <rect x="60px" y="-20px" width="calc(100% - 75px)" height="calc(100% - 10px)" fill="url(#dotGrid)" style={{ pointerEvents: 'none' }} />
                <Line
                  type="monotone"
                  dataKey={selectedMetric}
                  stroke={mainChartConfig[selectedMetric as keyof typeof mainChartConfig]?.color}
                  strokeWidth={2}
                  filter="url(#lineShadow)"
                  dot={false}
                  activeDot={{ r: 6, fill: mainChartConfig[selectedMetric as keyof typeof mainChartConfig]?.color, stroke: 'white', strokeWidth: 2, filter: 'url(#dotShadow)' }}
                />
              </LineChart>
            </ChartContainer>
          </CardContent>
        </Card>

        {/* ── Sparkline Mini-Cards (LineChart8-style) ── */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          {compData.slice(0, 3).map((item, i) => {
            const sparkData = generateSparkline(item.value * 0.8, item.value, 40)
            return (
              <Card key={i}>
                <CardContent className="flex flex-col gap-4">
                  <div className="flex flex-col">
                    <h3 className="text-sm font-semibold text-foreground">{item.name}</h3>
                    <p className="text-xs text-muted-foreground">Value range endpoint</p>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="text-center">
                      <div className="text-base font-semibold text-foreground font-mono">{fmt(item.value * 0.8)}</div>
                      <div className="text-[10px] text-muted-foreground font-medium">Start</div>
                    </div>
                    <div className="flex-1 h-14 mx-4 relative">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={sparkData} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
                          <YAxis domain={['dataMin', 'dataMax']} hide />
                          <ReferenceLine y={item.value * 0.9} stroke="var(--input)" strokeWidth={1} strokeDasharray="3 3" />
                          <Tooltip
                            cursor={{ stroke: item.color, strokeWidth: 1, strokeDasharray: '2 2' }}
                            content={({ active, payload }) => {
                              if (active && payload?.length) {
                                return (
                                  <div className="bg-background/95 backdrop-blur-sm border border-border shadow-xl rounded-lg p-2 pointer-events-none z-50">
                                    <p className="text-xs font-semibold text-foreground">{fmt(payload[0].value as number)}</p>
                                  </div>
                                )
                              }
                              return null
                            }}
                          />
                          <Line type="monotone" dataKey="value" stroke={item.color} strokeWidth={2} dot={{ r: 0 }}
                            activeDot={{ r: 4, fill: item.color, stroke: 'white', strokeWidth: 2, filter: `drop-shadow(0 0 6px ${item.color})` }}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="text-center">
                      <div className="text-base font-semibold text-foreground font-mono">{fmt(item.value)}</div>
                      <div className="text-[10px] text-muted-foreground font-medium">End</div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>

        {/* ── Geo Banner ── */}
        {geo.enriched && (
          <Card className="mb-4">
            <CardContent>
              <div className="flex items-center gap-2 mb-3">
                <MapPin className="size-4 text-emerald-500" />
                <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Geocoded Location</span>
              </div>
              <p className="text-sm font-semibold text-foreground mb-3">{geo.resolved_address}</p>
              {geo.nearest_pois && (
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {Object.entries(geo.nearest_pois).map(([cat, info]: [string, any]) => (
                    <Badge key={cat} variant="outline" size="sm" className="font-mono">
                      {cat}: {info.name} ({info.distance_km}km)
                    </Badge>
                  ))}
                </div>
              )}
              {geo.scores && <GeoScores scores={geo.scores} />}
            </CardContent>
          </Card>
        )}

        {/* ── Charts + Map Row ── */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          {/* Value Comparison */}
          <Card>
            <CardContent>
              <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground mb-4">Value Ranges</div>
              <div className="h-52">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={compData} layout="vertical" margin={{ top: 0, right: 12, left: 4, bottom: 0 }} barGap={4}>
                    <XAxis type="number" tickFormatter={(v: number) => v >= 1e7 ? (v / 1e7).toFixed(1) + 'Cr' : v >= 1e5 ? (v / 1e5).toFixed(0) + 'L' : String(v)} stroke="#3f3f46" fontSize={10} tickLine={false} axisLine={false} />
                    <YAxis type="category" dataKey="name" stroke="#3f3f46" fontSize={10} width={80} tickLine={false} axisLine={false} />
                    <Tooltip formatter={(v: any) => fmt(v)} contentStyle={tooltipStyle} cursor={{ fill: 'rgba(255,255,255,0.02)' }} />
                    <Bar dataKey="value" radius={[0, 6, 6, 0]} barSize={18}>
                      {compData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* Adjustment Donut */}
          <Card>
            <CardContent>
              <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground mb-4">Adjustment Breakdown</div>
              <div className="h-52">
                {adjEntries.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={adjEntries} innerRadius={50} outerRadius={75} dataKey="value" paddingAngle={3} strokeWidth={0}>
                        {adjEntries.map((_, i) => <Cell key={i} fill={DONUT_COLORS[i % DONUT_COLORS.length]} />)}
                      </Pie>
                      <Tooltip contentStyle={tooltipStyle} formatter={(v: any, name: any) => [`${v}%`, name]} />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex items-center justify-center text-xs text-muted-foreground">No adjustment data</div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Map */}
          <Card className="overflow-hidden">
            <div className="p-5 pb-0">
              <div className="flex items-center gap-2 mb-3">
                <MapPin className="size-3.5 text-muted-foreground" />
                <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Property Location</span>
              </div>
            </div>
            <iframe className="w-full h-72 border-0" src={`https://www.google.com/maps?q=${mapQuery}&output=embed`} allowFullScreen loading="lazy" referrerPolicy="no-referrer-when-downgrade" title="Map"
              style={{ filter: 'invert(0.92) hue-rotate(180deg) saturate(0.3) brightness(0.8)' }}
            />
          </Card>

          {/* Timeline + Tags */}
          <Card>
            <CardContent className="flex flex-col gap-5">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <Clock className="size-3.5 text-muted-foreground" />
                  <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Time to Sell</span>
                </div>
                <div className="flex items-baseline gap-1">
                  <span className="text-3xl font-bold font-mono text-foreground">{d.estimated_time_to_sell_days[0]}–{d.estimated_time_to_sell_days[1]}</span>
                  <span className="text-sm text-muted-foreground font-medium">days</span>
                </div>
                <div className="mt-2 h-1.5 rounded-full bg-secondary overflow-hidden">
                  <div className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-sky-500 transition-all" style={{ width: `${Math.min(100, 100 - (d.estimated_time_to_sell_days[0] / 365) * 100)}%` }} />
                </div>
              </div>

              <div>
                <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground mb-2">Key Drivers</div>
                <div className="flex flex-wrap gap-1.5">
                  {d.key_drivers.map((t: string, i: number) => (
                    <Badge key={i} variant="success" appearance="outline" size="sm" className="font-mono">{t}</Badge>
                  ))}
                </div>
              </div>

              <div>
                <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground mb-2">Risk Flags</div>
                <div className="flex flex-wrap gap-1.5">
                  {d.risk_flags.length > 0
                    ? d.risk_flags.map((t: string, i: number) => (
                      <Badge key={i} variant="destructive" appearance="outline" size="sm" className="font-mono">{t}</Badge>
                    ))
                    : <span className="text-xs text-emerald-500/60 font-medium">✓ No significant risks</span>}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* ── Debug ── */}
        <div className="mt-4 print:hidden">
          <button onClick={() => setShowDebug(!showDebug)} className="px-4 py-2 rounded-lg border border-border bg-card text-[10px] font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground hover:border-zinc-600 transition cursor-pointer">
            {showDebug ? '▾ Hide' : '▸ Show'} Engine Internals
          </button>
          {showDebug && (
            <pre className="mt-3 p-5 rounded-xl border border-border bg-card font-mono text-[11px] text-muted-foreground overflow-auto max-h-80 leading-relaxed">{JSON.stringify(debug, null, 2)}</pre>
          )}
        </div>
      </div>
    </div>
  )
}

function GeoScores({ scores }: { scores: any }) {
  const items = [
    { label: 'Infrastructure', key: 'infra_score', color: '#3b82f6' },
    { label: 'Commercial', key: 'commercial_score', color: '#f59e0b' },
    { label: 'Livability', key: 'livability_score', color: '#10b981' },
    { label: 'Premium', key: 'location_premium', color: '#06b6d4' },
  ]
  return (
    <div className="space-y-1.5">
      {items.map(({ label, key, color }) => {
        const val = scores[key] != null ? (scores[key] * 100).toFixed(0) : null
        if (val === null) return null
        return (
          <div key={key} className="flex items-center gap-3">
            <span className="text-[10px] font-medium text-muted-foreground w-20">{label}</span>
            <div className="flex-1 h-1.5 rounded-full bg-secondary overflow-hidden">
              <div className="h-full rounded-full transition-all duration-700" style={{ width: val + '%', background: color }} />
            </div>
            <span className="text-[10px] font-mono font-semibold w-8 text-right" style={{ color }}>{val}%</span>
          </div>
        )
      })}
    </div>
  )
}
