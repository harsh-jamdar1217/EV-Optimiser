import { useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { getActiveProfile } from '../utils/activeProfile';

const mobileItems = [
  { to: '/dashboard', label: 'Dashboard' },
  { to: '/ev-profile', label: 'EV Profile' },
  { to: '/performance', label: 'Performance' },
  { to: '/battery', label: 'Battery' },
  { to: '/range', label: 'Range' },
  { to: '/charging', label: 'Charging' },
  { to: '/degradation', label: 'Degradation' },
  { to: '/cost', label: 'Cost' },
  { to: '/health', label: 'Health' },
  { to: '/ai-advisor', label: 'AI Advisor' },
  { to: '/digital-twin', label: 'Digital Twin' },
  { to: '/reports', label: 'Reports' },
];

export default function Navbar() {
  const [activeProfile, setActiveProfile] = useState(() => getActiveProfile());
  const [open, setOpen] = useState(false);

  useEffect(() => {
    function syncActiveProfile() {
      setActiveProfile(getActiveProfile());
    }

    window.addEventListener('active-profile-change', syncActiveProfile);
    window.addEventListener('storage', syncActiveProfile);
    return () => {
      window.removeEventListener('active-profile-change', syncActiveProfile);
      window.removeEventListener('storage', syncActiveProfile);
    };
  }, []);

  return (
    <header className="sticky top-0 z-20 border-b border-slate-700 bg-slate-900/80 backdrop-blur">
      <div className="flex h-16 items-center justify-between px-4 sm:px-6 lg:px-8">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-300">EV Optimizer</p>
          <h1 className="mt-1 text-sm font-semibold text-white sm:text-base">
            {activeProfile ? activeProfile.vehicle_model : 'Select an active EV profile'}
          </h1>
        </div>

        <div className="hidden items-center gap-3 sm:flex">
          <div className="rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-right">
            <div className="text-xs text-slate-400">Active Profile</div>
            <div className="max-w-48 truncate text-sm font-semibold text-white">
              {activeProfile ? activeProfile.vehicle_model : 'Not selected'}
            </div>
          </div>
          <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-blue-400/30 bg-blue-500/10 text-sm font-bold text-blue-200">
            EV
          </div>
        </div>

        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm font-semibold text-white md:hidden"
        >
          Menu
        </button>
      </div>

      {open ? (
        <nav className="grid max-h-[70vh] gap-1 overflow-y-auto border-t border-slate-700 bg-slate-950 p-3 md:hidden">
          {mobileItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={() => setOpen(false)}
              className={({ isActive }) =>
                [
                  'rounded-lg px-3 py-2 text-sm',
                  isActive ? 'bg-emerald-500/15 text-emerald-100' : 'text-slate-300 hover:bg-slate-800',
                ].join(' ')
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      ) : null}
    </header>
  );
}
