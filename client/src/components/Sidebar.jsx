import { NavLink } from 'react-router-dom';

const items = [
  { to: '/dashboard', label: 'Dashboard', icon: 'DB' },
  { to: '/ev-profile', label: 'EV Profile', icon: 'EV' },
  { to: '/performance', label: 'Performance', icon: 'PF' },
  { to: '/battery', label: 'Battery', icon: 'BT' },
  { to: '/range', label: 'Range', icon: 'RG' },
  { to: '/charging', label: 'Charging', icon: 'CH' },
  { to: '/degradation', label: 'Degradation', icon: 'DG' },
  { to: '/cost', label: 'Cost', icon: 'IN' },
  { to: '/health', label: 'Health', icon: 'HS' },
  { to: '/ai-advisor', label: 'AI Advisor', icon: 'AI' },
  { to: '/digital-twin', label: 'Digital Twin', icon: 'DT' },
  { to: '/reports', label: 'Reports', icon: 'RP' },
];

export default function Sidebar() {
  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-72 border-r border-slate-700 bg-slate-950/85 backdrop-blur md:block">
      <div className="flex h-full flex-col p-4">
        <div className="flex items-center gap-2">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-emerald-400/30 bg-emerald-500/15 shadow-lg shadow-emerald-950/30">
            <span className="text-emerald-400 font-bold">EV</span>
          </div>
          <div>
            <div className="font-semibold leading-tight text-white">EV Optimizer</div>
            <div className="text-xs text-slate-400">Battery intelligence</div>
          </div>
        </div>

        <nav className="mt-7 flex-1 space-y-1 overflow-y-auto pr-1">
          {items.map((it) => (
            <NavLink
              key={it.to}
              to={it.to}
              className={({ isActive }) =>
                [
                  'flex items-center gap-3 rounded-xl border px-3 py-2.5 text-sm transition',
                  isActive
                    ? 'border-emerald-400/40 bg-emerald-400/10 text-emerald-100 shadow-lg shadow-emerald-950/20'
                    : 'border-transparent text-slate-300 hover:border-slate-700 hover:bg-slate-800 hover:text-white',
                ].join(' ')
              }
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-800 text-[11px] font-bold text-slate-300">
                {it.icon}
              </span>
              <span>{it.label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="mt-4 rounded-xl border border-blue-400/20 bg-blue-500/10 p-3 text-xs text-blue-100">
          <div className="font-semibold">Module build mode</div>
          <div className="mt-1 text-blue-100/75">FR-01 active profile foundation is ready.</div>
        </div>
      </div>
    </aside>
  );
}

