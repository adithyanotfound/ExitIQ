import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { MapPin, Building2, Ruler, Layers, Users, Scale, ChevronRight, ChevronLeft, Loader2 } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'

const SUBTYPES = ['Apartment','Detached House','Plot','Shop','Warehouse','Office','Penthouse','Studio','Duplex','Farmhouse']

interface FormProps { onResult: (data: any) => void }

const STEPS = [
  { id: 'location', label: 'Location', icon: MapPin },
  { id: 'classification', label: 'Type', icon: Building2 },
  { id: 'dimensions', label: 'Size', icon: Ruler },
  { id: 'structure', label: 'Structure', icon: Layers },
  { id: 'occupancy', label: 'Occupancy', icon: Users },
  { id: 'legal', label: 'Legal', icon: Scale },
]

/* Shared input styles */
const inputBase = "w-full bg-transparent border-0 border-b border-zinc-800 px-0 py-3 text-sm text-foreground placeholder:text-zinc-700 focus:border-foreground focus:outline-none transition-colors"
const selectBase = "w-full bg-transparent border-0 border-b border-zinc-800 px-0 py-3 text-sm text-foreground focus:border-foreground focus:outline-none transition-colors appearance-none cursor-pointer"

export default function Form({ onResult }: FormProps) {
  const [step, setStep] = useState(0)
  const [loading, setLoading] = useState(false)
  const [errors, setErrors] = useState<string[] | null>(null)
  const formRef = useRef<HTMLFormElement>(null)
  const navigate = useNavigate()

  const v = (id: string) => (formRef.current?.querySelector<HTMLInputElement>(`#${id}`)?.value || '').trim()
  const n = (id: string) => parseFloat(formRef.current?.querySelector<HTMLInputElement>(`#${id}`)?.value || '') || 0
  const c = (id: string) => formRef.current?.querySelector<HTMLInputElement>(`#${id}`)?.checked || false

  const canProceed = () => {
    if (step === 0) return true // address is filled on submit
    return true
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (step < STEPS.length - 1) { setStep(s => s + 1); return }
    setLoading(true); setErrors(null)
    const payload = {
      address: v('address'), lat_long: { lat: n('lat') || null, lng: n('lng') || null },
      property_type: v('ptype'), sub_type: v('stype'),
      size: { carpet_area_sqft: n('carpet'), builtup_area_sqft: n('builtup'), land_parcel_sqft: n('land') },
      age_years: n('age'), floor_from: n('ffrom'), floor_to: n('fto') || n('ffrom'),
      total_building_floors: n('tfloors') || null,
      accessibility: { lift: c('lift'), ground_floor_access: c('gaccess') },
      occupancy_status: v('occ'), rent_monthly: n('rent'),
      legal_status: { freehold: c('freehold'), clear_title: c('ctitle'), leasehold: c('leasehold') },
      images: [],
    }
    try {
      const res = await fetch('/api/valuate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      const json = await res.json()
      if (!json.success) { setErrors(json.errors); setStep(0) }
      else { onResult({ result: json.data, debug: json._debug, input: payload }); navigate('/dashboard') }
    } catch { setErrors(['Network error — is the backend server running?']) }
    finally { setLoading(false) }
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center px-4 py-24">
      <div className="w-full max-w-xl">
        {/* Header */}
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Property Valuation</h1>
          <p className="text-sm text-muted-foreground mt-1">Fill in the details to generate your report</p>
        </div>

        {/* Step Indicator */}
        <div className="flex items-center justify-center gap-1 mb-8">
          {STEPS.map((s, i) => {
            const Icon = s.icon
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => setStep(i)}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-medium transition-all cursor-pointer',
                  i === step
                    ? 'bg-foreground text-background'
                    : i < step
                    ? 'bg-zinc-800 text-zinc-300'
                    : 'bg-transparent text-zinc-600 hover:text-zinc-400'
                )}
              >
                <Icon className="size-3" />
                <span className="hidden sm:inline">{s.label}</span>
              </button>
            )
          })}
        </div>

        {/* Errors */}
        {errors && (
          <Card className="mb-4 border-red-500/20 bg-red-500/5">
            <CardContent className="py-3">
              {errors.map((e, i) => <p key={i} className="text-xs text-red-400">{e}</p>)}
            </CardContent>
          </Card>
        )}

        {/* Form Card */}
        <Card>
          <form ref={formRef} onSubmit={handleSubmit} autoComplete="off">
            <CardContent className="min-h-[280px]">
              {/* Step 0 — Location */}
              <div className={cn('space-y-6', step !== 0 && 'hidden')}>
                <div className="flex items-center gap-2 mb-2">
                  <MapPin className="size-4 text-muted-foreground" />
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Location Details</span>
                </div>
                <div>
                  <label htmlFor="address" className="text-xs font-medium text-muted-foreground">Property Address *</label>
                  <input id="address" placeholder="e.g. Koramangala, Bangalore" required className={inputBase} />
                </div>
                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <label htmlFor="lat" className="text-xs font-medium text-muted-foreground">Latitude</label>
                    <input id="lat" type="number" step="any" placeholder="12.9352" className={inputBase} />
                  </div>
                  <div>
                    <label htmlFor="lng" className="text-xs font-medium text-muted-foreground">Longitude</label>
                    <input id="lng" type="number" step="any" placeholder="77.6245" className={inputBase} />
                  </div>
                </div>
              </div>

              {/* Step 1 — Classification */}
              <div className={cn('space-y-6', step !== 1 && 'hidden')}>
                <div className="flex items-center gap-2 mb-2">
                  <Building2 className="size-4 text-muted-foreground" />
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Property Classification</span>
                </div>
                <div>
                  <label htmlFor="ptype" className="text-xs font-medium text-muted-foreground">Property Type *</label>
                  <select id="ptype" required className={selectBase}>
                    <option value="">Select type</option>
                    <option value="Residential">Residential</option>
                    <option value="Commercial">Commercial</option>
                    <option value="Industrial">Industrial</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="stype" className="text-xs font-medium text-muted-foreground">Sub-type *</label>
                  <select id="stype" required className={selectBase}>
                    <option value="">Select sub-type</option>
                    {SUBTYPES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              </div>

              {/* Step 2 — Dimensions */}
              <div className={cn('space-y-6', step !== 2 && 'hidden')}>
                <div className="flex items-center gap-2 mb-2">
                  <Ruler className="size-4 text-muted-foreground" />
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Dimensions</span>
                </div>
                <div className="grid grid-cols-3 gap-6">
                  <div>
                    <label htmlFor="carpet" className="text-xs font-medium text-muted-foreground">Carpet (sqft) *</label>
                    <input id="carpet" type="number" min="0" placeholder="1050" className={inputBase} />
                  </div>
                  <div>
                    <label htmlFor="builtup" className="text-xs font-medium text-muted-foreground">Built-up (sqft)</label>
                    <input id="builtup" type="number" min="0" placeholder="1250" className={inputBase} />
                  </div>
                  <div>
                    <label htmlFor="land" className="text-xs font-medium text-muted-foreground">Land (sqft)</label>
                    <input id="land" type="number" min="0" placeholder="0" className={inputBase} />
                  </div>
                </div>
              </div>

              {/* Step 3 — Structure */}
              <div className={cn('space-y-6', step !== 3 && 'hidden')}>
                <div className="flex items-center gap-2 mb-2">
                  <Layers className="size-4 text-muted-foreground" />
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Structure Details</span>
                </div>
                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <label htmlFor="age" className="text-xs font-medium text-muted-foreground">Age (years) *</label>
                    <input id="age" type="number" min="0" placeholder="8" required className={inputBase} />
                  </div>
                  <div>
                    <label htmlFor="tfloors" className="text-xs font-medium text-muted-foreground">Total Floors</label>
                    <input id="tfloors" type="number" min="1" placeholder="14" className={inputBase} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <label htmlFor="ffrom" className="text-xs font-medium text-muted-foreground">Floor (from)</label>
                    <input id="ffrom" type="number" min="0" placeholder="4" className={inputBase} />
                  </div>
                  <div>
                    <label htmlFor="fto" className="text-xs font-medium text-muted-foreground">Floor (to)</label>
                    <input id="fto" type="number" min="0" placeholder="4" className={inputBase} />
                  </div>
                </div>
                <div className="flex gap-6 pt-2">
                  <ToggleChip id="lift" label="Lift" defaultChecked />
                  <ToggleChip id="gaccess" label="Ground Floor Access" />
                </div>
              </div>

              {/* Step 4 — Occupancy */}
              <div className={cn('space-y-6', step !== 4 && 'hidden')}>
                <div className="flex items-center gap-2 mb-2">
                  <Users className="size-4 text-muted-foreground" />
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Occupancy & Income</span>
                </div>
                <div>
                  <label htmlFor="occ" className="text-xs font-medium text-muted-foreground">Occupancy Status</label>
                  <select id="occ" className={selectBase}>
                    <option value="self_occupied">Self Occupied</option>
                    <option value="rented">Rented</option>
                    <option value="vacant">Vacant</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="rent" className="text-xs font-medium text-muted-foreground">Monthly Rent (₹)</label>
                  <input id="rent" type="number" min="0" placeholder="25000" className={inputBase} />
                </div>
              </div>

              {/* Step 5 — Legal */}
              <div className={cn('space-y-6', step !== 5 && 'hidden')}>
                <div className="flex items-center gap-2 mb-2">
                  <Scale className="size-4 text-muted-foreground" />
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Legal Status</span>
                </div>
                <p className="text-xs text-muted-foreground">Select all that apply to this property.</p>
                <div className="flex flex-col gap-3">
                  <ToggleChip id="freehold" label="Freehold Ownership" defaultChecked />
                  <ToggleChip id="leasehold" label="Leasehold" />
                  <ToggleChip id="ctitle" label="Clear Title" defaultChecked />
                </div>
              </div>
            </CardContent>

            {/* Navigation */}
            <div className="flex items-center justify-between px-5 py-4 border-t border-border">
              <button
                type="button"
                onClick={() => setStep(s => Math.max(0, s - 1))}
                disabled={step === 0}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed transition cursor-pointer"
              >
                <ChevronLeft className="size-3.5" /> Back
              </button>

              <div className="text-[10px] text-muted-foreground font-mono">
                {step + 1} / {STEPS.length}
              </div>

              {step < STEPS.length - 1 ? (
                <button
                  type="submit"
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-foreground text-background text-xs font-semibold hover:bg-zinc-200 transition cursor-pointer"
                >
                  Next <ChevronRight className="size-3.5" />
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={loading}
                  className="inline-flex items-center gap-1.5 px-5 py-2 rounded-lg bg-foreground text-background text-xs font-semibold hover:bg-zinc-200 disabled:opacity-40 transition cursor-pointer"
                >
                  {loading && <Loader2 className="size-3.5 animate-spin" />}
                  {loading ? 'Running…' : 'Run Valuation'}
                </button>
              )}
            </div>
          </form>
        </Card>

        {/* Hint */}
        <p className="text-center text-[10px] text-zinc-700 mt-4">
          Fields marked * are required. Other fields improve accuracy.
        </p>
      </div>
    </div>
  )
}

/* ── Toggle Chip Component ── */
function ToggleChip({ id, label, defaultChecked }: { id: string; label: string; defaultChecked?: boolean }) {
  const [checked, setChecked] = useState(defaultChecked || false)
  return (
    <label
      htmlFor={id}
      className={cn(
        'flex items-center gap-3 px-4 py-3 rounded-lg border cursor-pointer transition-all',
        checked
          ? 'border-foreground/20 bg-foreground/5 text-foreground'
          : 'border-border bg-transparent text-muted-foreground hover:border-zinc-700'
      )}
    >
      <input
        type="checkbox"
        id={id}
        checked={checked}
        onChange={() => setChecked(!checked)}
        className="sr-only"
      />
      <div className={cn(
        'w-4 h-4 rounded-full border-2 flex items-center justify-center transition-all',
        checked ? 'border-foreground bg-foreground' : 'border-zinc-600'
      )}>
        {checked && <div className="w-1.5 h-1.5 rounded-full bg-background" />}
      </div>
      <span className="text-sm font-medium">{label}</span>
    </label>
  )
}
