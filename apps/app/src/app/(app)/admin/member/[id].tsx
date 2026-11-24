import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { KV, PageTitle, Panel } from '../../../../components/admin';
import { AdminProfileCard } from '../../../../components/AdminProfile';
import { Tag } from '../../../../components/kit';
import { Banner, Button, ChipSelect, Field, Row } from '../../../../components/ui';
import type { Profile } from '../../../../lib/profile';
import { useSession } from '../../../../lib/session';
import { supabase } from '../../../../lib/supabase';
import { colors, space } from '../../../../lib/theme';

type Note = { id: string; body: string; created_at: string };
type Sub = { id: string; plan_id: string; starts_at: string; ends_at: string; cancelled_at: string | null; note: string | null };
type Match = { profile_id: string; public_code: string; first_name: string; age: number; city: string | null; sect: string | null;
  education_level: string | null; profession: string | null; match_score: number; source: string; already_suggested: boolean };

export default function AdminMember() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { staffRole } = useSession();
  const [p, setP] = useState<Profile | null>(null);
  const [prefs, setPrefs] = useState<Record<string, unknown> | null>(null);
  const [notes, setNotes] = useState<Note[]>([]);
  const [subs, setSubs] = useState<Sub[]>([]);
  const [matches, setMatches] = useState<Match[] | null>(null);
  const [newNote, setNewNote] = useState('');
  const [plan, setPlan] = useState<string | null>('basic');
  const [days, setDays] = useState('30');
  const [grantNote, setGrantNote] = useState('');
  const [suggestNote, setSuggestNote] = useState('');
  const [msg, setMsg] = useState<{ kind: 'error' | 'success'; text: string } | null>(null);

  const load = useCallback(async () => {
    const [a, b, c, d] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', id).single(),
      supabase.from('partner_preferences').select('*').eq('profile_id', id).maybeSingle(),
      supabase.from('profile_notes').select('id,body,created_at').eq('profile_id', id).order('created_at', { ascending: false }),
      supabase.from('subscriptions').select('id,plan_id,starts_at,ends_at,cancelled_at,note').eq('profile_id', id).order('ends_at', { ascending: false }),
    ]);
    setP(a.data as Profile); setPrefs(b.data); setNotes((c.data ?? []) as Note[]); setSubs((d.data ?? []) as Sub[]);
  }, [id]);
  useEffect(() => { load(); }, [load]);

  async function run(fn: string, args: Record<string, unknown>, ok: string) {
    setMsg(null);
    const { error } = await supabase.rpc(fn, args);
    if (error) setMsg({ kind: 'error', text: error.message }); else { setMsg({ kind: 'success', text: ok }); load(); }
  }
  async function addNote() {
    const { data: u } = await supabase.auth.getUser();
    const { error } = await supabase.from('profile_notes').insert({ profile_id: id, author_id: u.user?.id, body: newNote.trim() });
    if (error) setMsg({ kind: 'error', text: error.message }); else { setNewNote(''); load(); }
  }
  async function loadMatches() {
    const { data, error } = await supabase.rpc('admin_top_matches', { p_profile: id, p_limit: 15 });
    if (error) setMsg({ kind: 'error', text: error.message }); else setMatches((data ?? []) as Match[]);
  }

  if (!p) return <PageTitle title="Loading…" />;
  const isMatchmaker = staffRole === 'super_admin' || staffRole === 'matchmaker';
  const isAccountant = staffRole === 'super_admin' || staffRole === 'accountant';
  const isVerifier = staffRole === 'super_admin' || staffRole === 'verifier';

  return (
    <>
      <Button title="← All members" variant="ghost" onPress={() => router.push('/admin/members')} />
      {msg && <Banner kind={msg.kind}>{msg.text}</Banner>}
      <AdminProfileCard p={p} prefs={prefs} />

      <Panel>
        <Text style={{ fontSize: 17, fontWeight: '800', color: colors.primary }}>Status & verification</Text>
        <KV k="Source" v={p.source === 'bureau_offline' ? `Bureau client${p.legacy_ref ? ` (${p.legacy_ref})` : ''}` : 'Registered in app'} />
        <Row>
          {(isVerifier || isMatchmaker) && p.status !== 'active' && <Button title="Activate" onPress={() => run('admin_set_profile_status', { p_profile: id, p_status: 'active', p_reason: null }, 'Activated')} />}
          {(isVerifier || isMatchmaker) && p.status === 'active' && <Button title="Pause (hide)" variant="secondary" onPress={() => run('admin_set_profile_status', { p_profile: id, p_status: 'paused', p_reason: 'Paused by staff' }, 'Paused')} />}
          {(isVerifier || isMatchmaker) && p.status !== 'suspended' && <Button title="Suspend" variant="danger" onPress={() => run('admin_set_profile_status', { p_profile: id, p_status: 'suspended', p_reason: 'Suspended by staff' }, 'Suspended')} />}
          {isVerifier && p.verification_level !== 'bureau' && <Button title="Mark bureau verified" variant="secondary" onPress={() => run('admin_mark_bureau_verified', { p_profile: id, p_note: 'Interviewed by bureau' }, 'Bureau verified')} />}
          {isMatchmaker && p.source === 'bureau_offline' && (
            <Button title={p.listing_consent ? 'Remove from app listing' : 'Family agreed: list in app'} variant="secondary"
              onPress={() => run('admin_record_listing_consent', { p_profile: id, p_consent: !p.listing_consent, p_note: null }, 'Consent updated')} />
          )}
        </Row>
      </Panel>

      <Panel>
        <Text style={{ fontSize: 17, fontWeight: '800', color: colors.primary }}>Plans</Text>
        {subs.length === 0 && <Text style={{ color: colors.muted }}>Free plan — no subscriptions.</Text>}
        {subs.map((s) => (
          <Row key={s.id} style={{ alignItems: 'center' }}>
            <Tag label={s.plan_id} tone={new Date(s.ends_at) > new Date() && !s.cancelled_at ? 'green' : 'grey'} />
            <Text style={{ color: colors.text }}>{new Date(s.starts_at).toLocaleDateString()} → {new Date(s.ends_at).toLocaleDateString()}{s.cancelled_at ? ' (cancelled)' : ''}{s.note ? ` · ${s.note}` : ''}</Text>
          </Row>
        ))}
        {isAccountant && (
          <>
            <ChipSelect label="Give a free plan" value={plan} onChange={setPlan} options={[{ value: 'basic', label: 'Basic' }, { value: 'premium', label: 'Premium' }]} />
            <Row>
              <View style={{ width: 120 }}><Field label="Days" value={days} onChangeText={(v) => setDays(v.replace(/\D/g, ''))} keyboardType="number-pad" /></View>
              <View style={{ flex: 1, minWidth: 200 }}><Field label="Reason" required value={grantNote} onChangeText={setGrantNote} placeholder="e.g. Launch offer" /></View>
            </Row>
            <Button title="Grant plan" variant="secondary" disabled={!grantNote.trim()}
              onPress={() => run('admin_grant_subscription', { p_profile: id, p_plan: plan, p_days: parseInt(days, 10), p_note: grantNote.trim() }, 'Plan granted')} />
          </>
        )}
      </Panel>

      {isMatchmaker && (
        <Panel>
          <Text style={{ fontSize: 17, fontWeight: '800', color: colors.primary }}>Matchmaking</Text>
          <Field label="Note sent with a suggestion" value={suggestNote} onChangeText={setSuggestNote} placeholder="e.g. Similar family background, both from Lahore" />
          {!matches ? <Button title="Find best matches" onPress={loadMatches} /> : matches.length === 0 ? <Text style={{ color: colors.muted }}>No compatible active profiles yet.</Text> : (
            <View style={{ gap: space(2) }}>
              {matches.map((m) => (
                <Row key={m.profile_id} style={{ alignItems: 'center', borderTopWidth: 1, borderTopColor: '#EFEBE3', paddingTop: space(2) }}>
                  <Tag label={`${m.match_score}%`} tone="green" />
                  <Text style={{ flex: 1, minWidth: 200, color: colors.text }}>{m.first_name}, {m.age} · {m.public_code} · {m.city ?? ''} · {m.sect ?? ''} · {m.profession ?? m.education_level ?? ''}{m.source === 'bureau_offline' ? ' · bureau' : ''}</Text>
                  <Button title="Open" variant="ghost" onPress={() => router.push(`/admin/member/${m.profile_id}`)} />
                  {m.already_suggested ? <Tag label="suggested" tone="grey" /> : (
                    <Button title="Suggest" variant="secondary" onPress={() => run('admin_suggest_match', { p_profile: id, p_suggested: m.profile_id, p_note: suggestNote || null }, `Suggested ${m.first_name}`).then(loadMatches)} />
                  )}
                </Row>
              ))}
            </View>
          )}
        </Panel>
      )}

      <Panel>
        <Text style={{ fontSize: 17, fontWeight: '800', color: colors.primary }}>Staff notes (never shown to members)</Text>
        <Field label="Add a note" value={newNote} onChangeText={setNewNote} multiline placeholder="e.g. Father called, prefers Lahore families" />
        <Button title="Save note" variant="secondary" onPress={addNote} disabled={!newNote.trim()} />
        {notes.map((n) => (
          <View key={n.id} style={{ borderTopWidth: 1, borderTopColor: '#EFEBE3', paddingTop: space(2) }}>
            <Text style={{ fontSize: 12, color: colors.muted }}>{new Date(n.created_at).toLocaleString()}</Text>
            <Text style={{ fontSize: 14, color: colors.text, marginTop: 2 }}>{n.body}</Text>
          </View>
        ))}
      </Panel>
    </>
  );
}
