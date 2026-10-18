import { NavLink, Outlet } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useSession } from '../lib/session';

const NAV = [
  { to: '/', label: 'Overview', end: true },
  { to: '/templates', label: 'Model Armor templates' },
  { to: '/dlp', label: 'DLP templates' },
  { to: '/playground', label: 'Policy playground' },
  { to: '/apps', label: 'Applications' },
];

export function Layout() {
  const { me, location, setLocation } = useSession();
  const queryClient = useQueryClient();

  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-60 shrink-0 flex-col border-r border-slate-200 bg-white md:flex">
        <div className="border-b border-slate-100 px-5 py-4">
          <div className="text-sm font-semibold text-slate-900">AI Policy Console</div>
          <div className="truncate text-xs text-slate-500" title={me.projectId}>
            {me.projectId}
          </div>
        </div>
        <nav className="flex-1 space-y-0.5 p-3">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `block rounded-md px-3 py-2 text-sm font-medium ${
                  isActive ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        {me.mode === 'mock' && (
          <div className="m-3 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
            Demo mode: Google APIs are simulated and nothing is saved to Google Cloud.
          </div>
        )}
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between gap-4 border-b border-slate-200 bg-white px-6 py-3">
          <nav className="flex gap-3 overflow-x-auto md:hidden">
            {NAV.map((item) => (
              <NavLink key={item.to} to={item.to} end={item.end} className="whitespace-nowrap text-sm text-slate-600">
                {item.label}
              </NavLink>
            ))}
          </nav>
          <div className="hidden md:block" />
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 text-sm text-slate-600">
              Region
              <select
                className="rounded-md border border-slate-300 bg-white px-2 py-1 text-sm"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
              >
                {me.locations.map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex items-center gap-2">
              {me.picture && <img src={me.picture} alt="" className="h-7 w-7 rounded-full" referrerPolicy="no-referrer" />}
              <span className="hidden text-sm text-slate-700 sm:inline">{me.email}</span>
            </div>
            {me.mode === 'live' && (
              <button
                type="button"
                className="text-sm text-slate-500 hover:text-slate-800"
                onClick={async () => {
                  await api.logout();
                  queryClient.clear();
                  window.location.href = '/auth/login';
                }}
              >
                Sign out
              </button>
            )}
          </div>
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
