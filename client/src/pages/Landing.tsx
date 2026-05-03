import { Link } from 'react-router-dom'
import { WebGLShader } from '@/components/ui/web-gl-shader'
import { ArrowRight } from 'lucide-react'

const FEATURES = [
  { num: '01', title: 'Range-Based Valuation', desc: 'Market & distress ranges anchored to circle rates with full adjustment transparency.' },
  { num: '02', title: 'Liquidity Scoring', desc: 'Resale potential index and time-to-sell calibrated by location and legal status.' },
  { num: '03', title: 'Geo Intelligence', desc: 'Real-time geocoding with POI density analysis feeding into valuation signals.' },
  { num: '04', title: 'Risk Detection', desc: 'False positive checks and confidence calibration that flag issues early.' },
  { num: '05', title: 'Exit Timeline', desc: 'Liquidation timeline adjusted for market activity and property characteristics.' },
  { num: '06', title: 'Multi-Floor Support', desc: 'Per-floor area inputs with footprint vs built-up area distinction.' },
]

const STATS = [
  { value: '7', label: 'Pipeline Stages' },
  { value: '12+', label: 'Feature Signals' },
  { value: '100%', label: 'Explainable' },
  { value: '<2s', label: 'Response Time' },
]

export default function Landing() {
  return (
    <div className="relative min-h-screen">
      {/* Light mode shader wrapper - invert colors to make it work on light bg */}
      <div className="fixed inset-0 opacity-[0.03] pointer-events-none mix-blend-difference invert"><WebGLShader /></div>
      <div className="fixed inset-0 pointer-events-none bg-gradient-to-b from-transparent via-transparent to-white/50" />

      <section className="relative z-10 flex flex-col items-center justify-center min-h-screen px-6 pt-12">
        <div className="max-w-3xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 mb-8 rounded-full border border-blue-200 bg-white/80 backdrop-blur-sm shadow-sm">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-500 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-blue-600" />
            </span>
            <span className="text-[11px] font-semibold tracking-wide text-blue-600 uppercase">Collateral Intelligence Engine</span>
          </div>
          <h1 className="text-[clamp(3rem,7vw,6rem)] font-extrabold leading-[0.95] tracking-[-0.04em] text-slate-900 mb-6 drop-shadow-sm">
            Exit<br /><span className="bg-gradient-to-r from-blue-600 via-blue-500 to-cyan-500 bg-clip-text text-transparent">Intelligence.</span>
          </h1>
          <p className="text-slate-600 text-base md:text-lg leading-relaxed max-w-md mx-auto mb-10 font-medium">
            Deterministic property valuation with liquidity-aware exit estimation. No black boxes.
          </p>
          <Link to="/valuate" className="inline-flex items-center gap-2 px-8 py-3.5 rounded-full bg-primary text-white font-semibold shadow-lg shadow-blue-500/30 hover:bg-blue-700 hover:scale-105 transition-all no-underline">
            Start Valuation <ArrowRight className="size-4" />
          </Link>
        </div>
        <div className="mt-20 w-full max-w-2xl mx-auto drop-shadow-xl shadow-blue-900/5">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-px rounded-2xl overflow-hidden border border-white/60 bg-slate-200/50">
            {STATS.map((s, i) => (
              <div key={i} className="bg-white/90 backdrop-blur-md px-4 py-6 text-center transition-all hover:bg-white">
                <div className="text-2xl font-bold text-slate-900 font-mono tracking-tight">{s.value}</div>
                <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-1.5">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="mt-16 mb-8 flex flex-col items-center gap-2 animate-bounce">
          <div className="w-px h-8 bg-gradient-to-b from-transparent to-slate-400" />
          <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-slate-400">Scroll</span>
        </div>
      </section>

      <section className="relative z-10 py-24 px-6 bg-white/40 backdrop-blur-sm border-y border-white/60">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center gap-3 mb-12">
            <div className="h-px flex-1 bg-slate-200" /><span className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-400">Capabilities</span><div className="h-px flex-1 bg-slate-200" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {FEATURES.map((f, i) => (
              <div key={i} className="group p-6 rounded-2xl border border-white bg-white/70 shadow-sm shadow-slate-200 hover:shadow-md hover:shadow-blue-900/5 hover:border-blue-100 transition-all duration-300">
                <div className="flex items-start gap-4">
                  <span className="text-[12px] font-mono font-bold text-blue-500 mt-0.5">{f.num}</span>
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 mb-1.5">{f.title}</h3>
                    <p className="text-xs text-slate-600 leading-relaxed font-medium">{f.desc}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="relative z-10 py-24 px-6 text-center">
        <h2 className="text-3xl font-extrabold text-slate-900 mb-4 tracking-tight">Ready to valuate?</h2>
        <p className="text-sm font-medium text-slate-600 mb-8 max-w-sm mx-auto">Enter property details and get range-based collateral intelligence in seconds.</p>
        <Link to="/valuate" className="inline-flex items-center gap-2 px-8 py-3.5 rounded-full bg-slate-900 text-white font-semibold shadow-lg hover:bg-slate-800 transition-all no-underline">
          Start Valuation <ArrowRight className="size-4" />
        </Link>
      </section>
      <footer className="relative z-10 py-8 text-center text-[11px] font-medium text-slate-400 bg-white/50 backdrop-blur-sm border-t border-white">ExitIQ — Collateral Valuation & Liquidity Engine</footer>
    </div>
  )
}
