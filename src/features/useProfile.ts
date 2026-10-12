// Load a single profile by id (for the edit and overview routes).
import { useEffect, useState } from 'react';
import { getProfileById } from '../data/profileRepo';
import type { ProfileRow } from '../data/schema';

export function useProfile(id: string | undefined) {
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      const p = id ? await getProfileById(id) : undefined;
      if (active) {
        setProfile(p ?? null);
        setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [id]);
  return { profile, loading };
}
