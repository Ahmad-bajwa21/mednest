// Profiles store (Zustand) over the repository. Screens read from here; all writes go
// through profileRepo so the 4-profile cap and cascade rules are always enforced.
import { create } from 'zustand';
import { deleteProfileCascade, insertProfileChecked, listProfiles, updateProfile, type NewProfile } from '../data/profileRepo';
import type { ProfileRow } from '../data/schema';

interface ProfilesState {
  profiles: ProfileRow[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  add: (p: NewProfile) => Promise<ProfileRow | null>;
  update: (id: string, patch: Partial<ProfileRow>) => Promise<void>;
  remove: (id: string) => Promise<void>;
}

export const useProfiles = create<ProfilesState>((set, get) => ({
  profiles: [],
  loading: false,
  error: null,
  refresh: async () => {
    set({ loading: true, error: null });
    try {
      set({ profiles: await listProfiles(), loading: false });
    } catch (e) {
      set({ loading: false, error: (e as Error).message });
    }
  },
  add: async (p) => {
    try {
      const row = await insertProfileChecked(p);
      await get().refresh();
      return row;
    } catch (e) {
      set({ error: (e as Error).message });
      return null;
    }
  },
  update: async (id, patch) => {
    await updateProfile(id, patch);
    await get().refresh();
  },
  remove: async (id) => {
    await deleteProfileCascade(id);
    await get().refresh();
  },
}));
