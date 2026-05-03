import { Link } from 'react-router-dom'
import { WebGLShader } from '@/components/ui/web-gl-shader'
import { LiquidButton } from '@/components/ui/liquid-glass-button'

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
    <div className="relative min-h-screen bg-black">
      <div className="fixed inset-0 opacity-15 pointer-events-none"><WebGLShader /></div>
      <div className="fixed inset-0 pointer-events-none bg-gradient-to-b from-black/60 via-transparent to-black" />

      <section className="relative z-10 flex flex-col items-center justify-center min-h-screen px-6 pt-20">
        <div className="max-w-3xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 mb-8 rounded-full border border-zinc-800 bg-zinc-950/60 backdrop-blur-sm">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
            </span>
            <span className="text-[11px] font-medium tracking-wide text-zinc-400 uppercase">Collateral Intelligence Engine</span>
          </div>
          <h1 className="text-[clamp(3rem,7vw,6rem)] font-extrabold leading-[0.95] tracking-[-0.04em] text-white mb-6">
            Exit<br /><span className="bg-gradient-to-r from-white via-zinc-300 to-zinc-600 bg-clip-text text-transparent">Intelligence.</span>
          </h1>
          <p className="text-zinc-500 text-base md:text-lg leading-relaxed max-w-md mx-auto mb-10">
            Deterministic property valuation with liquidity-aware exit estimation. No black boxes.
          </p>
          <Link to="/valuate">
            <LiquidButton className="text-white border border-zinc-700 rounded-full" size="xl">Start Valuation →</LiquidButton>
          </Link>
        </div>
        <div className="mt-20 w-full max-w-2xl mx-auto">
          <div className="grid grid-cols-4 gap-px rounded-xl overflow-hidden border border-zinc-800/60 bg-zinc-800/30">
            {STATS.map((s, i) => (
              <div key={i} className="bg-zinc-950/80 backdrop-blur-sm px-4 py-5 text-center">
                <div className="text-xl font-bold text-white font-mono tracking-tight">{s.value}</div>
                <div className="text-[10px] font-medium text-zinc-600 uppercase tracking-widest mt-1">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="mt-16 mb-8 flex flex-col items-center gap-2 animate-bounce">
          <div className="w-px h-8 bg-gradient-to-b from-transparent to-zinc-700" />
          <span className="text-[9px] uppercase tracking-[0.2em] text-zinc-700">Scroll</span>
        </div>
      </section>

      <section className="relative z-10 py-24 px-6">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center gap-3 mb-12">
            <div className="h-px flex-1 bg-zinc-800" /><span className="text-[10px] font-semibold uppercase tracking-[0.15em] text-zinc-600">Capabilities</span><div className="h-px flex-1 bg-zinc-800" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {FEATURES.map((f, i) => (
              <div key={i} className="group p-5 rounded-xl border border-zinc-800/50 bg-zinc-950/50 backdrop-blur-sm hover:border-zinc-700/60 hover:bg-zinc-900/30 transition-all duration-300">
                <div className="flex items-start gap-4">
                  <span className="text-[11px] font-mono font-bold text-zinc-700 mt-0.5">{f.num}</span>
                  <div>
                    <h3 className="text-sm font-semibold text-zinc-200 mb-1 group-hover:text-white transition-colors">{f.title}</h3>
                    <p className="text-xs text-zinc-600 leading-relaxed group-hover:text-zinc-500 transition-colors">{f.desc}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="relative z-10 py-20 px-6 text-center">
        <h2 className="text-2xl font-bold text-white mb-3 tracking-tight">Ready to valuate?</h2>
        <p className="text-sm text-zinc-600 mb-8 max-w-sm mx-auto">Enter property details and get range-based collateral intelligence in seconds.</p>
        <Link to="/valuate" className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-white text-black text-sm font-semibold hover:bg-zinc-200 transition-colors no-underline">Start Valuation →</Link>
      </section>
      <footer className="relative z-10 py-6 text-center text-[11px] text-zinc-800 border-t border-zinc-900">ExitIQ — Collateral Valuation & Liquidity Engine</footer>
    </div>
  )
}
