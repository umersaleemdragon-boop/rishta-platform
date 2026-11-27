import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Platform, Text } from 'react-native';
import { ageFromDob, PageTitle, Panel, QueueItem, Split } from '../../../components/admin';
import { AdminProfileCard } from '../../../components/AdminProfile';
import { EmptyState } from '../../../components/kit';
import { Banner, Button, Field, Row } from '../../../components/ui';
import type { Profile } from '../../../lib/profile';
import { supabase } from '../../../lib/supabase';
import { colors } from '../../../lib/theme';

export default function Approvals() {
  const [queue, setQueue] = useState<Profile[]>([]);
  const [sel, setSel] = useState(0);
  const [prefs, setPrefs] = useState<Record<string, unknown> | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'error' | 'success'; text: string } | null>(null);

  const load = useCallback(async () => {
    const { data } = await supabase.from('profiles').select('*').eq('status', 'pending_review').order('updated_at');
    setQueue((data ?? []) as Profile[]);
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const cur = queue[Math.min(sel, queue.length - 1)];
  useEffect(() => {
    if (!cur) return;
    setNote('');
    supabase.from('partner_preferences').select('*').eq('profile_id', cur.id).maybeSingle().then(({ data }) => setPrefs(data));
  }, [cur?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const decide = useCallback(async (approve: boolean) => {
    if (!cur) return;
    if (!approve && !note.trim()) { setMsg({ kind: 'error', text: 'Write a note so the member knows what to fix.' }); return; }
    setBusy(true); setMsg(null);
    const { error } = await supabase.rpc('admin_review_profile', { p_profile: cur.id, p_approve: approve, p_note: approve ? null : note.trim() });
    setBusy(false);
    if (error) { setMsg({ kind: 'error', text: error.message }); return; }
    setMsg({ kind: 'success', text: `${cur.first_name} (${cur.public_code}) ${approve ? 'approved' : 'sent back'}.` });
    load();
  }, [cur, note, load]);

  // Keyboard shortcuts on the web: ↑/↓ move, A approve, S send back.
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.key === 'ArrowDown') setSel((i) => Math.min(i + 1, queue.length - 1));
      else if (e.key === 'ArrowUp') setSel((i) => Math.max(i - 1, 0));
      else if (e.key.toLowerCase() === 'a') decide(true);
      else if (e.key.toLowerCase() === 's') decide(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [queue.length, decide]);

  const flag = (p: Profile) => p.completeness < 50 ? 'Less than half complete'
    : ageFromDob(p.date_of_birth) < 20 ? 'Under 20 — double-check date of birth'
    : p.approved_at ? 'Edited after approval (name or date of birth changed)' : null;

  return (
    <>
      <PageTitle title="Profile approvals" sub="New and edited profiles · shortcuts on a computer: ↑ ↓ move · A approve · S send back" />
      {msg && <Banner kind={msg.kind}>{msg.text}</Banner>}
      {queue.length === 0 ? <EmptyState icon="checkmark-done-circle-outline" text="All caught up — no profiles waiting." /> : (
        <Split
          left={queue.map((p, i) => (
            <QueueItem key={p.id} title={`${p.first_name}, ${ageFromDob(p.date_of_birth)} · ${p.public_code}`}
              sub={`${p.gender} · ${p.city ?? '—'} · ${p.managed_by}`} flag={flag(p)} selected={p.id === cur?.id} onPress={() => setSel(i)}
              right={p.updated_at ? new Date(p.updated_at).toLocaleDateString() : undefined} />
          ))}
          right={cur && (
            <>
              <AdminProfileCard p={cur} prefs={prefs} />
              <Panel>
                <Text style={{ fontSize: 13, color: colors.muted }}>Check: name and age look genuine · about text is respectful with no contact details · not a duplicate.</Text>
                <Field label="Note to member (needed when sending back)" value={note} onChangeText={setNote} multiline placeholder="e.g. Please add your education details" />
                <Row>
                  <Button title="Approve · A" onPress={() => decide(true)} loading={busy} />
                  <Button title="Send back with note · S" variant="secondary" onPress={() => decide(false)} disabled={busy} />
                </Row>
                <Text style={{ fontSize: 12, color: colors.muted }}>Every decision is recorded in the audit log with your name.</Text>
              </Panel>
            </>
          )}
        />
      )}
    </>
  );
}
