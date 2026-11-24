import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Image, Text, View } from 'react-native';
import { KV, PageTitle, Panel, QueueItem, Split } from '../../../components/admin';
import { EmptyState } from '../../../components/kit';
import { Banner, Button, Field, Row } from '../../../components/ui';
import { supabase } from '../../../lib/supabase';
import { colors } from '../../../lib/theme';

type Req = {
  id: string; profile_id: string; level: string; cnic_front_path: string | null; cnic_back_path: string | null; selfie_path: string | null;
  created_at: string; profiles: { first_name: string; public_code: string; date_of_birth: string; gender: string } | null;
};

export default function Verifications() {
  const [rows, setRows] = useState<Req[]>([]);
  const [sel, setSel] = useState<Req | null>(null);
  const [imgs, setImgs] = useState<{ label: string; url: string }[]>([]);
  const [cnic, setCnic] = useState('');
  const [note, setNote] = useState('');
  const [msg, setMsg] = useState<{ kind: 'error' | 'success'; text: string } | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await supabase.from('verification_requests')
      .select('*, profiles(first_name, public_code, date_of_birth, gender)').eq('status', 'pending').order('created_at');
    if (error) setMsg({ kind: 'error', text: error.message });
    const list = (data ?? []) as Req[];
    setRows(list); setSel(list[0] ?? null);
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  useEffect(() => {
    setImgs([]); setCnic(''); setNote('');
    if (!sel) return;
    const parts: [string, string | null][] = [['CNIC front', sel.cnic_front_path], ['CNIC back', sel.cnic_back_path], ['Selfie', sel.selfie_path]];
    Promise.all(parts.filter(([, p]) => p).map(async ([label, p]) => {
      const { data } = await supabase.storage.from('verification-docs').createSignedUrl(p!, 300);
      return data?.signedUrl ? { label, url: data.signedUrl } : null;
    })).then((r) => setImgs(r.filter(Boolean) as { label: string; url: string }[]));
  }, [sel?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function decide(approve: boolean) {
    if (!sel) return;
    const { error } = await supabase.rpc('admin_review_verification', {
      p_request: sel.id, p_approve: approve, p_cnic_number: approve ? cnic : null, p_note: note || null });
    if (error) { setMsg({ kind: 'error', text: error.message === 'cnic_already_registered'
      ? 'This CNIC is already linked to another profile — likely a duplicate or fake account.' : error.message }); return; }
    setMsg({ kind: 'success', text: approve ? 'Verified — CNIC badge added.' : 'Rejected — member notified.' });
    load();
  }

  return (
    <>
      <PageTitle title="CNIC checks" sub="Compare the CNIC with the selfie and the profile. Only a scrambled CNIC number is stored." />
      {msg && <Banner kind={msg.kind}>{msg.text}</Banner>}
      {rows.length === 0 ? <EmptyState icon="card-outline" text="No CNIC checks waiting." /> : (
        <Split
          left={rows.map((r) => (
            <QueueItem key={r.id} title={`${r.profiles?.first_name ?? '?'} · ${r.profiles?.public_code ?? ''}`}
              sub={`${r.profiles?.gender ?? ''} · born ${r.profiles?.date_of_birth ?? '?'}`} selected={sel?.id === r.id} onPress={() => setSel(r)}
              right={new Date(r.created_at).toLocaleDateString()} />
          ))}
          right={sel && (
            <Panel>
              <KV k="Profile" v={`${sel.profiles?.first_name} · ${sel.profiles?.public_code} · born ${sel.profiles?.date_of_birth}`} />
              <Row>
                {imgs.map((i) => (
                  <View key={i.label} style={{ flex: 1, minWidth: 220, gap: 6 }}>
                    <Text style={{ fontWeight: '700', color: colors.text }}>{i.label}</Text>
                    <Image source={{ uri: i.url }} style={{ width: '100%', height: 220, borderRadius: 10, backgroundColor: colors.bg }} resizeMode="contain" accessibilityLabel={i.label} />
                  </View>
                ))}
              </Row>
              <Field label="CNIC number as printed (13 digits)" required value={cnic} onChangeText={setCnic} keyboardType="number-pad" placeholder="35202-1234567-1" />
              <Field label="Note (optional, shown to member if rejected)" value={note} onChangeText={setNote} />
              <Row>
                <Button title="Verify" onPress={() => decide(true)} disabled={cnic.replace(/\D/g, '').length !== 13} />
                <Button title="Reject" variant="secondary" onPress={() => decide(false)} />
              </Row>
            </Panel>
          )}
        />
      )}
    </>
  );
}
