import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from './api';
import type { Me, PermissionKey } from './types';

interface SessionValue {
  me: Me;
  location: string;
  setLocation: (loc: string) => void;
  can: (p: PermissionKey) => boolean;
}

const SessionContext = createContext<SessionValue | undefined>(undefined);

const LOCATION_KEY = 'policy-console.location';

function readStoredLocation(): string | undefined {
  try {
    return localStorage.getItem(LOCATION_KEY) ?? undefined;
  } catch {
    return undefined;
  }
}

export function SessionProvider({ children, fallback }: { children: ReactNode; fallback: (state: { error?: unknown }) => ReactNode }) {
  const meQuery = useQuery({ queryKey: ['me'], queryFn: () => api.me(), staleTime: 5 * 60 * 1000 });
  const [location, setLocationState] = useState<string | undefined>(readStoredLocation);

  useEffect(() => {
    const locations = meQuery.data?.locations;
    if (locations?.length && (!location || !locations.includes(location))) {
      setLocationState(locations[0]);
    }
  }, [meQuery.data, location]);

  if (!meQuery.data || !location) return <>{fallback({ error: meQuery.error })}</>;

  const me = meQuery.data;
  const value: SessionValue = {
    me,
    location,
    setLocation: (loc) => {
      setLocationState(loc);
      try {
        localStorage.setItem(LOCATION_KEY, loc);
      } catch {
        // Storage may be unavailable; the choice then lasts for this page load only.
      }
    },
    can: (p) => Boolean(me.permissions[p]),
  };
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error('useSession must be used inside SessionProvider');
  return value;
}

export const NO_PERMISSION = 'Your Google Cloud IAM roles do not include this permission';
