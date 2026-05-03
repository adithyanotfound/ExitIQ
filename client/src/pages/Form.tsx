import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { MapPin, Building2, Ruler, Layers, Users, Scale, ChevronRight, ChevronLeft, Loader2, Info, LocateFixed, X, ArrowRight } from 'lucide-react'
import { MapContainer, TileLayer, Marker, useMapEvents, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { cn } from '@/lib/utils'

/* Fix Leaflet default marker icon */
delete (L.Icon.Default.prototype as any)._getIconUrl
const customMarker = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
})

const SUBTYPES = ['Apartment','Detached House','Plot','Shop','Warehouse','Office','Penthouse','Studio','Duplex','Farmhouse']

interface FormProps { onResult: (data: any) => void }

const STEPS = [
  { id: 'location', label: 'Location', desc: 'Property address', icon: MapPin },
  { id: 'classification', label: 'Classification', desc: 'Type & sub-type', icon: Building2 },
  { id: 'dimensions', label: 'Dimensions', desc: 'Area measurements', icon: Ruler },
  { id: 'structure', label: 'Structure', desc: 'Building details', icon: Layers },
  { id: 'occupancy', label: 'Occupancy', desc: 'Usage & income', icon: Users },
  { id: 'legal', label: 'Legal Status', desc: 'Ownership info', icon: Scale },
]

/* Field definitions for info tooltips */
const TIPS: Record<string, string> = {
  address: 'Full street address including city, pin code, and landmarks.',
  lat: 'Decimal latitude. Use the map picker to auto-fill.',
  lng: 'Decimal longitude. Use the map picker to auto-fill.',
  ptype: 'Broad category: Residential, Commercial, or Industrial.',
  stype: 'Specific type like Apartment, Plot, Office, etc.',
  carpet: 'Usable floor area within walls, excluding common areas.',
  builtup: 'Total area including walls and balconies.',
  land: 'Total land parcel area. Applies to plots & houses.',
  age: 'Years since construction or last major renovation.',
  tfloors: 'Total floors in the building.',
  ffrom: 'Starting floor (0 = ground).',
  fto: 'Ending floor if unit spans multiple floors.',
  lift: 'Whether the building has a working elevator.',
  gaccess: 'Direct access from ground level.',
  occ: 'Self-occupied, rented, or vacant.',
  rent: 'Monthly rental income. 0 if not rented.',
  freehold: 'Full ownership with no time restrictions.',
  leasehold: 'Property held on a fixed-period lease.',
  ctitle: 'Legally verified title with no disputes.',
}

/* ── Styled inputs — light theme ── */
const inputCls = "w-full bg-white border border-border rounded-lg px-3.5 py-2.5 text-sm text-foreground placeholder:text-slate-400 focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-none transition"
const selectCls = "w-full bg-white border border-border rounded-lg px-3.5 py-2.5 text-sm text-foreground focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-none transition appearance-none cursor-pointer"

export default function Form({ onResult }: FormProps) {
  const [step, setStep] = useState(0)
  const [loading, setLoading] = useState(false)
  const [errors, setErrors] = useState<string[] | null>(null)
  const [mapOpen, setMapOpen] = useState(false)
  const [pinLat, setPinLat] = useState<number | null>(null)
  const [pinLng, setPinLng] = useState<number | null>(null)
  const [pinAddress, setPinAddress] = useState('')
  const [geoLoading, setGeoLoading] = useState(false)
  const formRef = useRef<HTMLFormElement>(null)
  const navigate = useNavigate()

  const v = (id: string) => (formRef.current?.querySelector<HTMLInputElement>(`#${id}`)?.value || '').trim()
  const n = (id: string) => parseFloat(formRef.current?.querySelector<HTMLInputElement>(`#${id}`)?.value || '') || 0
  const c = (id: string) => formRef.current?.querySelector<HTMLInputElement>(`#${id}`)?.checked || false

  function applyPin() {
    if (!pinLat || !pinLng) return
    const set = (id: string, val: string) => { const el = formRef.current?.querySelector<HTMLInputElement>(`#${id}`); if (el) { el.value = val; el.dispatchEvent(new Event('input', { bubbles: true })) } }
    set('lat', pinLat.toFixed(6)); set('lng', pinLng.toFixed(6))
    if (pinAddress) set('address', pinAddress)
    setMapOpen(false)
  }

  function useMyLocation() {
    if (!navigator.geolocation) return
    setGeoLoading(true)
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude: lat, longitude: lng } = pos.coords
        setPinLat(lat); setPinLng(lng)
        try {
          const res = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`)
          const data = await res.json()
          if (data.display_name) setPinAddress(data.display_name)
        } catch {}
        setGeoLoading(false); setMapOpen(true)
      },
      () => setGeoLoading(false),
      { enableHighAccuracy: true }
    )
  }

  function validateStep(s: number) {
    setErrors(null)
    const errs: string[] = []
    
    if (s === 0) {
      const address = v('address')
      const lat = v('lat')
      const lng = v('lng')
      
      if (!lat || !lng) {
        if (!address) errs.push('Please provide a Property Address OR pick a location on the Map.')
      }
    } else if (s === 1) {
      if (!v('ptype')) errs.push('Property Type is required.')
      if (!v('stype')) errs.push('Sub-type is required.')
    } else if (s === 2) {
      if (!v('carpet')) errs.push('Carpet Area is required.')
    } else if (s === 3) {
      if (!v('age')) errs.push('Building Age is required.')
    }
    
    if (errs.length > 0) {
      setErrors(errs)
      return false
    }
    return true
  }

  function goNext() { 
    if (validateStep(step)) setStep(s => Math.min(STEPS.length - 1, s + 1)) 
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    
    for (let i = 0; i <= step; i++) {
      if (!validateStep(i)) {
        setStep(i)
        return
      }
    }

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
    <div className="min-h-screen flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-4xl bg-white rounded-2xl shadow-xl shadow-blue-900/5 border border-white/80 overflow-hidden">
        <form ref={formRef} onSubmit={handleSubmit} autoComplete="off" noValidate>
          <div className="flex min-h-[540px]">

            {/* ── Left Sidebar — Step Indicator ── */}
            <div className="w-56 shrink-0 bg-slate-50/80 border-r border-border p-6 flex flex-col">
              <div className="mb-6">
                <h2 className="text-lg font-bold text-foreground">Property Info</h2>
                <p className="text-xs text-muted-foreground mt-0.5">Complete each section</p>
              </div>
              <div className="space-y-1 flex-1">
                {STEPS.map((s, i) => {
                  const Icon = s.icon
                  const isDone = i < step
                  const isActive = i === step
                  return (
                    <button key={s.id} type="button" onClick={() => setStep(i)}
                      className={cn(
                        'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all cursor-pointer',
                        isActive ? 'bg-primary/10 text-primary' : isDone ? 'text-foreground' : 'text-muted-foreground hover:bg-slate-100'
                      )}
                    >
                      <div className={cn(
                        'w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-xs font-semibold transition-all',
                        isActive ? 'bg-primary text-white shadow-md shadow-blue-500/30' :
                        isDone ? 'bg-emerald-100 text-emerald-600 border border-emerald-200' :
                        'bg-slate-100 text-slate-400 border border-border'
                      )}>
                        {isDone ? '✓' : <Icon className="size-3.5" />}
                      </div>
                      <div className="min-w-0">
                        <div className="text-[13px] font-semibold truncate">{s.label}</div>
                        <div className="text-[10px] text-muted-foreground truncate">{s.desc}</div>
                      </div>
                    </button>
                  )
                })}
              </div>
              <div className="text-[10px] text-muted-foreground mt-4">
                Step {step + 1} of {STEPS.length}
              </div>
            </div>

            {/* ── Right Content ── */}
            <div className="flex-1 flex flex-col">
              <div className="flex-1 p-8">
                {/* Errors */}
                {errors && (
                  <div className="mb-5 p-3 rounded-xl bg-red-50 border border-red-200">
                    {errors.map((e, i) => <p key={i} className="text-xs text-red-600">{e}</p>)}
                  </div>
                )}

                {/* Step 0 — Location */}
                <div className={cn(step !== 0 && 'hidden')}>
                  <StepHeading title="Property Location" subtitle="Enter the address or pick a location on the map" />
                  <div className="space-y-5 mt-6">
                    <Field id="address" label="Property Address" tip={TIPS.address}>
                      <input id="address" placeholder="e.g. Sector 8, Rohini, New Delhi 110085" className={inputCls} />
                    </Field>
                    <Field id="lat" label="Latitude" tip={TIPS.lat}>
                      <input id="lat" type="number" step="any" placeholder="28.7041" className={inputCls} />
                    </Field>
                    <Field id="lng" label="Longitude" tip={TIPS.lng}>
                      <input id="lng" type="number" step="any" placeholder="77.1025" className={inputCls} />
                    </Field>
                    <div className="flex gap-2">
                      <button type="button" onClick={() => setMapOpen(!mapOpen)} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border bg-white text-xs font-medium text-muted-foreground hover:text-foreground hover:border-primary/40 transition cursor-pointer">
                        <MapPin className="size-3.5 text-primary" /> Pick on Map
                      </button>
                      <button type="button" onClick={useMyLocation} disabled={geoLoading} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border bg-white text-xs font-medium text-muted-foreground hover:text-foreground hover:border-primary/40 transition cursor-pointer disabled:opacity-40">
                        {geoLoading ? <Loader2 className="size-3.5 animate-spin text-primary" /> : <LocateFixed className="size-3.5 text-primary" />}
                        Use My Location
                      </button>
                    </div>
                    {mapOpen && (
                      <div className="rounded-xl border border-border overflow-hidden shadow-sm">
                        <div className="flex items-center justify-between px-3 py-2 bg-slate-50 border-b border-border">
                          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Click to drop pin</span>
                          <button type="button" onClick={() => setMapOpen(false)} className="text-muted-foreground hover:text-foreground cursor-pointer"><X className="size-3.5" /></button>
                        </div>
                        <div className="h-52">
                          <MapContainer center={[pinLat || 20.5937, pinLng || 78.9629]} zoom={pinLat ? 15 : 5} className="h-full w-full">
                            <TileLayer attribution='&copy; Google' url="https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}" />
                            <MapClickHandler onPick={(lat, lng, addr) => { setPinLat(lat); setPinLng(lng); setPinAddress(addr) }} />
                            {pinLat && pinLng && <Marker position={[pinLat, pinLng]} icon={customMarker} />}
                            {pinLat && pinLng && <RecenterMap lat={pinLat} lng={pinLng} />}
                          </MapContainer>
                        </div>
                        {pinLat && pinLng && (
                          <div className="flex items-center justify-between px-3 py-2 bg-slate-50 border-t border-border">
                            <span className="text-xs text-muted-foreground font-mono truncate max-w-[280px]">{pinAddress || `${pinLat.toFixed(4)}, ${pinLng.toFixed(4)}`}</span>
                            <button type="button" onClick={applyPin} className="px-3 py-1 rounded-md bg-primary text-white text-[11px] font-semibold hover:bg-blue-700 transition cursor-pointer">Use this location</button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Step 1 — Classification */}
                <div className={cn(step !== 1 && 'hidden')}>
                  <StepHeading title="Property Classification" subtitle="Select the property type and sub-type" />
                  <div className="space-y-5 mt-6">
                    <Field id="ptype" label="Property Type" tip={TIPS.ptype} required>
                      <select id="ptype" className={selectCls}>
                        <option value="">Select type</option>
                        <option value="Residential">Residential</option>
                        <option value="Commercial">Commercial</option>
                        <option value="Industrial">Industrial</option>
                      </select>
                    </Field>
                    <Field id="stype" label="Sub-type" tip={TIPS.stype} required>
                      <select id="stype" className={selectCls}>
                        <option value="">Select sub-type</option>
                        {SUBTYPES.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </Field>
                  </div>
                </div>

                {/* Step 2 — Dimensions */}
                <div className={cn(step !== 2 && 'hidden')}>
                  <StepHeading title="Dimensions" subtitle="Enter area measurements in square feet" />
                  <div className="space-y-5 mt-6">
                    <Field id="carpet" label="Carpet Area" tip={TIPS.carpet} required>
                      <input id="carpet" type="number" min="0" placeholder="1050" className={inputCls} />
                    </Field>
                    <Field id="builtup" label="Built-up Area" tip={TIPS.builtup}>
                      <input id="builtup" type="number" min="0" placeholder="1250" className={inputCls} />
                    </Field>
                    <Field id="land" label="Land Area" tip={TIPS.land}>
                      <input id="land" type="number" min="0" placeholder="0" className={inputCls} />
                    </Field>
                  </div>
                </div>

                {/* Step 3 — Structure */}
                <div className={cn(step !== 3 && 'hidden')}>
                  <StepHeading title="Structure Details" subtitle="Building age, floors, and accessibility" />
                  <div className="space-y-5 mt-6">
                    <Field id="age" label="Age (years)" tip={TIPS.age} required>
                      <input id="age" type="number" min="0" placeholder="8" className={inputCls} />
                    </Field>
                    <Field id="tfloors" label="Total Floors" tip={TIPS.tfloors}>
                      <input id="tfloors" type="number" min="1" placeholder="14" className={inputCls} />
                    </Field>
                    <Field id="ffrom" label="Floor (from)" tip={TIPS.ffrom}>
                      <input id="ffrom" type="number" min="0" placeholder="4" className={inputCls} />
                    </Field>
                    <Field id="fto" label="Floor (to)" tip={TIPS.fto}>
                      <input id="fto" type="number" min="0" placeholder="4" className={inputCls} />
                    </Field>
                    <Field id="lift_gaccess" label="Accessibility" tip="Indicate if the building has a lift or ground floor access.">
                      <div className="flex gap-3">
                        <Chip id="lift" label="Lift" defaultChecked />
                        <Chip id="gaccess" label="Ground Access" />
                      </div>
                    </Field>
                  </div>
                </div>

                {/* Step 4 — Occupancy */}
                <div className={cn(step !== 4 && 'hidden')}>
                  <StepHeading title="Occupancy & Income" subtitle="Current usage and rental details" />
                  <div className="space-y-5 mt-6">
                    <Field id="occ" label="Status" tip={TIPS.occ}>
                      <select id="occ" className={selectCls}>
                        <option value="self_occupied">Self Occupied</option>
                        <option value="rented">Rented</option>
                        <option value="vacant">Vacant</option>
                      </select>
                    </Field>
                    <Field id="rent" label="Monthly Rent (₹)" tip={TIPS.rent}>
                      <input id="rent" type="number" min="0" placeholder="25000" className={inputCls} />
                    </Field>
                  </div>
                </div>

                {/* Step 5 — Legal */}
                <div className={cn(step !== 5 && 'hidden')}>
                  <StepHeading title="Legal Status" subtitle="Select all that apply to this property" />
                  <div className="space-y-6 mt-6">
                    <Field id="legal_freehold" label="Freehold" tip={TIPS.freehold}>
                      <Chip id="freehold" label="Freehold Ownership" defaultChecked />
                    </Field>
                    <Field id="legal_leasehold" label="Leasehold" tip={TIPS.leasehold}>
                      <Chip id="leasehold" label="Leasehold" />
                    </Field>
                    <Field id="legal_ctitle" label="Clear Title" tip={TIPS.ctitle}>
                      <Chip id="ctitle" label="Clear Title" defaultChecked />
                    </Field>
                  </div>
                </div>
              </div>

              {/* Footer Nav */}
              <div className="flex items-center justify-between px-8 py-4 border-t border-border bg-slate-50/50">
                <button type="button" onClick={() => setStep(s => Math.max(0, s - 1))} disabled={step === 0}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed transition cursor-pointer"
                >
                  <ChevronLeft className="size-4" /> Back
                </button>
                {step < STEPS.length - 1 ? (
                  <button type="button" onClick={goNext}
                    className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-primary text-white text-sm font-semibold hover:bg-blue-700 shadow-md shadow-blue-500/20 transition cursor-pointer"
                  >
                    Continue <ArrowRight className="size-4" />
                  </button>
                ) : (
                  <button type="submit" disabled={loading}
                    className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-primary text-white text-sm font-semibold hover:bg-blue-700 shadow-md shadow-blue-500/20 disabled:opacity-40 transition cursor-pointer"
                  >
                    {loading && <Loader2 className="size-4 animate-spin" />}
                    {loading ? 'Running…' : 'Run Valuation'}
                    {!loading && <ArrowRight className="size-4" />}
                  </button>
                )}
              </div>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}

/* ═══════════════════════════════════
   SUB-COMPONENTS
   ═══════════════════════════════════ */

function StepHeading({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div>
      <h3 className="text-xl font-bold text-foreground">{title}</h3>
      <p className="text-sm text-muted-foreground mt-0.5">{subtitle}</p>
    </div>
  )
}

function Field({ id, label, tip, required, children }: { id: string; label: string; tip?: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="flex flex-col md:flex-row md:items-start gap-2 md:gap-8 pt-1">
      <div className="w-full md:w-[35%] shrink-0 pt-2.5">
        <label htmlFor={id} className="text-sm font-semibold text-slate-900">{label}{required && <span className="text-red-400 ml-0.5">*</span>}</label>
        {tip && <p className="text-xs text-slate-400 mt-1 leading-relaxed font-medium">{tip}</p>}
      </div>
      <div className="flex-1">
        {children}
      </div>
    </div>
  )
}

function Chip({ id, label, defaultChecked }: { id: string; label: string; defaultChecked?: boolean }) {
  const [on, setOn] = useState(defaultChecked || false)
  return (
    <label htmlFor={id}
      className={cn(
        'flex items-center gap-3 px-4 py-3 rounded-xl border cursor-pointer transition-all',
        on ? 'border-primary bg-primary/5 text-foreground shadow-sm' : 'border-border bg-white text-muted-foreground hover:border-slate-300'
      )}
    >
      <input type="checkbox" id={id} checked={on} onChange={() => setOn(!on)} className="sr-only" />
      <div className={cn(
        'w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all shrink-0',
        on ? 'border-primary bg-primary' : 'border-slate-300'
      )}>
        {on && <div className="w-2 h-2 rounded-full bg-white" />}
      </div>
      <span className="text-sm font-medium flex-1">{label}</span>
    </label>
  )
}

/* ── Leaflet Helpers ── */
function MapClickHandler({ onPick }: { onPick: (lat: number, lng: number, addr: string) => void }) {
  useMapEvents({
    async click(e) {
      const { lat, lng } = e.latlng
      let addr = ''
      try {
        const res = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`)
        const data = await res.json()
        if (data.display_name) addr = data.display_name
      } catch {}
      onPick(lat, lng, addr)
    },
  })
  return null
}

function RecenterMap({ lat, lng }: { lat: number; lng: number }) {
  const map = useMap()
  useEffect(() => { map.setView([lat, lng], Math.max(map.getZoom(), 14)) }, [lat, lng, map])
  return null
}
