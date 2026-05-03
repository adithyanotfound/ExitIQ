import { Link } from 'react-router-dom'

export default function Navbar() {
  return (
    <nav className="fixed top-0 left-0 right-0 z-50 h-14 flex items-center justify-between px-6 bg-white/70 backdrop-blur-xl border-b border-border">
      <Link to="/" className="flex items-center gap-2 text-foreground no-underline">
        <div className="w-7 h-7 rounded-lg bg-primary grid place-items-center text-[11px] text-white font-bold">E</div>
        <span className="text-[15px] font-bold tracking-tight">ExitIQ</span>
      </Link>
      <div className="flex items-center gap-1">
        <Link to="/" className="px-3 py-1.5 rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition no-underline">Home</Link>
        <Link to="/valuate" className="px-4 py-1.5 rounded-lg text-sm font-semibold bg-primary text-white hover:bg-blue-700 transition no-underline">Valuate</Link>
      </div>
    </nav>
  )
}
