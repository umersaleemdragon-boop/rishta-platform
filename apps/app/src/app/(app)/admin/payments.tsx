import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Image, Text, View } from 'react-native';
import { KV, PageTitle, Panel, QueueItem, Split } from '../../../components/admin';
import { EmptyState, Segmented } from '../../../components/kit';
import { Banner, Button, ChipSelect, Field, Row } from '../../../components/ui';
import { supabase } from '../../../lib/supabase';
import { colors } from '../../../lib/theme';

type Pay = {
  id: string; profile_id: string; plan_id: string; amount_pkr: number; method: string; transaction_ref: string | null;
  sender_name: string | null; sender_account: string | null; paid_on: string | null; receipt_path: string | null; status: string;
  created_at: string; rejection_reason: string | null; profiles: { first_name: string; public_code: string } | null;
};
const METHODS = [{ value: 'cash', label: 'Cash at office' }, { value: 'bank_transfer', label: 'Bank transfer' }, { value: 'jazzcash', label: 'JazzCash' }, { value: 'easypaisa', label: 'Easypaisa' }];

export default function Payments() {
  const [tab, setTab] = useState<'pending' | 'done'>('pending');
  const [rows, setRows] = useState<Pay[]>([]);
  const [sel, setSel] = useState<Pay | null>(null);
  const [img, setImg] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [msg, setMsg] = useState<{ kind: 'error' | 'success'; text: string } | null>(null);
  // record payment received outside the app
  const [code, setCode] = useState(''); const [plan, setPlan] = useState<string | null>('basic');
  const [method, setMethod] = useState<string | null>('cash'); const [amount, setAmount] = useState(''); const [ref, setRef] = useState('');

  const load = useCallback(async () => {
    let q = supabase.from('payments').select('*, profiles(first_name, public_code)').order('created_at', { ascending: tab === 'pending' }).limit(100);
    q = tab === 'pending' ? q.eq('status', 'pending') : q.neq('status', 'pending');
    const { data, error } = await q;
    if (error) setMsg({ kind: 'error', text: error.message });
    const list = (data ?? []) as Pay[];
    setRows(list); setSel(list[0] ?? null);
  }, [tab]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  useEffect(() => {
    setImg(null); setReason('');
    if (sel?.receipt_path) {
      supabase.storage.from('payment-receipts').createSignedUrl(sel.receipt_path, 300).then(({ data }) => setImg(data?.signedUrl ?? null));
    }
  }, [sel?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function decide(approve: boolean) {
    if (!sel) return;
    if (!approve && !reason.trim()) { setMsg({ kind: 'error', text: 'Give a reason — the member will see it.' }); return; }
    const { error } = approve
      ? await supabase.rpc('approve_payment', { p_payment: sel.id })
      : await supabase.rpc('reject_payment', { p_payment: sel.id, p_reason: reason.trim() });
    if (error) { setMsg({ kind: 'error', text: error.message }); return; }
    setMsg({ kind: 'success', text: approve ? 'Approved — plan activated and member notified.' : 'Rejected — member notified.' });
    load();
  }

  async function record() {
    setMsg(null);
    const { data: p } = await supabase.from('profiles').select('id,first_name').eq('public_code', code.trim().toUpperCase()).maybeSingle();
    if (!p) { setMsg({ kind: 'error', text: `No profile with code ${code}` }); return; }
    const { error } = await supabase.rpc('admin_record_payment', { p_profile: p.id, p_plan: plan, p_method: method,
      p_amount_pkr: parseInt(amount, 10), p_transaction_ref: ref || null, p_note: 'Recorded in admin panel' });
    if (error) setMsg({ kind: 'error', text: error.message });
    else { setMsg({ kind: 'success', text: `Recorded and activated for ${p.first_name}.` }); setCode(''); setAmount(''); setRef(''); }
  }

  return (
    <>
      <PageTitle title="Payments" sub="Match each receipt with your JazzCash / Easypaisa / bank statement before approving" />
      {msg && <Banner kind={msg.kind}>{msg.text}</Banner>}
      <Segmented value={tab} onChange={setTab} options={[{ value: 'pending', label: 'To verify' }, { value: 'done', label: 'History' }]} />
      {rows.length === 0 ? <EmptyState icon="cash-outline" text={tab === 'pending' ? 'No payments waiting.' : 'No payments yet.'} /> : (
        <Split
          left={rows.map((r) => (
            <QueueItem key={r.id} title={`${r.profiles?.first_name ?? '?'} · ${r.profiles?.public_code ?? ''}`}
              sub={`${r.plan_id} · PKR ${r.amount_pkr.toLocaleString('en-PK')} · ${r.method}`} selected={sel?.id === r.id} onPress={() => setSel(r)}
              right={tab === 'done' ? r.status : new Date(r.created_at).toLocaleDateString()} />
          ))}
          right={sel && (
            <Panel>
              <KV k="Plan / amount" v={`${sel.plan_id} · PKR ${sel.amount_pkr.toLocaleString('en-PK')}`} />
              <KV k="Method" v={sel.method} />
              <KV k="Transaction ID" v={sel.transaction_ref ?? ''} />
              <KV k="Sender" v={[sel.sender_name, sel.sender_account].filter(Boolean).join(' · ')} />
              <KV k="Paid on" v={sel.paid_on ?? ''} />
              <KV k="Status" v={sel.status + (sel.rejection_reason ? ` — ${sel.rejection_reason}` : '')} />
              {img ? <Image source={{ uri: img }} style={{ width: '100%', height: 420, borderRadius: 12, backgroundColor: colors.bg }} resizeMode="contain" accessibilityLabel="Payment receipt" />
                : sel.receipt_path ? <Text style={{ color: colors.muted }}>Loading receipt…</Text> : null}
              {sel.status === 'pending' && (
                <>
                  <Field label="Reason (only when rejecting)" value={reason} onChangeText={setReason} placeholder="e.g. Amount not received in our account" />
                  <Row>
                    <Button title="Approve & activate" onPress={() => decide(true)} />
                    <Button title="Reject" variant="secondary" onPress={() => decide(false)} />
                  </Row>
                </>
              )}
            </Panel>
          )}
        />
      )}

      <Panel>
        <Text style={{ fontSize: 17, fontWeight: '800', color: colors.primary }}>Record a payment received at the office</Text>
        <Row>
          <View style={{ flex: 1, minWidth: 160 }}><Field label="Profile code" required value={code} onChangeText={setCode} placeholder="RB-10011" autoCapitalize="characters" /></View>
          <View style={{ flex: 1, minWidth: 140 }}><Field label="Amount (PKR)" required value={amount} onChangeText={(v) => setAmount(v.replace(/\D/g, ''))} keyboardType="number-pad" /></View>
          <View style={{ flex: 1, minWidth: 160 }}><Field label="Reference" value={ref} onChangeText={setRef} /></View>
        </Row>
        <ChipSelect label="Plan" value={plan} onChange={setPlan} required options={[{ value: 'basic', label: 'Basic' }, { value: 'premium', label: 'Premium' }]} />
        <ChipSelect label="Method" value={method} onChange={setMethod} required options={METHODS} />
        <Button title="Record & activate plan" onPress={record} disabled={!code || !amount} />
      </Panel>
    </>
  );
}
