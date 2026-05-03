import { Link, useLocation } from 'react-router-dom'

export default function Navbar() {
  const { pathname } = useLocation()
  return (
    <nav className="fixed top-0 left-0 right-0 z-50 h-14 flex items-center justify-between px-5 bg-black/70 backdrop-blur-xl border-b border-zinc-800/50">
      <Link to="/" className="flex items-center gap-2 text-white no-underline">
        <div className="w-7 h-7 rounded-md bg-white grid place-items-center text-[11px] font-extrabold text-black">E</div>
        <span className="text-sm font-bold tracking-tight">ExitIQ</span>
      </Link>
      <div className="flex items-center gap-1">
        <Link to="/" className={`px-3 py-1.5 rounded-md text-xs font-medium transition no-underline ${pathname === '/' ? 'text-white' : 'text-zinc-500 hover:text-zinc-300'}`}>Home</Link>
        <Link to="/valuate" className="px-3.5 py-1.5 rounded-md text-xs font-semibold bg-white text-black hover:bg-zinc-200 transition no-underline">Valuate</Link>
      </div>
    </nav>
  )
}
