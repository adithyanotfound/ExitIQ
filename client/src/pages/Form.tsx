import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { MapPin, Building2, Ruler, Layers, Users, Scale, Camera, ChevronRight, ChevronLeft, Loader2, Info, LocateFixed, X, ArrowRight, Search, Map, Upload, Trash2 } from 'lucide-react'
import { MapContainer, TileLayer, useMapEvents, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { cn } from '@/lib/utils'

/* Fix Leaflet default marker icon */
delete (L.Icon.Default.prototype as any)._getIconUrl

const SUBTYPES = ['Apartment','Detached House','Plot','Shop','Warehouse','Office','Penthouse','Studio','Duplex','Farmhouse']

interface FormProps { onResult: (data: any) => void }

type LocMode = 'address' | 'latlng' | 'map'

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

const inputCls = "w-full bg-white border border-border rounded-lg px-3.5 py-2.5 text-sm text-foreground placeholder:text-slate-400 focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-none transition disabled:opacity-50 disabled:bg-slate-50 disabled:cursor-not-allowed"
const selectCls = "w-full bg-white border border-border rounded-lg px-3.5 py-2.5 text-sm text-foreground focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-none transition appearance-none cursor-pointer disabled:opacity-50 disabled:bg-slate-50 disabled:cursor-not-allowed"

export default function Form({ onResult }: FormProps) {
  const [step, setStep] = useState(0)
  const [loading, setLoading] = useState(false)
  const [errors, setErrors] = useState<string[] | null>(null)
  
  // Location Step State
  const [locMethod, setLocMethod] = useState<LocMode>('address')
  const [address, setAddress] = useState('')
  const [lat, setLat] = useState('')
  const [lng, setLng] = useState('')
  const [mapCenter, setMapCenter] = useState<[number, number]>([28.6139, 77.2090])
  const [mapAddress, setMapAddress] = useState('')
  const [mapAddressLoading, setMapAddressLoading] = useState(false)
  const [flyToCoords, setFlyToCoords] = useState<[number, number] | null>(null)
  // Structure Step State
  const [tfloors, setTfloors] = useState<number | ''>('')
  const [ffrom, setFfrom] = useState<number | ''>('')
  const [fto, setFto] = useState<number | ''>('')
  const [lift, setLift] = useState(true)
  const [gaccess, setGaccess] = useState(false)
  const [sameArea, setSameArea] = useState(true)
  const [floorAreas, setFloorAreas] = useState<Record<number, string>>({})
  
  // Legal Status State
  const [ownershipType, setOwnershipType] = useState<'freehold' | 'leasehold'>('freehold')
  const [titleStatus, setTitleStatus] = useState<'ctitle' | 'complications'>('ctitle')
  
  // Photos State
  const [exteriorImages, setExteriorImages] = useState<string[]>([])
  const [interiorImages, setInteriorImages] = useState<string[]>([])
  const [showPhotoUpload, setShowPhotoUpload] = useState(false)
  
  const geocodeTimeout = useRef<any>(null)
  const formRef = useRef<HTMLFormElement>(null)
  const navigate = useNavigate()

  // For controlled/uncontrolled hybrid (Steps 1-5 use uncontrolled DOM reads for simplicity, Step 0 uses React state for strict mutually exclusive logic)
  const v = (id: string) => {
    const el = formRef.current?.querySelector(`#${id}`) as HTMLInputElement | HTMLSelectElement;
    return (el?.value || '').trim();
  }
  const n = (id: string) => {
    const el = formRef.current?.querySelector(`#${id}`) as HTMLInputElement | HTMLSelectElement;
    return parseFloat(el?.value || '') || 0;
  }
  const c = (id: string) => {
    const el = formRef.current?.querySelector(`#${id}`) as HTMLInputElement;
    return el?.checked || false;
  }

  // --- Location Logic ---
  function handleLocMethodChange(method: LocMode) {
    setLocMethod(method)
    if (method === 'address') { setLat(''); setLng(''); setMapAddress('') }
    if (method === 'latlng') { setAddress(''); setMapAddress('') }
    if (method === 'map') { 
      setLat(mapCenter[0].toFixed(6))
      setLng(mapCenter[1].toFixed(6))
      if(!mapAddress) debouncedReverseGeocode(mapCenter[0], mapCenter[1]) 
    }
  }

  function fetchGPSLocation() {
    if (!navigator.geolocation) {
      setErrors(['Geolocation is not supported by your browser.'])
      return
    }
    setMapAddressLoading(true)
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords
        setMapCenter([latitude, longitude])
        setFlyToCoords([latitude, longitude])
        setLat(latitude.toFixed(6))
        setLng(longitude.toFixed(6))
        
        // Reverse geocode right away
        try {
          const res = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json`)
          const data = await res.json()
          setMapAddress(data.display_name || 'Unknown Location')
          setAddress(data.display_name || 'Unknown Location')
        } catch {
          setMapAddress('Unknown Location')
          setAddress('Unknown Location')
        } finally {
          setMapAddressLoading(false)
        }
      },
      (err) => {
        setMapAddressLoading(false)
        setErrors(['Failed to get GPS location. Please check your permissions.'])
      },
      { enableHighAccuracy: true }
    )
  }

  function debouncedReverseGeocode(lat: number, lng: number) {
    setLat(lat.toFixed(6))
    setLng(lng.toFixed(6))
    setMapAddressLoading(true)
    if (geocodeTimeout.current) clearTimeout(geocodeTimeout.current)
    geocodeTimeout.current = setTimeout(async () => {
      try {
        const res = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`)
        const data = await res.json()
        setMapAddress(data.display_name || 'Unknown Location')
        setAddress(data.display_name || 'Unknown Location')
      } catch {
        setMapAddress('Unknown Location')
        setAddress('Unknown Location')
      } finally {
        setMapAddressLoading(false)
      }
    }, 800)
  }

  function mapLocateMe() {
    if(!navigator.geolocation) return
    navigator.geolocation.getCurrentPosition((pos) => {
      setMapCenter([pos.coords.latitude, pos.coords.longitude])
      setFlyToCoords([pos.coords.latitude, pos.coords.longitude])
      debouncedReverseGeocode(pos.coords.latitude, pos.coords.longitude)
    })
  }

  function handleTfloorsChange(val: string) {
    const num = val === '' ? '' : parseInt(val)
    setTfloors(num)
    if (num === 1) {
      setLift(false)
      setGaccess(true)
    }
  }

  function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>, type: 'exterior' | 'interior') {
    const files = Array.from(e.target.files || [])
    files.forEach(file => {
      const reader = new FileReader()
      reader.onloadend = () => {
        if (typeof reader.result === 'string') {
          if (type === 'exterior') setExteriorImages(prev => [...prev, reader.result as string])
          else setInteriorImages(prev => [...prev, reader.result as string])
        }
      }
      reader.readAsDataURL(file)
    })
  }

  function removeImage(index: number, type: 'exterior' | 'interior') {
    if (type === 'exterior') setExteriorImages(prev => prev.filter((_, i) => i !== index))
    else setInteriorImages(prev => prev.filter((_, i) => i !== index))
  }

  const startF = typeof ffrom === 'number' ? ffrom : 0
  const endF = typeof fto === 'number' ? Math.max(fto, startF) : startF
  const numUnitFloors = endF - startF + 1

  // --- Validation ---
  function validateStep(s: number) {
    setErrors(null)
    const errs: string[] = []
    
    if (s === 0) {
      if (locMethod === 'address' && !address) errs.push('Please enter a property address.')
      if (locMethod === 'latlng' && (!lat || !lng)) errs.push('Please enter both latitude and longitude.')
      if (locMethod === 'map' && (!lat || !lng)) errs.push('Please pick a location on the map and confirm.')
    } else if (s === 1) {
      if (!v('ptype')) errs.push('Property Type is required.')
      if (!v('stype')) errs.push('Sub-type is required.')
    } else if (s === 2) {
      if (!v('carpet')) errs.push('Carpet Area is required.')
    } else if (s === 3) {
      if (!v('age')) errs.push('Building Age is required.')
    } else if (s === 4) {
      if (!v('occ')) errs.push('Occupancy Status is required.')
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

  async function handleSubmit(e?: React.FormEvent) {
    if (e) e.preventDefault()
    
    // Validate EVERYTHING before proceeding to photos, regardless of current step
    for (let i = 0; i < STEPS.length; i++) {
      if (!validateStep(i)) {
        setStep(i)
        setShowPhotoUpload(false)
        return
      }
    }

    if (!showPhotoUpload) {
      setShowPhotoUpload(true)
      return
    }

    // Photos are now optional
    // if (exteriorImages.length === 0 || interiorImages.length === 0) {
    //   setErrors(['Please upload at least 1 exterior and 1 interior photo to continue.'])
    //   return
    // }

    setLoading(true); setErrors(null)
    const payload = {
      address: address, lat_long: { lat: lat ? parseFloat(lat) : null, lng: lng ? parseFloat(lng) : null },
      property_type: v('ptype'), sub_type: v('stype'),
      size: { carpet_area_sqft: n('carpet'), builtup_area_sqft: n('builtup'), land_parcel_sqft: n('land') },
      age_years: n('age'), floor_from: typeof ffrom === 'number' ? ffrom : 0, floor_to: typeof fto === 'number' ? fto : (typeof ffrom === 'number' ? ffrom : 0),
      total_building_floors: typeof tfloors === 'number' ? tfloors : null,
      accessibility: { lift, ground_floor_access: gaccess },
      occupancy_status: v('occ'), rent_monthly: n('rent'),
      legal_status: { 
        freehold: ownershipType === 'freehold', 
        clear_title: titleStatus === 'ctitle', 
        leasehold: ownershipType === 'leasehold' 
      },
      images: {
        exterior: exteriorImages,
        interior: interiorImages
      },
      // pass per floor area if applicable
      floor_areas: numUnitFloors > 1 && !sameArea ? floorAreas : undefined
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
    <div className="min-h-screen flex items-center justify-center p-4 sm:p-6 lg:p-8">
      {/* ── Fullscreen Loading Overlay ── */}
      {loading && (
        <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-slate-900/90 backdrop-blur-xl animate-in fade-in duration-500">
          <div className="relative flex items-center justify-center mb-8">
            <div className="absolute w-32 h-32 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
            <div className="absolute w-24 h-24 border-4 border-emerald-400 border-b-transparent rounded-full animate-[spin_1.5s_linear_infinite_reverse]"></div>
            <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center shadow-[0_0_30px_rgba(59,130,246,0.5)]">
              <Building2 className="size-8 text-blue-600 animate-pulse" />
            </div>
          </div>
          <h2 className="text-3xl font-black text-white tracking-tight mb-2">Synthesizing Intelligence...</h2>
          <p className="text-blue-200 font-medium text-center max-w-sm px-4">Processing geospatial parameters, visual evidence, and live market dynamics.</p>
        </div>
      )}

      {/* ── Photo Upload View ── */}
      <div className={cn("w-full max-w-3xl animate-in fade-in zoom-in-95 duration-500", !showPhotoUpload && "hidden")}>
        <div className="bg-white rounded-3xl shadow-2xl shadow-blue-900/10 border border-border/50 overflow-hidden flex flex-col">
          <div className="p-8 sm:p-12 text-center">
            <div className="w-20 h-20 bg-blue-50 text-primary rounded-full flex items-center justify-center mx-auto mb-6 shadow-inner">
              <Camera className="size-10" />
            </div>
            <h2 className="text-3xl font-extrabold text-slate-900 tracking-tight mb-3">Property Photos</h2>
            <p className="text-slate-500 font-medium max-w-lg mx-auto mb-10">Upload images from your device or take pictures directly. These will be analyzed by our AI to assess the property condition.</p>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8 text-left">
              {/* Exterior Photos */}
              <div className="bg-slate-50/50 rounded-3xl p-6 border border-slate-200 shadow-sm relative">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center shrink-0">
                    <Building2 className="size-5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-800">Exterior Photos</h3>
                    <p className="text-[11px] text-slate-500">Building, surroundings, road access</p>
                  </div>
                </div>

                <div className="flex gap-3 mb-4">
                  <label className="flex-1 flex flex-col items-center justify-center py-4 border-2 border-dashed border-slate-300 rounded-xl hover:border-primary hover:bg-primary/5 transition-all cursor-pointer group bg-white">
                    <Upload className="size-5 text-slate-400 group-hover:text-primary mb-1 transition-colors" />
                    <span className="text-xs font-semibold text-slate-600">Upload</span>
                    <input type="file" multiple accept="image/*" className="hidden" onChange={e => handleImageUpload(e, 'exterior')} />
                  </label>
                  <label className="flex-1 flex flex-col items-center justify-center py-4 border-2 border-dashed border-slate-300 rounded-xl hover:border-primary hover:bg-primary/5 transition-all cursor-pointer group bg-white">
                    <Camera className="size-5 text-slate-400 group-hover:text-primary mb-1 transition-colors" />
                    <span className="text-xs font-semibold text-slate-600">Camera</span>
                    <input type="file" accept="image/*" capture="environment" className="hidden" onChange={e => handleImageUpload(e, 'exterior')} />
                  </label>
                </div>
                
                {exteriorImages.length > 0 && (
                  <div className="grid grid-cols-3 gap-2">
                    {exteriorImages.map((src, i) => (
                      <div key={i} className="relative aspect-square rounded-lg overflow-hidden group shadow-sm border border-slate-200">
                        <img src={src} alt={`Exterior ${i+1}`} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" />
                        <button type="button" onClick={() => removeImage(i, 'exterior')} className="absolute top-1 right-1 bg-black/60 hover:bg-red-500 text-white p-1 rounded-md backdrop-blur-md transition-all opacity-0 group-hover:opacity-100 shadow-lg">
                          <Trash2 className="size-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Interior Photos */}
              <div className="bg-slate-50/50 rounded-3xl p-6 border border-slate-200 shadow-sm relative">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center shrink-0">
                    <Layers className="size-5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-800">Interior Photos</h3>
                    <p className="text-[11px] text-slate-500">Rooms, kitchen, bathroom, condition</p>
                  </div>
                </div>

                <div className="flex gap-3 mb-4">
                  <label className="flex-1 flex flex-col items-center justify-center py-4 border-2 border-dashed border-slate-300 rounded-xl hover:border-primary hover:bg-primary/5 transition-all cursor-pointer group bg-white">
                    <Upload className="size-5 text-slate-400 group-hover:text-primary mb-1 transition-colors" />
                    <span className="text-xs font-semibold text-slate-600">Upload</span>
                    <input type="file" multiple accept="image/*" className="hidden" onChange={e => handleImageUpload(e, 'interior')} />
                  </label>
                  <label className="flex-1 flex flex-col items-center justify-center py-4 border-2 border-dashed border-slate-300 rounded-xl hover:border-primary hover:bg-primary/5 transition-all cursor-pointer group bg-white">
                    <Camera className="size-5 text-slate-400 group-hover:text-primary mb-1 transition-colors" />
                    <span className="text-xs font-semibold text-slate-600">Camera</span>
                    <input type="file" accept="image/*" capture="environment" className="hidden" onChange={e => handleImageUpload(e, 'interior')} />
                  </label>
                </div>
                
                {interiorImages.length > 0 && (
                  <div className="grid grid-cols-3 gap-2">
                    {interiorImages.map((src, i) => (
                      <div key={i} className="relative aspect-square rounded-lg overflow-hidden group shadow-sm border border-slate-200">
                        <img src={src} alt={`Interior ${i+1}`} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" />
                        <button type="button" onClick={() => removeImage(i, 'interior')} className="absolute top-1 right-1 bg-black/60 hover:bg-red-500 text-white p-1 rounded-md backdrop-blur-md transition-all opacity-0 group-hover:opacity-100 shadow-lg">
                          <Trash2 className="size-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Errors */}
            {errors && (
              <div className="mb-6 p-3 rounded-xl bg-red-50 border border-red-200 text-left">
                {errors.map((e, i) => <p key={i} className="text-xs font-medium text-red-600">{e}</p>)}
              </div>
            )}
          </div>
          
          <div className="p-6 sm:px-10 sm:py-8 bg-slate-50/80 border-t border-border flex items-center justify-between mt-auto backdrop-blur-sm">
            <button type="button" onClick={() => setShowPhotoUpload(false)} disabled={loading} className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-bold text-slate-500 hover:text-slate-800 hover:bg-white border border-transparent hover:border-slate-200 shadow-sm hover:shadow transition-all disabled:opacity-50">
              <ChevronLeft className="size-4" /> Back to Form
            </button>
            <button type="button" onClick={() => handleSubmit()} disabled={loading} className="inline-flex items-center gap-2 px-8 py-3 rounded-xl bg-primary text-white text-sm font-bold shadow-xl shadow-blue-500/30 hover:bg-blue-700 hover:shadow-blue-500/40 hover:-translate-y-0.5 transition-all active:scale-[0.98] disabled:opacity-70 disabled:pointer-events-none">
              {loading ? <Loader2 className="size-5 animate-spin" /> : 'Run Valuation'}
              {!loading && <ArrowRight className="size-4" />}
            </button>
          </div>
        </div>
      </div>

      {/* ── Main Form View ── */}
      <div className={cn("flex flex-col xl:flex-row items-stretch gap-6 transition-all duration-500 w-full", showPhotoUpload && "hidden", (locMethod === 'map' && step === 0) ? "max-w-[1600px]" : "max-w-4xl")}>
        <div className={cn("w-full bg-white rounded-2xl shadow-xl shadow-blue-900/5 border border-white/80 overflow-hidden flex flex-col shrink-0 transition-all duration-500", (locMethod === 'map' && step === 0) ? "xl:max-w-3xl" : "max-w-4xl")}>
          <form ref={formRef} onSubmit={handleSubmit} autoComplete="off" noValidate>
            <div className="flex min-h-[540px]">
              {/* Sidebar */}
              <div className="w-56 shrink-0 bg-slate-50/80 border-r border-border p-6 flex flex-col hidden md:flex">
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
                      <button key={s.id} type="button" onClick={() => { if(isDone || i===step-1) setStep(i) }}
                        className={cn(
                          'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all',
                          isActive ? 'bg-primary/10 text-primary' : isDone ? 'text-foreground hover:bg-slate-100 cursor-pointer' : 'text-muted-foreground cursor-not-allowed'
                        )}
                        disabled={!isDone && !isActive}
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
                <div className="text-[10px] text-muted-foreground mt-4">Step {step + 1} of {STEPS.length}</div>
              </div>

              {/* Right Content */}
              <div className="flex-1 flex flex-col relative z-0 min-w-0">
                <div className="flex-1 p-6 md:p-8">
                  {/* Mobile Header */}
                  <div className="md:hidden flex items-center justify-between mb-6">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-primary bg-primary/10 px-2 py-1 rounded-md">Step {step + 1} of {STEPS.length}</span>
                      <span className="text-sm font-semibold text-slate-700">{STEPS[step].label}</span>
                    </div>
                  </div>
                  
                  {errors && (
                    <div className="mb-5 p-3 rounded-xl bg-red-50 border border-red-200">
                      {errors.map((e, i) => <p key={i} className="text-xs text-red-600">{e}</p>)}
                    </div>
                  )}

                  {/* Step 0 — Location */}
                  <div className={cn(step !== 0 && 'hidden')}>
                    <StepHeading title="Property Location" subtitle="How would you like to locate the property?" />
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-6 mb-8">
                      <button type="button" onClick={() => handleLocMethodChange('address')} className={cn("p-4 rounded-xl border text-left transition-all cursor-pointer", locMethod === 'address' ? "border-primary bg-primary/5 shadow-sm ring-1 ring-primary" : "border-border hover:border-slate-300")}>
                        <div className="text-sm font-semibold text-slate-900">Address</div>
                        <div className="text-[10px] text-slate-500 mt-1">Manual entry</div>
                      </button>
                      <button type="button" onClick={() => handleLocMethodChange('latlng')} className={cn("p-4 rounded-xl border text-left transition-all cursor-pointer", locMethod === 'latlng' ? "border-primary bg-primary/5 shadow-sm ring-1 ring-primary" : "border-border hover:border-slate-300")}>
                        <div className="text-sm font-semibold text-slate-900">Coordinates</div>
                        <div className="text-[10px] text-slate-500 mt-1">Lat & Long</div>
                      </button>
                      <button type="button" onClick={() => handleLocMethodChange('map')} className={cn("p-4 rounded-xl border text-left transition-all cursor-pointer", locMethod === 'map' ? "border-primary bg-primary/5 shadow-sm ring-1 ring-primary" : "border-border hover:border-slate-300")}>
                        <div className="flex items-center justify-between">
                          <div className="text-sm font-semibold text-slate-900">Map Pin</div>
                          <Map className="size-4 text-primary" />
                        </div>
                        <div className="text-[10px] text-slate-500 mt-1">Interactive map</div>
                      </button>
                    </div>

                    <div className="space-y-5 animate-in fade-in slide-in-from-bottom-2 duration-300">
                      {locMethod === 'address' && (
                        <Field id="address" label="Property Address" tip={TIPS.address}>
                          <input id="address" value={address} onChange={e => setAddress(e.target.value)} placeholder="e.g. Sector 8, Rohini, New Delhi 110085" className={inputCls} />
                        </Field>
                      )}
                      {locMethod === 'latlng' && (
                        <>
                          <Field id="lat" label="Latitude" tip={TIPS.lat}>
                            <input id="lat" type="number" step="any" value={lat} onChange={e => setLat(e.target.value)} placeholder="28.7041" className={inputCls} />
                          </Field>
                          <Field id="lng" label="Longitude" tip={TIPS.lng}>
                            <input id="lng" type="number" step="any" value={lng} onChange={e => setLng(e.target.value)} placeholder="77.1025" className={inputCls} />
                          </Field>
                        </>
                      )}
                      {locMethod === 'map' && (
                        <div className="p-4 sm:p-5 rounded-xl border border-primary/20 bg-primary/5 transition-all flex flex-col gap-4 items-start">
                          <div className="flex items-center gap-3 sm:gap-4 w-full">
                            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                              {mapAddressLoading ? <Loader2 className="size-5 sm:size-6 text-primary animate-spin" /> : <MapPin className="size-5 sm:size-6 text-primary" />}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-semibold text-slate-900 truncate mb-0.5">{mapAddressLoading ? 'Acquiring Signal...' : (lat && lng ? `${parseFloat(lat).toFixed(4)}, ${parseFloat(lng).toFixed(4)}` : 'Location pending')}</div>
                              <div className="text-xs text-slate-500 truncate">{mapAddressLoading ? 'Please allow permissions...' : (address || 'Drag the map to select your location')}</div>
                            </div>
                          </div>
                          <div className="flex items-center w-full mt-1">
                            <button type="button" onClick={fetchGPSLocation} disabled={mapAddressLoading} className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-white border border-slate-200 text-sm font-semibold text-slate-700 hover:text-primary hover:border-primary/30 shadow-sm cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed transition-all">
                              <LocateFixed className="size-4" /> Use Current Location
                            </button>
                          </div>
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
                        <input id="tfloors" type="number" min="1" placeholder="14" value={tfloors} onChange={e => handleTfloorsChange(e.target.value)} className={inputCls} />
                      </Field>
                      <Field id="ffrom" label="Floor Number" tip="The starting floor of the property (0 for ground)">
                        <input id="ffrom" type="number" min="0" placeholder="0" value={ffrom} onChange={e => {
                          const val = e.target.value ? parseInt(e.target.value) : '';
                          setFfrom(val);
                          if (val !== '' && fto === '') setFto(val);
                          else if (val !== '' && typeof fto === 'number' && fto < val) setFto(val);
                        }} className={inputCls} />
                      </Field>
                      <Field id="num_floors" label="Number of Floors" tip="How many floors does this property span? (e.g., 1 for typical apartment, 2 for duplex)">
                        <input id="num_floors" type="number" min="1" placeholder="1" value={typeof fto === 'number' && typeof ffrom === 'number' ? Math.max(1, fto - ffrom + 1) : 1} onChange={e => {
                          const span = parseInt(e.target.value) || 1;
                          if (typeof ffrom === 'number') {
                            setFto(ffrom + Math.max(1, span) - 1);
                          }
                        }} className={inputCls} />
                      </Field>
                      <Field id="lift_gaccess" label="Accessibility" tip="Indicate if the building has a lift or ground floor access.">
                        <div className="flex gap-3">
                          <Chip id="lift" label="Lift" checked={lift} onChange={setLift} disabled={tfloors === 1} />
                          <Chip id="gaccess" label="Ground Access" checked={gaccess} onChange={setGaccess} disabled={tfloors === 1} />
                        </div>
                      </Field>
                      
                      {numUnitFloors > 1 && (
                        <div className="pt-5 border-t border-border mt-6 animate-in fade-in slide-in-from-top-2">
                          <div className="flex items-center justify-between mb-4">
                            <div>
                              <label className="text-sm font-semibold text-slate-900 block">Area Distribution</label>
                              <span className="text-[10px] text-slate-500">Configure area per floor</span>
                            </div>
                            <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-slate-700 bg-slate-50 px-3 py-1.5 rounded-lg border border-border hover:bg-slate-100 transition">
                              <input type="checkbox" checked={sameArea} onChange={e => setSameArea(e.target.checked)} className="rounded border-slate-300 text-primary focus:ring-primary" />
                              All floors have same area
                            </label>
                          </div>
                          {!sameArea && (
                            <div className="space-y-3 pl-4 border-l-[3px] border-primary/20 py-1">
                              {Array.from({ length: numUnitFloors }).map((_, i) => {
                                const floorNum = startF + i
                                return (
                                  <div key={floorNum} className="flex items-center gap-4 bg-slate-50/50 p-2 rounded-lg border border-border/50">
                                    <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-xs shrink-0">
                                      {floorNum === 0 ? 'G' : floorNum}
                                    </div>
                                    <span className="text-sm font-medium text-slate-700 w-20">Floor {floorNum}</span>
                                    <input type="number" placeholder="Carpet Area (sqft)" value={floorAreas[floorNum] || ''} onChange={e => setFloorAreas({ ...floorAreas, [floorNum]: e.target.value })} className={cn(inputCls, 'py-2 text-sm')} />
                                  </div>
                                )
                              })}
                            </div>
                          )}
                        </div>
                      )}
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
                    <StepHeading title="Legal Status" subtitle="Select the legal parameters of the property" />
                    <div className="space-y-10 mt-8">
                      <Field id="ownership_type" label="Ownership Type" tip="This significantly impacts liquidity and valuation.">
                        <div className="flex flex-col gap-2 pt-1">
                          <RadioOption id="freehold" name="ownership_type" label="Freehold" desc="Absolute ownership of the property and the land it stands on." checked={ownershipType === 'freehold'} onChange={() => setOwnershipType('freehold')} />
                          <RadioOption id="leasehold" name="ownership_type" label="Leasehold" desc="Ownership for a fixed period, land belongs to a freeholder." checked={ownershipType === 'leasehold'} onChange={() => setOwnershipType('leasehold')} />
                        </div>
                      </Field>
                      <Field id="title_status" label="Title Status" tip="Determines if there are any legal barriers to transfer.">
                        <div className="flex flex-col gap-2 pt-1">
                          <RadioOption id="ctitle" name="title_status" label="Clear Title" desc="Legally verified ownership with no pending disputes or liens." checked={titleStatus === 'ctitle'} onChange={() => setTitleStatus('ctitle')} />
                          <RadioOption id="complications" name="title_status" label="Legal Complications" desc="Pending litigation, disputed ownership, or unclear title." checked={titleStatus === 'complications'} onChange={() => setTitleStatus('complications')} />
                        </div>
                      </Field>
                    </div>
                  </div>
                </div>

                {/* Footer Navigation */}
                <div className="p-6 md:p-8 bg-slate-50 border-t border-border flex items-center justify-between mt-auto">
                  {step > 0 ? (
                    <button type="button" onClick={() => setStep(step - 1)} className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-muted-foreground hover:text-foreground hover:bg-slate-200 transition cursor-pointer">
                      <ChevronLeft className="size-4" /> Back
                    </button>
                  ) : <div />}
                  
                  {step < STEPS.length - 1 ? (
                    <button type="button" onClick={goNext} className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-primary text-white text-sm font-semibold shadow-lg shadow-blue-500/30 hover:bg-blue-700 transition active:scale-[0.98] cursor-pointer">
                      Continue <ArrowRight className="size-4" />
                    </button>
                  ) : (
                    <button type="button" onClick={() => handleSubmit()} className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-slate-900 text-white text-sm font-semibold shadow-lg shadow-slate-900/20 hover:bg-black transition active:scale-[0.98] cursor-pointer">
                      Continue to Photos <ArrowRight className="size-4" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          </form>
        </div>

        {/* Map Container (Step 0 side-by-side) */}
        {locMethod === 'map' && step === 0 && (
          <div className="w-full xl:flex-1 h-[400px] xl:h-auto self-stretch bg-slate-100 rounded-2xl shadow-xl shadow-blue-900/5 border border-white/80 overflow-hidden relative animate-in fade-in zoom-in-95 duration-500">
            <MapContainer center={mapCenter} zoom={15} zoomControl={false} className="w-full h-full">
              <TileLayer attribution='&copy; Google' url="https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}" />
              <MapCenterObserver onCenterChange={(c) => { setMapCenter([c.lat, c.lng]); debouncedReverseGeocode(c.lat, c.lng) }} />
              {flyToCoords && <FlyTo coords={flyToCoords} onDone={() => setFlyToCoords(null)} />}
            </MapContainer>
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-[100%] pointer-events-none z-[400] pb-1 drop-shadow-xl">
              <img src="https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png" alt="pin" className="h-12 -mt-6" />
            </div>
            <button type="button" onClick={mapLocateMe} className="absolute bottom-6 right-6 z-[400] w-12 h-12 bg-white rounded-full shadow-lg flex items-center justify-center text-slate-700 hover:text-primary transition-colors border border-slate-200">
              <LocateFixed className="size-5" />
            </button>
            <div className="absolute top-6 left-6 right-6 z-[400] pointer-events-none">
              <div className="bg-white/90 backdrop-blur-md px-4 py-3 rounded-xl shadow-lg border border-slate-200/50">
                <div className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-0.5">Map Center Location</div>
                <div className="text-sm font-semibold text-slate-900 line-clamp-2">{mapAddressLoading ? 'Updating...' : mapAddress}</div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

/* ── Sub-components ── */
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

function Chip({ id, label, defaultChecked, checked, onChange, disabled }: { id: string; label: string; defaultChecked?: boolean; checked?: boolean; onChange?: (v: boolean) => void; disabled?: boolean }) {
  const isControlled = checked !== undefined
  const [internalOn, setInternalOn] = useState(defaultChecked || false)
  const on = isControlled ? checked : internalOn
  return (
    <label htmlFor={id}
      className={cn(
        'flex items-center gap-3 px-4 py-3 rounded-xl border transition-all',
        disabled ? 'opacity-50 cursor-not-allowed bg-slate-50 border-border' : 'cursor-pointer hover:border-slate-300',
        !disabled && on ? 'border-primary bg-primary/5 text-foreground shadow-sm' : 'bg-white text-muted-foreground'
      )}
    >
      <input type="checkbox" id={id} checked={on} disabled={disabled} onChange={e => { if(isControlled && onChange) onChange(e.target.checked); else setInternalOn(e.target.checked) }} className="sr-only" />
      <div className={cn(
        'w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all shrink-0',
        on ? 'border-primary bg-primary' : 'border-slate-300',
        disabled && on && 'border-slate-400 bg-slate-400'
      )}>
        {on && <div className="w-2 h-2 rounded-full bg-white" />}
      </div>
      <span className="text-sm font-medium flex-1">{label}</span>
    </label>
  )
}

function RadioOption({ id, name, label, desc, checked, onChange }: { id: string; name: string; label: string; desc: string; checked: boolean; onChange: () => void }) {
  return (
    <label htmlFor={id} className="flex items-start gap-3 cursor-pointer group py-2">
      <input type="radio" id={id} name={name} checked={checked} onChange={onChange} className="sr-only" />
      <div className={cn(
        'mt-[3px] w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all shrink-0',
        checked ? 'border-[#0088ff] bg-[#0088ff]' : 'border-slate-300 group-hover:border-[#0088ff]'
      )}>
        {checked && <div className="w-2 h-2 rounded-full bg-white" />}
      </div>
      <div className="flex flex-col">
        <span className="text-[15px] font-medium text-slate-700 leading-snug">{label}</span>
        <span className="text-xs text-slate-400 mt-0.5">{desc}</span>
      </div>
    </label>
  )
}

/* ── Leaflet Helpers ── */
function MapCenterObserver({ onCenterChange }: { onCenterChange: (center: L.LatLng) => void }) {
  const map = useMapEvents({
    moveend: () => onCenterChange(map.getCenter())
  })
  return null
}

function FlyTo({ coords, onDone }: { coords: [number, number]; onDone: () => void }) {
  const map = useMap()
  useEffect(() => { 
    map.flyTo(coords, 16, { animate: true, duration: 1 })
    const t = setTimeout(onDone, 1200)
    return () => clearTimeout(t)
  }, [coords, map, onDone])
  return null
}
