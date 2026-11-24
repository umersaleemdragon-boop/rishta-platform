import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ageFromDob, PageTitle } from '../../../components/admin';
import { EmptyState, Tag } from '../../../components/kit';
import { ChipSelect, Field, Row } from '../../../components/ui';
import { supabase } from '../../../lib/supabase';
import { colors, radius, space } from '../../../lib/theme';

type M = { id: string; public_code: string; first_name: string; gender: string; date_of_birth: string; city: string | null; status: string;
  source: string; verification_level: string; listing_consent: boolean; managed_by: string };

export default function Members() {
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [gender, setGender] = useState<string | null>(null);
  const [source, setSource] = useState<string | null>(null);
  const [rows, setRows] = useState<M[]>([]);

  const load = useCallback(async () => {
    let query = supabase.from('profiles')
      .select('id,public_code,first_name,gender,date_of_birth,city,status,source,verification_level,listing_consent,managed_by')
      .neq('status', 'deleted').order('created_at', { ascending: false }).limit(200);
    const term = q.trim().replace(/[,%()]/g, '');
    if (term) query = query.or(`first_name.ilike.%${term}%,public_code.ilike.%${term}%,city.ilike.%${term}%`);
    if (status) query = query.eq('status', status);
    if (gender) query = query.eq('gender', gender);
    if (source) query = query.eq('source', source);
    const { data } = await query;
    setRows((data ?? []) as M[]);
  }, [q, status, gender, source]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  return (
    <>
      <PageTitle title="All members" sub="Search by name, profile code or city" />
      <Field label="Search" value={q} onChangeText={setQ} placeholder="e.g. Ayesha, RB-10234, lahore" onSubmitEditing={load} />
      <Row>
        <ChipSelect label="Status" value={status} onChange={setStatus} options={['pending_review', 'active', 'paused', 'matched', 'suspended', 'draft'].map((v) => ({ value: v, label: v.replace('_', ' ') }))} />
        <ChipSelect label="Gender" value={gender} onChange={setGender} options={[{ value: 'female', label: 'Female' }, { value: 'male', label: 'Male' }]} />
        <ChipSelect label="Source" value={source} onChange={setSource} options={[{ value: 'self_registered', label: 'App' }, { value: 'bureau_offline', label: 'Bureau / WhatsApp' }]} />
      </Row>
      <Text style={{ color: colors.muted }}>{rows.length} shown</Text>
      {rows.length === 0 ? <EmptyState icon="people-outline" text="No members match." /> : (
        <View style={styles.table}>
          {rows.map((m, i) => (
            <Pressable key={m.id} accessibilityRole="link" onPress={() => router.push(`/admin/member/${m.id}`)} style={[styles.row, i > 0 && styles.div]}>
              <Text style={[styles.cell, { flexBasis: 90, fontWeight: '700' }]}>{m.public_code}</Text>
              <Text style={[styles.cell, { flexBasis: 160, flexGrow: 2 }]}>{m.first_name}, {ageFromDob(m.date_of_birth)} · {m.gender === 'female' ? 'F' : 'M'}</Text>
              <Text style={[styles.cell, { flexBasis: 110 }]}>{m.city ?? '—'}</Text>
              <View style={[styles.cellBox, { flexBasis: 220 }]}>
                <Tag label={m.status.replace('_', ' ')} tone={m.status === 'active' ? 'green' : m.status === 'pending_review' ? 'gold' : m.status === 'suspended' ? 'red' : 'grey'} />
                {m.source === 'bureau_offline' && <Tag label={m.listing_consent ? 'bureau · listed' : 'bureau · not listed'} tone="navy" />}
                {m.verification_level !== 'none' && <Tag label={m.verification_level} tone="gold" />}
              </View>
            </Pressable>
          ))}
        </View>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  table: { backgroundColor: '#fff', borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, overflow: 'hidden' },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space(3), paddingHorizontal: space(4), paddingVertical: space(3) },
  div: { borderTopWidth: 1, borderTopColor: '#EFEBE3' },
  cell: { flexGrow: 1, fontSize: 14, color: colors.text },
  cellBox: { flexGrow: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
});
