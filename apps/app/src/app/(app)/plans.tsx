import { CryptoDigestAlgorithm, digest, randomUUID } from 'expo-crypto';
import * as ImagePicker from 'expo-image-picker';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Icon, Tag } from '../../components/kit';
import { TopBar } from '../../components/TopBar';
import { Banner, Button, Card, ChipSelect, Field, H1, H2, P, Row, Screen } from '../../components/ui';
import { useI18n, type TKey } from '../../lib/i18n';
import { friendlyError } from '../../lib/profile';
import { useSession } from '../../lib/session';
import { supabase } from '../../lib/supabase';
import { colors, radius, space } from '../../lib/theme';

type Plan = { id: 'free' | 'basic' | 'premium'; name_en: string; name_ur: string | null; price_pkr: number; duration_days: number; daily_interest_limit: number; features: string[] };
type Account = { id: string; method: 'jazzcash' | 'easypaisa' | 'bank_transfer'; account_title: string; account_number: string; bank_name: string | null; iban: string | null; instructions: string | null };
type Payment = { id: string; plan_id: string; amount_pkr: number; method: string; status: string; created_at: string; rejection_reason: string | null };
type Receipt = { uri: string; type: string; ext: string };

const METHOD_LABEL: Record<string, string> = { jazzcash: 'JazzCash', easypaisa: 'Easypaisa', bank_transfer: 'Bank transfer' };
const pkr = (n: number) => `PKR ${n.toLocaleString('en-PK')}`;

export default function Plans() {
  const { t, lang } = useI18n();
  const { active, entitlements, refresh } = useSession();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [method, setMethod] = useState<string | null>(null);
  const [tid, setTid] = useState('');
  const [senderName, setSenderName] = useState('');
  const [senderAcc, setSenderAcc] = useState('');
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const load = useCallback(async () => {
    const [p, a, pay] = await Promise.all([
      supabase.from('plans').select('*').eq('is_active', true).order('rank'),
      supabase.from('payment_accounts').select('*').eq('is_active', true).order('sort_order'),
      active ? supabase.from('payments').select('id,plan_id,amount_pkr,method,status,created_at,rejection_reason')
        .eq('profile_id', active.id).order('created_at', { ascending: false }).limit(10) : Promise.resolve({ data: [] }),
    ]);
    setPlans((p.data ?? []) as Plan[]); setAccounts((a.data ?? []) as Account[]); setPayments((pay.data ?? []) as Payment[]);
  }, [active]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function pickReceipt() {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
    if (res.canceled || !res.assets?.[0]) return;
    const a = res.assets[0];
    const type = a.mimeType ?? 'image/jpeg';
    setReceipt({ uri: a.uri, type, ext: type.split('/')[1]?.replace('jpeg', 'jpg') ?? 'jpg' });
  }

  async function submit() {
    if (!active || !plan || !method) return;
    if (!tid.trim()) { setError(t('txId')); return; }
    if (!receipt) { setError(t('uploadReceipt')); return; }
    setBusy(true); setError(null);
    try {
      const bytes = await (await fetch(receipt.uri)).arrayBuffer();
      const hash = Array.from(new Uint8Array(await digest(CryptoDigestAlgorithm.SHA256, bytes)))
        .map((b) => b.toString(16).padStart(2, '0')).join('');
      const path = `${active.id}/${randomUUID()}.${receipt.ext}`;
      const up = await supabase.storage.from('payment-receipts').upload(path, bytes, { contentType: receipt.type });
      if (up.error) throw up.error;
      const { error: err } = await supabase.rpc('submit_payment', {
        p_profile: active.id, p_plan: plan.id, p_method: method, p_transaction_ref: tid.trim(), p_receipt_path: path,
        p_receipt_sha256: hash, p_sender_name: senderName.trim() || null, p_sender_account: senderAcc.trim() || null,
      });
      if (err) throw err;
      setDone(true); setPlan(null); setTid(''); setReceipt(null); load(); refresh();
    } catch (e) {
      setError(friendlyError(e as { message?: string }, lang));
    } finally { setBusy(false); }
  }

  const current = entitlements?.tier ?? 'free';
  const paidPlans = plans.filter((p) => p.id !== 'free');
  const methodAccounts = accounts.filter((a) => a.method === method);
  const methods = Array.from(new Set(accounts.map((a) => a.method)));

  return (
    <Screen>
      <TopBar back />
      <View>
        <H1>{t('plansTitle')}</H1>
        <P muted>{t('plansSub')}</P>
      </View>
      {done && <Banner kind="success">{t('paymentSubmitted')}</Banner>}

      {plans.map((p) => {
        const isCurrent = p.id === current;
        const selected = plan?.id === p.id;
        const name = lang === 'ur' ? p.name_ur ?? p.name_en : p.name_en;
        return (
          <Pressable key={p.id} accessibilityRole="radio" accessibilityState={{ selected }} disabled={p.id === 'free'}
            onPress={() => { setPlan(p); setDone(false); }}
            style={[styles.plan, p.id === 'premium' && styles.premium, selected && styles.selected]}>
            {p.id === 'premium' && <Text style={styles.ribbon}>{t('mostFamilies')}</Text>}
            <Row style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
              <Text style={styles.planName}>{name}</Text>
              {p.price_pkr > 0
                ? <Text><Text style={styles.price}>{pkr(p.price_pkr)}</Text><Text style={styles.per}> / {Math.round(p.duration_days / 30)} {lang === 'ur' ? 'ماہ' : 'months'}</Text></Text>
                : isCurrent ? <Tag label={t('currentPlan')} tone="grey" /> : null}
            </Row>
            {(p.features ?? []).map((f) => (
              <View key={f} style={styles.feat}><Icon name="checkmark" size={16} color={colors.success} /><Text style={styles.featText}>{f}</Text></View>
            ))}
            {isCurrent && p.id !== 'free' && <Tag label={t('currentPlan')} tone="green" />}
          </Pressable>
        );
      })}

      {plan && plan.id !== 'free' && (
        <Card>
          <H2>{t('payWith')}</H2>
          <ChipSelect label={t('payWith')} value={method} onChange={setMethod} required
            options={methods.map((m) => ({ value: m, label: METHOD_LABEL[m] }))} />
          {methodAccounts.map((a) => (
            <View key={a.id} style={styles.account}>
              <Text style={styles.step}>{t('payStep1', { amount: pkr(plan.price_pkr) })}</Text>
              <Text style={styles.accTitle}>{a.account_title}</Text>
              <Text selectable style={styles.accNum}>{a.account_number}</Text>
              {a.bank_name && <Text style={styles.accSub}>{a.bank_name}{a.iban ? ` · ${a.iban}` : ''}</Text>}
              {a.instructions && <Text style={styles.accSub}>{a.instructions}</Text>}
            </View>
          ))}
          {method && (
            <>
              <Text style={styles.step}>{t('payStep2')}</Text>
              <Field label={t('txId')} required value={tid} onChangeText={setTid} autoCapitalize="characters" maxLength={64} />
              <Field label={t('senderName')} value={senderName} onChangeText={setSenderName} maxLength={120} />
              <Field label={t('senderAccount')} value={senderAcc} onChangeText={setSenderAcc} keyboardType="phone-pad" maxLength={40} />
              <Button title={receipt ? t('receiptAdded') : t('uploadReceipt')} variant="secondary" onPress={pickReceipt} />
              <P muted>{t('refundPolicy')}</P>
              {error && <Banner kind="error">{error}</Banner>}
              <Button title={t('submitPayment')} onPress={submit} loading={busy} />
            </>
          )}
        </Card>
      )}
      {paidPlans.length > 0 && !plan && <P muted>{t('refundPolicy')}</P>}

      {payments.length > 0 && (
        <Card>
          <H2>{t('paymentsHistory')}</H2>
          {payments.map((p) => (
            <View key={p.id} style={styles.payRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.payTitle}>{p.plan_id === 'premium' ? 'Premium' : 'Basic'} · {pkr(p.amount_pkr)}</Text>
                <Text style={styles.accSub}>{METHOD_LABEL[p.method] ?? p.method} · {new Date(p.created_at).toLocaleDateString()}</Text>
                {p.rejection_reason && <Text style={[styles.accSub, { color: colors.danger }]}>{p.rejection_reason}</Text>}
              </View>
              <Tag label={t(`pay_${p.status}` as TKey)} tone={p.status === 'approved' ? 'green' : p.status === 'pending' ? 'gold' : 'red'} />
            </View>
          ))}
        </Card>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  plan: { backgroundColor: '#fff', borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, padding: space(4), gap: space(2) },
  premium: { borderWidth: 2, borderColor: colors.accent, marginTop: space(2) },
  selected: { borderWidth: 2.5, borderColor: colors.primary },
  ribbon: { position: 'absolute', top: -11, left: 16, backgroundColor: colors.accent, color: '#fff', fontSize: 11, fontWeight: '800', letterSpacing: 0.6, textTransform: 'uppercase', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, overflow: 'hidden' },
  planName: { fontSize: 18, fontWeight: '800', color: colors.text },
  price: { fontSize: 21, fontWeight: '800', color: colors.primary },
  per: { fontSize: 13, color: colors.muted },
  feat: { flexDirection: 'row', gap: space(2), alignItems: 'center' },
  featText: { flex: 1, fontSize: 14, color: '#3C4148' },
  account: { backgroundColor: colors.bg, borderRadius: radius.md, padding: space(3), gap: 4 },
  step: { fontSize: 14, fontWeight: '700', color: colors.text },
  accTitle: { fontSize: 14, color: '#3C4148' },
  accNum: { fontSize: 22, fontWeight: '800', color: colors.primary, letterSpacing: 1 },
  accSub: { fontSize: 13, color: colors.muted },
  payRow: { flexDirection: 'row', alignItems: 'center', gap: space(3), paddingVertical: space(2), borderTopWidth: 1, borderTopColor: '#EFEBE3' },
  payTitle: { fontSize: 15, fontWeight: '700', color: colors.text },
});
