import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { PageTitle } from '../../../components/admin';
import { Banner } from '../../../components/ui';
import { supabase } from '../../../lib/supabase';
import { colors, radius, space } from '../../../lib/theme';

type Stats = Record<string, number | Record<string, number>>;

export default function Dashboard() {
  const [s, setS] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);
  useFocusEffect(useCallback(() => {
    supabase.rpc('admin_dashboard_stats').then(({ data, error: err }) => { if (err) setError(err.message); else setS(data as Stats); });
  }, []));
  const n = (k: string) => Number(s?.[k] ?? 0);
  const subs = (s?.active_subscriptions ?? {}) as Record<string, number>;
  const byGender = (s?.profiles_active_by_gender ?? {}) as Record<string, number>;

  const queues = [
    { label: 'Profiles to approve', value: n('profiles_pending_review'), href: '/admin/approvals' },
    { label: 'CNIC checks', value: n('verifications_pending'), href: '/admin/verifications' },
    { label: 'Payments to verify', value: n('payments_pending'), href: '/admin/payments' },
    { label: 'Photos to review', value: n('photos_pending'), href: '/admin/photos' },
    { label: 'Open reports', value: n('reports_open'), href: '/admin/members' },
  ];
  const facts = [
    { label: 'Active profiles', value: `${n('profiles_active')}  (${byGender.male ?? 0} M · ${byGender.female ?? 0} F)` },
    { label: 'Bureau (offline) clients', value: `${n('offline_clients')}  · ${n('offline_without_consent')} without consent` },
    { label: 'Paid members', value: `Basic ${subs.basic ?? 0} · Premium ${subs.premium ?? 0}` },
    { label: 'Revenue this month', value: `PKR ${n('revenue_this_month_pkr').toLocaleString('en-PK')}` },
    { label: 'New profiles (7 days)', value: String(n('new_profiles_7d')) },
    { label: 'Upcoming meetings', value: String(n('meetings_upcoming')) },
    { label: 'Rishtas confirmed', value: String(n('rishtas_confirmed_total')) },
  ];

  return (
    <>
      <PageTitle title="Dashboard" sub="What needs attention today" />
      {error && <Banner kind="error">{error}</Banner>}
      <View style={styles.grid}>
        {queues.map((q) => (
          <Pressable key={q.label} accessibilityRole="link" onPress={() => router.push(q.href as never)}
            style={[styles.tile, q.value > 0 && styles.tileHot]}>
            <Text style={[styles.tileN, q.value > 0 && { color: '#7A5C0E' }]}>{q.value}</Text>
            <Text style={styles.tileL}>{q.label} →</Text>
          </Pressable>
        ))}
      </View>
      <View style={styles.facts}>
        {facts.map((f) => (
          <View key={f.label} style={styles.fact}>
            <Text style={styles.factL}>{f.label}</Text>
            <Text style={styles.factV}>{f.value}</Text>
          </View>
        ))}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space(3) },
  tile: { flexGrow: 1, flexBasis: 180, backgroundColor: '#fff', borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, padding: space(5), gap: 4 },
  tileHot: { borderColor: '#EBD9A6', backgroundColor: '#FFFBF0' },
  tileN: { fontSize: 34, fontWeight: '800', color: colors.primary },
  tileL: { fontSize: 14, color: colors.muted, fontWeight: '600' },
  facts: { backgroundColor: '#fff', borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, overflow: 'hidden' },
  fact: { flexDirection: 'row', justifyContent: 'space-between', gap: space(3), padding: space(4), borderTopWidth: 1, borderTopColor: '#EFEBE3' },
  factL: { fontSize: 14, color: colors.muted },
  factV: { fontSize: 14.5, fontWeight: '700', color: colors.text, textAlign: 'right' },
});
