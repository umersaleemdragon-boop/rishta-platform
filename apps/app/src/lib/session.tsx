import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useAuth } from './auth';
import { supabase } from './supabase';

// Everything the member app needs to know about "who am I acting as".
export type MyProfile = {
  id: string; public_code: string; first_name: string; status: string; gender: 'male' | 'female';
  completeness: number; managed_by: string; review_note: string | null; verification_level: string;
};
export type Guarded = { profile_id: string; public_code: string; first_name: string; relation: string; status: string };
export type Entitlements = {
  tier: 'free' | 'basic' | 'premium'; plan_ends_at: string | null; daily_interest_limit: number; interests_sent_24h: number;
  can_browse_full_profiles: boolean; can_send_interest: boolean; can_unlock_contacts: boolean;
};

type Session = {
  loading: boolean;
  fullName: string | null;
  profiles: MyProfile[];
  guarded: Guarded[];
  active: MyProfile | null;
  setActiveId: (id: string) => void;
  entitlements: Entitlements | null;
  staffRole: string | null;
  refresh: () => Promise<void>;
};

const Ctx = createContext<Session | null>(null);
const KEY = 'zaujyn.activeProfile';

export function SessionProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const uid = session?.user.id;
  const [loading, setLoading] = useState(true);
  const [fullName, setFullName] = useState<string | null>(null);
  const [profiles, setProfiles] = useState<MyProfile[]>([]);
  const [guarded, setGuarded] = useState<Guarded[]>([]);
  const [activeId, setActiveIdState] = useState<string | null>(null);
  const [entitlements, setEntitlements] = useState<Entitlements | null>(null);
  const [staffRole, setStaffRole] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!uid) return;
    const [me, mine, g, staff, saved] = await Promise.all([
      supabase.from('app_users').select('full_name').eq('id', uid).maybeSingle(),
      supabase.from('profiles')
        .select('id,public_code,first_name,status,gender,completeness,managed_by,review_note,verification_level')
        .eq('owner_user_id', uid).neq('status', 'deleted').order('created_at'),
      supabase.rpc('list_my_guarded_profiles'),
      supabase.from('staff_members').select('role,is_active').eq('user_id', uid).maybeSingle(),
      AsyncStorage.getItem(KEY).catch(() => null),
    ]);
    const list = (mine.data ?? []) as MyProfile[];
    setFullName(me.data?.full_name ?? null);
    setProfiles(list);
    setGuarded((g.data ?? []) as Guarded[]);
    setStaffRole(staff.data?.is_active ? staff.data.role : null);
    setActiveIdState((cur) => {
      const want = cur ?? saved;
      return list.some((p) => p.id === want) ? want : list[0]?.id ?? null;
    });
    setLoading(false);
  }, [uid]);

  useEffect(() => { refresh(); }, [refresh]);

  useEffect(() => {
    if (!activeId) { setEntitlements(null); return; }
    supabase.rpc('my_entitlements', { p_profile: activeId })
      .then(({ data }) => setEntitlements((data as Entitlements) ?? null));
  }, [activeId, profiles]);

  const setActiveId = useCallback((id: string) => {
    setActiveIdState(id);
    AsyncStorage.setItem(KEY, id).catch(() => {});
  }, []);

  const value = useMemo<Session>(() => ({
    loading, fullName, profiles, guarded, entitlements, staffRole, refresh, setActiveId,
    active: profiles.find((p) => p.id === activeId) ?? null,
  }), [loading, fullName, profiles, guarded, entitlements, staffRole, refresh, setActiveId, activeId]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSession() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useSession must be used inside SessionProvider');
  return v;
}

// Can this profile browse at all? (submitted for review or live)
export const canBrowse = (p: MyProfile | null) => !!p && ['active', 'pending_review', 'paused'].includes(p.status);
