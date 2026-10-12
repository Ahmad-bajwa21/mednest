// Loads a profile's full record bundle (profile + documents + medicines + results) for
// the overview, timeline, meds, ask and summary screens. Re-fetches on `nonce` change.
import { useCallback, useEffect, useState } from 'react';
import { getProfileById } from '../data/profileRepo';
import { loadBundle } from '../data/recordsRepo';
import type { ProfileBundle } from '../domain/types';

export function useBundle(id: string | undefined) {
  const [bundle, setBundle] = useState<ProfileBundle | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    if (!id) {
      setBundle(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    const p = await getProfileById(id);
    if (!p) {
      setBundle(null);
      setLoading(false);
      return;
    }
    const b = await loadBundle(id, {
      id: p.id,
      name: p.name,
      birthYear: p.birthYear,
      sex: p.sex,
      allergies: p.allergies,
    });
    setBundle(b);
    setLoading(false);
  }, [id]);

  useEffect(() => {
    reload();
  }, [reload]);

  return { bundle, loading, reload };
}
