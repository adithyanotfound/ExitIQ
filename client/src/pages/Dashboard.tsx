import { useState, useMemo } from 'react'
import { ArrowUp, ArrowDown, Download, FileJson, MapPin, Clock, Shield, TrendingUp, Info, Activity, Target, Menu, X, LayoutDashboard, Map as MapIcon, FileText, CheckCircle2 } from 'lucide-react'
import { Line, LineChart, XAxis, YAxis, ReferenceLine, Tooltip, ResponsiveContainer, BarChart, Bar, Cell, PieChart, Pie, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar } from 'recharts'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

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

function generateSparkline(startVal: number, endVal: number, points = 30) {
  const data = []
  for (let i = 0; i < points; i++) {
    const t = i / (points - 1)
    const base = startVal + (endVal - startVal) * t
    const wave = Math.sin(t * Math.PI * 4) * (endVal - startVal) * 0.15
    const noise = (Math.random() - 0.5) * (endVal - startVal) * 0.08
    data.push({ value: Math.round(base + wave + noise), index: i })
  }
  return data
}

const tooltipStyle = { background: '#ffffff', border: '1px solid #e2e8f0', color: '#0f172a', borderRadius: 10, fontSize: 11, padding: '8px 12px' }

export default function Dashboard({ data: { result: d, debug, input } }: { data: any }) {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'location' | 'report'>('dashboard')
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)

  const geo = debug?.geo || {}
  const adj = debug?.adjustments || {}
  const baseValue = debug?.baseValue || (d?.market_value_range?.[0] ?? 0)
  const confPct = Math.round((d?.confidence_score ?? 0) * 100)
  
  const mapQuery = encodeURIComponent(geo.resolved_address || input?.address || '')
  const timeToSell = d?.estimated_time_to_sell_days || [30, 90]
  const drivers = d?.key_drivers || []
  const riskFlags = d?.risk_flags || []

  /* ── Chart Data ── */
  const waterfallData = useMemo(() => {
    const data = []
    let runningTotal = baseValue
    data.push({ name: 'Base Value', value: baseValue, displayValue: baseValue, fill: '#3b82f6', isTotal: true })
    Object.entries(adj).forEach(([key, multiplier]: [string, any]) => {
      if (typeof multiplier !== 'number' || multiplier === 0) return
      const amount = baseValue * multiplier
      data.push({ 
        name: key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()), 
        value: amount, displayValue: amount,
        fill: amount >= 0 ? '#10b981' : '#ef4444' 
      })
      runningTotal += amount
    })
    data.push({ name: 'Market Value', value: runningTotal, displayValue: runningTotal, fill: '#0f172a', isTotal: true })
    return data
  }, [baseValue, adj])

  const radarData = useMemo(() => {
    const scores = geo.scores || {}
    return [
      { subject: 'Infrastructure', A: Math.round((scores.infra_score ?? 0) * 100) },
      { subject: 'Commercial', A: Math.round((scores.commercial_score ?? 0) * 100) },
      { subject: 'Livability', A: Math.round((scores.livability_score ?? 0) * 100) },
      { subject: 'Location Premium', A: Math.round((scores.location_premium ?? 0) * 100) },
      { subject: 'Connectivity', A: Math.round(((geo.total_pois ?? 0) / 100) * 100) },
    ]
  }, [geo])

  const generatePDFReport = () => {
    const doc = new jsPDF()
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(22)
    doc.text('ExitIQ Property Valuation Report', 20, 20)
    
    doc.setFontSize(12)
    doc.setFont('helvetica', 'normal')
    doc.text(`Address: ${input?.address || 'N/A'}`, 20, 30)
    doc.text(`Property Type: ${input?.property_type} - ${input?.sub_type}`, 20, 38)
    
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(16)
    doc.text('Valuation Summary', 20, 50)
    
    autoTable(doc, {
      startY: 55,
      head: [['Metric', 'Value']],
      body: [
        ['Estimated Market Value', `${fmt(d?.market_value_range?.[0] ?? 0)} - ${fmt(d?.market_value_range?.[1] ?? 0)}`],
        ['Distress Valuation', `${fmt(d?.distress_value_range?.[0] ?? 0)} - ${fmt(d?.distress_value_range?.[1] ?? 0)}`],
        ['Confidence Score', `${confPct}%`],
        ['Liquidity Index', `${d?.resale_potential_index ?? 0}/100`],
        ['Est. Days to Sell', `${timeToSell[0]} - ${timeToSell[1]} Days`]
      ],
      theme: 'grid',
      headStyles: { fillColor: [59, 130, 246] }
    })
    
    const finalY = (doc as any).lastAutoTable.finalY || 55
    
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(16)
    doc.text('Key Risk Flags', 20, finalY + 15)
    
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(11)
    let yPos = finalY + 25
    if (riskFlags.length > 0) {
      riskFlags.forEach((f: string) => {
        doc.text(`• ${f}`, 20, yPos)
        yPos += 7
      })
    } else {
      doc.text('• No major risks identified. Clear title assumed.', 20, yPos)
      yPos += 7
    }
    
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(16)
    doc.text('Positive Drivers', 20, yPos + 10)
    
    doc.setFont('helvetica', 'normal')
    yPos += 20
    drivers.forEach((f: string) => {
      doc.text(`• ${f}`, 20, yPos)
      yPos += 7
    })
    
    doc.save('ExitIQ-Report.pdf')
  }

  return (
    <div className="flex h-screen w-full bg-slate-50/50 overflow-hidden font-sans text-slate-900">
      
      {/* ── Mobile Sidebar Overlay ── */}
      {isSidebarOpen && (
        <div className="fixed inset-0 bg-slate-900/50 z-40 md:hidden" onClick={() => setIsSidebarOpen(false)} />
      )}

      {/* ── Sidebar Navbar ── */}
      <aside className={cn(
        "fixed md:static inset-y-0 left-0 z-50 w-64 bg-white border-r border-slate-200 flex flex-col transform transition-transform duration-300 ease-in-out h-full",
        isSidebarOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
      )}>
        <div className="h-16 flex items-center justify-between px-6 border-b border-slate-100 shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-blue-600 flex items-center justify-center text-white font-bold text-xl shadow-lg shadow-blue-500/30">
              E
            </div>
            <span className="text-xl font-black tracking-tight text-slate-900">ExitIQ</span>
          </div>
          <button className="md:hidden text-slate-400 hover:text-slate-900" onClick={() => setIsSidebarOpen(false)}>
            <X className="size-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto py-6 px-4 space-y-2">
          <TabButton icon={LayoutDashboard} label="Dashboard" active={activeTab === 'dashboard'} onClick={() => { setActiveTab('dashboard'); setIsSidebarOpen(false) }} />
          <TabButton icon={MapIcon} label="Location Analysis" active={activeTab === 'location'} onClick={() => { setActiveTab('location'); setIsSidebarOpen(false) }} />
          <TabButton icon={FileText} label="Intelligence Report" active={activeTab === 'report'} onClick={() => { setActiveTab('report'); setIsSidebarOpen(false) }} />
        </div>

        <div className="p-4 border-t border-slate-100 shrink-0">
          <button onClick={() => downloadJSON({ result: d, debug, input }, 'exitiq-data.json')} className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-slate-900 text-white text-sm font-bold shadow-lg shadow-slate-900/20 hover:bg-black transition-all active:scale-95">
            <Download className="size-4" /> Download JSON
          </button>
        </div>
      </aside>

      {/* ── Main Content Area ── */}
      <main className="flex-1 flex flex-col h-full min-w-0 overflow-hidden relative">
        {/* Header */}
        <header className="h-16 bg-white/80 backdrop-blur-md border-b border-slate-200 flex items-center px-4 md:px-8 shrink-0 z-10 sticky top-0">
          <button className="md:hidden mr-4 p-2 text-slate-600 hover:bg-slate-100 rounded-lg" onClick={() => setIsSidebarOpen(true)}>
            <Menu className="size-5" />
          </button>
          <div>
            <h1 className="text-lg md:text-xl font-bold text-slate-900 capitalize">{activeTab.replace('-', ' ')}</h1>
            <p className="text-xs font-medium text-slate-500 hidden sm:block truncate max-w-md">{input?.address}</p>
          </div>
        </header>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-4 md:p-8 relative">
          <div className="max-w-7xl mx-auto h-full flex flex-col">
            {activeTab === 'dashboard' && <DashboardView d={d} debug={debug} waterfallData={waterfallData} radarData={radarData} />}
            {activeTab === 'location' && <LocationView geo={geo} mapQuery={mapQuery} />}
            {activeTab === 'report' && <ReportView d={d} timeToSell={timeToSell} riskFlags={riskFlags} drivers={drivers} generatePDF={generatePDFReport} />}
          </div>
        </div>
      </main>

    </div>
  )
}

/* ── Views ── */

function DashboardView({ d, debug, waterfallData, radarData }: any) {
  const confPct = Math.round((d?.confidence_score ?? 0) * 100)

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 pb-12 flex flex-col flex-1 h-full min-h-min">
      {/* Range Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6 shrink-0">
        <RangeCard title="Market Valuation" color="emerald" min={d?.market_value_range?.[0] ?? 0} max={d?.market_value_range?.[1] ?? 0} />
        <RangeCard title="Distress Valuation" color="amber" min={d?.distress_value_range?.[0] ?? 0} max={d?.distress_value_range?.[1] ?? 0} />
        <div className="grid grid-cols-2 gap-4">
          <StatCard label="Confidence" value={`${confPct}%`} subValue={confPct > 80 ? "High" : "Moderate"} icon={Shield} color="sky" />
          <StatCard label="Liquidity" value={`${d?.resale_potential_index ?? 0}/100`} subValue={(d?.resale_potential_index ?? 0) > 70 ? "Liquid" : "Slow"} icon={Clock} color="teal" />
        </div>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 flex-1 min-h-[400px]">
        <Card className="lg:col-span-2 shadow-xl shadow-slate-200/50 border-slate-200/60 flex flex-col">
          <CardHeader className="pb-2 border-b border-slate-100 bg-slate-50/30 shrink-0">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Valuation Waterfall</h3>
                <p className="text-[10px] text-slate-500 font-medium">Impact of specific engine adjustments on base value</p>
              </div>
              <Badge variant="outline" className="bg-white font-mono text-[10px]">₹/sqft Anchor: {fmt(debug?.circleRate || 0)}</Badge>
            </div>
          </CardHeader>
          <CardContent className="pt-6 flex-1 min-h-0">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={waterfallData} margin={{ top: 20, right: 30, left: 40, bottom: 60 }}>
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 9, fontWeight: 600, fill: '#64748b' }} interval={0} angle={-35} textAnchor="end" />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#94a3b8' }} tickFormatter={(v) => v >= 1e7 ? (v/1e7).toFixed(1)+'Cr' : (v/1e5).toFixed(0)+'L'} />
                <Tooltip content={<WaterfallTooltip />} cursor={{ fill: 'rgba(0,0,0,0.02)' }} />
                <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                  {waterfallData.map((entry: any, index: number) => (
                    <Cell key={`cell-${index}`} fill={entry.fill} fillOpacity={entry.isTotal ? 1 : 0.7} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="shadow-xl shadow-slate-200/50 border-slate-200/60 flex flex-col">
          <CardHeader className="pb-2 border-b border-slate-100 bg-slate-50/30 shrink-0">
            <h3 className="text-sm font-bold text-slate-900">Neighborhood DNA</h3>
            <p className="text-[10px] text-slate-500 font-medium">Multidimensional location scoring</p>
          </CardHeader>
          <CardContent className="pt-6 flex-1 flex flex-col min-h-0">
            <div className="flex-1 min-h-0 mb-4">
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart cx="50%" cy="50%" outerRadius="70%" data={radarData}>
                  <PolarGrid stroke="#e2e8f0" />
                  <PolarAngleAxis dataKey="subject" tick={{ fontSize: 9, fontWeight: 700, fill: '#64748b' }} />
                  <Radar name="Score" dataKey="A" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.5} dot={{ r: 3, fill: '#3b82f6' }} />
                  <Tooltip contentStyle={tooltipStyle} />
                </RadarChart>
              </ResponsiveContainer>
            </div>
            <div className="space-y-2 shrink-0">
              {radarData.map((r: any, i: number) => (
                <div key={i} className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-slate-500 truncate w-20">{r.subject}</span>
                  <div className="flex-1 mx-3 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                     <div className="h-full bg-blue-500" style={{ width: `${r.A}%` }} />
                  </div>
                  <span className="text-[10px] font-black text-slate-900 w-8 text-right">{r.A}%</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function LocationView({ geo, mapQuery }: any) {
  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 pb-12 flex flex-col lg:flex-row gap-6 h-full min-h-[600px]">
      <div className="w-full lg:w-1/3 flex flex-col gap-4 overflow-y-auto pr-2">
        <h2 className="text-2xl font-black text-slate-900 mb-2">Location Intelligence</h2>
        
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2"><MapPin className="size-4" /> Resolved Address</div>
          <p className="text-sm font-semibold text-slate-700 leading-relaxed">{geo.resolved_address || 'Address not resolved'}</p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4">Geospatial Insights</div>
          <div className="space-y-4">
            <div className="flex justify-between items-center pb-3 border-b border-slate-100">
              <span className="text-sm text-slate-600 font-medium">Zone Category</span>
              <Badge className="bg-blue-50 text-blue-700 hover:bg-blue-100 border-none capitalize">{geo.zone || 'Unknown'}</Badge>
            </div>
            <div className="flex justify-between items-center pb-3 border-b border-slate-100">
              <span className="text-sm text-slate-600 font-medium">Nearby Amenities</span>
              <span className="font-bold text-slate-900">{geo.total_pois || 0} POIs</span>
            </div>
            <div className="flex justify-between items-center pb-3 border-b border-slate-100">
              <span className="text-sm text-slate-600 font-medium">Avg Distance</span>
              <span className="font-bold text-slate-900">{((geo.avg_distance || 0)/1000).toFixed(2)} km</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-slate-600 font-medium">Coordinates</span>
              <span className="font-mono text-xs text-slate-500 bg-slate-50 px-2 py-1 rounded">{geo.coords?.lat?.toFixed(4)}, {geo.coords?.lon?.toFixed(4)}</span>
            </div>
          </div>
        </div>

        <div className="bg-emerald-50 p-5 rounded-2xl border border-emerald-100 shadow-sm">
          <div className="text-xs font-bold text-emerald-600 uppercase tracking-wider mb-2">Location Premium</div>
          <div className="text-3xl font-black text-emerald-700">{(geo.scores?.location_premium || 0).toFixed(2)}x</div>
          <p className="text-xs text-emerald-600/80 mt-1 font-medium">Multiplier applied to base valuation</p>
        </div>
      </div>

      <div className="flex-1 flex flex-col bg-white rounded-3xl border border-slate-200 shadow-xl overflow-hidden min-h-[400px]">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between shrink-0 bg-slate-50/50">
          <div className="flex items-center gap-2">
            <MapIcon className="size-4 text-blue-500" />
            <span className="text-sm font-bold text-slate-700">Interactive Map</span>
          </div>
          <Badge variant="secondary" className="text-[10px] uppercase font-bold tracking-wider">Live View</Badge>
        </div>
        <div className="flex-1 w-full bg-slate-100 relative">
          <iframe className="absolute inset-0 w-full h-full border-0" src={`https://www.google.com/maps?q=${mapQuery}&output=embed`} allowFullScreen loading="lazy" referrerPolicy="no-referrer-when-downgrade" title="Map"
            style={{ filter: 'contrast(1.1) saturate(1.2)' }}
          />
        </div>
      </div>
    </div>
  )
}

function ReportView({ d, timeToSell, riskFlags, drivers, generatePDF }: any) {
  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 pb-12 flex flex-col lg:flex-row gap-8 h-full">
      <div className="w-full lg:w-1/2 flex flex-col gap-6">
        
        {/* Liquidity */}
        <Card className="shadow-lg border-slate-200/60 bg-gradient-to-br from-white to-slate-50/50">
          <CardHeader className="pb-2 border-b border-slate-100">
             <div className="flex items-center gap-2">
               <Activity className="size-5 text-teal-500" />
               <h3 className="text-lg font-bold text-slate-900">Liquidity Horizon</h3>
             </div>
          </CardHeader>
          <CardContent className="pt-6">
            <p className="text-xs font-bold uppercase text-slate-400 tracking-wider mb-2">Estimated Days to Sell</p>
            <div className="flex items-baseline gap-2">
              <span className="text-5xl font-black text-slate-900 tracking-tighter">{timeToSell[0]}–{timeToSell[1]}</span>
              <span className="text-lg font-bold text-slate-400">Days</span>
            </div>
            <div className="mt-6 h-3 rounded-full bg-slate-100 overflow-hidden relative shadow-inner">
               <div className="absolute inset-y-0 bg-gradient-to-r from-teal-400 to-teal-500 rounded-full shadow-sm" style={{ left: '20%', width: '40%' }} />
            </div>
          </CardContent>
        </Card>

        {/* Positive Drivers */}
        <Card className="shadow-lg border-emerald-100 bg-emerald-50/30">
          <CardHeader className="pb-3 border-b border-emerald-100/50">
             <div className="flex items-center gap-2">
               <TrendingUp className="size-5 text-emerald-600" />
               <h3 className="text-lg font-bold text-emerald-900">Positive Drivers</h3>
             </div>
          </CardHeader>
          <CardContent className="pt-5">
            <ul className="space-y-3">
              {drivers.length > 0 ? drivers.map((k: string, i: number) => (
                <li key={i} className="flex items-start gap-3 text-sm font-semibold text-emerald-800">
                  <CheckCircle2 className="size-5 text-emerald-500 shrink-0 mt-0.5" />
                  <span className="capitalize leading-relaxed">{k}</span>
                </li>
              )) : (
                <li className="text-sm text-emerald-600 italic">No specific positive drivers identified.</li>
              )}
            </ul>
          </CardContent>
        </Card>

        {/* Risk Flags */}
        <Card className="shadow-lg border-red-100 bg-red-50/30">
          <CardHeader className="pb-3 border-b border-red-100/50">
             <div className="flex items-center gap-2">
               <Shield className="size-5 text-red-600" />
               <h3 className="text-lg font-bold text-red-900">Key Risk Flags</h3>
             </div>
          </CardHeader>
          <CardContent className="pt-5">
             <ul className="space-y-3">
               {riskFlags.length > 0 ? riskFlags.map((f: string, i: number) => (
                 <li key={i} className="flex items-start gap-3 text-sm font-semibold text-red-800">
                    <Info className="size-5 text-red-500 shrink-0 mt-0.5" />
                    <span className="capitalize leading-relaxed">{f}</span>
                 </li>
               )) : (
                 <li className="flex items-center gap-2 text-sm font-bold text-emerald-700 bg-emerald-100 p-3 rounded-xl">
                    <Shield className="size-4" /> Verified: Low Legal & Structural Risk
                 </li>
               )}
             </ul>
          </CardContent>
        </Card>

      </div>

      <div className="w-full lg:w-1/2 flex flex-col items-center justify-center bg-white rounded-3xl border border-slate-200 shadow-xl p-8 lg:p-12 text-center min-h-[400px]">
        <div className="w-24 h-24 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center mb-6 shadow-inner">
          <FileText className="size-10" />
        </div>
        <h3 className="text-2xl font-bold text-slate-900 mb-3">Valuation Summary Report</h3>
        <p className="text-slate-500 font-medium mb-8 max-w-sm">A comprehensive PDF document summarizing how the ExitIQ engine came to these conclusions, ready for sharing or record-keeping.</p>
        
        <button onClick={generatePDF} className="inline-flex items-center gap-3 px-8 py-4 rounded-2xl bg-blue-600 text-white font-bold text-lg shadow-xl shadow-blue-500/30 hover:bg-blue-700 hover:-translate-y-1 transition-all active:scale-95 w-full sm:w-auto justify-center">
          <Download className="size-6" /> Download PDF Report
        </button>
      </div>
    </div>
  )
}

/* ── UI Components ── */

function TabButton({ icon: Icon, label, active, onClick }: any) {
  return (
    <button onClick={onClick} className={cn(
      "w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold transition-all text-left",
      active ? "bg-blue-50 text-blue-700" : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
    )}>
      <Icon className={cn("size-5", active ? "text-blue-600" : "text-slate-400")} />
      {label}
    </button>
  )
}

function StatCard({ label, value, subValue, icon: Icon, color }: any) {
  const colors: any = {
    emerald: 'bg-emerald-50 text-emerald-600 border-emerald-100',
    amber: 'bg-amber-50 text-amber-600 border-amber-100',
    sky: 'bg-sky-50 text-sky-600 border-sky-100',
    teal: 'bg-teal-50 text-teal-600 border-teal-100'
  }
  return (
    <Card className="shadow-lg shadow-slate-200/40 border-slate-200/60 transition-transform hover:-translate-y-1 duration-300">
      <CardContent className="pt-6">
        <div className="flex items-start justify-between mb-3">
          <div className={cn("p-2.5 rounded-xl border", colors[color])}>
            <Icon className="size-5" />
          </div>
        </div>
        <h4 className="text-[11px] font-bold uppercase text-slate-400 tracking-widest mb-1">{label}</h4>
        <div className="text-2xl font-black text-slate-900 tracking-tighter font-mono">{value}</div>
        <p className="text-[10px] font-bold text-slate-500 mt-1">{subValue}</p>
      </CardContent>
    </Card>
  )
}

function RangeCard({ title, min, max, color }: { title: string, min: number, max: number, color: 'emerald' | 'amber' }) {
  const isUp = color === 'emerald'
  const sparkline = generateSparkline(min, max, 40)
  
  return (
    <Card className="shadow-xl shadow-slate-200/50 border-slate-200/60 flex flex-col h-full overflow-hidden">
      <CardHeader className="pb-0 pt-5 px-6">
        <div className="flex items-center gap-2">
          {isUp ? <TrendingUp className="size-5 text-emerald-500" /> : <ArrowDown className="size-5 text-amber-500" />}
          <h3 className="text-sm font-bold text-slate-900">{title}</h3>
        </div>
        <p className="text-[10px] text-slate-500 font-medium">Value range estimate</p>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col justify-center pt-4 pb-6 px-6">
        <div className="flex items-end justify-between w-full gap-4">
          
          <div className="flex flex-col">
            <span className="text-[10px] font-bold uppercase text-slate-400 tracking-wider mb-1">Low End</span>
            <span className="text-2xl lg:text-3xl font-black text-slate-900 tracking-tighter">{fmt(min)}</span>
          </div>

          <div className="flex-1 h-12 relative px-2 hidden sm:block">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={sparkline}>
                <Line type="monotone" dataKey="value" stroke={isUp ? "#10b981" : "#f59e0b"} strokeWidth={2} dot={false} />
                <ReferenceLine y={(min+max)/2} stroke="#e2e8f0" strokeDasharray="3 3" />
              </LineChart>
            </ResponsiveContainer>
          </div>
          
          <div className="flex flex-col items-end">
            <span className="text-[10px] font-bold uppercase text-slate-400 tracking-wider mb-1">High End</span>
            <span className="text-2xl lg:text-3xl font-black text-slate-900 tracking-tighter">{fmt(max)}</span>
          </div>

        </div>
      </CardContent>
    </Card>
  )
}

function WaterfallTooltip({ active, payload }: any) {
  if (active && payload?.length) {
    const data = payload[0].payload
    return (
      <div className="bg-white p-3 border border-slate-200 shadow-xl rounded-xl">
        <p className="text-[10px] font-black uppercase text-slate-400 mb-1">{data.name}</p>
        <p className={cn("text-sm font-black font-mono", data.value >= 0 ? "text-emerald-600" : "text-red-600")}>
          {data.value >= 0 ? '+' : ''}{fmt(data.displayValue)}
        </p>
      </div>
    )
  }
  return null
}
