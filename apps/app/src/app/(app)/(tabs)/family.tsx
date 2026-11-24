import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Avatar, EmptyState, Icon, Tag } from '../../../components/kit';
import { TopBar } from '../../../components/TopBar';
import { Button, Card, H1, H2, P, Row, Screen } from '../../../components/ui';
import { useI18n, type TKey } from '../../../lib/i18n';
import { useSession } from '../../../lib/session';
import { supabase } from '../../../lib/supabase';
import { colors, radius, space } from '../../../lib/theme';

type Conv = { conversation_id: string; other_first_name: string; other_age: number; last_message: string | null; last_message_kind: string | null; stage: string };
type Meeting = { id: string; conversation_id: string; scheduled_for: string; meeting_type: string; status: string };
type Ward = { id: string; name: string; relation: string; status: string; convs: Conv[]; meetings: Meeting[]; pending: number };

export default function Family() {
  const { t, enumLabel } = useI18n();
  const { guarded, profiles } = useSession();
  const [wards, setWards] = useState<Ward[]>([]);

  const load = useCallback(async () => {
    const out: Ward[] = [];
    for (const g of guarded) {
      const [c, m, i] = await Promise.all([
        supabase.rpc('list_conversations', { p_profile: g.profile_id }),
        supabase.from('meetings').select('id,conversation_id,scheduled_for,meeting_type,status')
          .in('status', ['requested', 'scheduled']).order('scheduled_for'),
        supabase.from('interests').select('id', { count: 'exact', head: true }).eq('receiver_profile_id', g.profile_id).eq('status', 'pending'),
      ]);
      const convs = (c.data ?? []) as Conv[];
      const ids = new Set(convs.map((x) => x.conversation_id));
      out.push({ id: g.profile_id, name: g.first_name, relation: g.relation, status: g.status, convs,
        meetings: ((m.data ?? []) as Meeting[]).filter((x) => ids.has(x.conversation_id)), pending: i.count ?? 0 });
    }
    setWards(out);
  }, [guarded]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  return (
    <Screen>
      <TopBar />
      <View>
        <H1>{t('familyTitle')}</H1>
        <P muted>{t('familySub')}</P>
      </View>

      {wards.length === 0 && (
        <EmptyState icon="people-outline" text={t('noGuarded')} action={
          <View style={{ gap: space(2), alignSelf: 'stretch' }}>
            <Button title={t('joinAsGuardian')} onPress={() => router.push('/guardian')} />
            {profiles[0] && <Button title={t('manageGuardians')} variant="secondary" onPress={() => router.push(`/profile/${profiles[0].id}/guardians`)} />}
          </View>} />
      )}

      {wards.map((w) => (
        <View key={w.id} style={{ gap: space(3) }}>
          <Card>
            <Text style={styles.kicker}>{t('lookAfter')}</Text>
            <Row style={{ alignItems: 'center' }}>
              <Avatar name={w.name} size={52} />
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{w.name} · {enumLabel('relation', w.relation)}</Text>
                <Tag label={t(`status_${w.status}` as TKey)} tone={w.status === 'active' ? 'green' : 'gold'} />
              </View>
            </Row>
            <View style={styles.stats}>
              <Stat n={w.pending} label={t('received')} />
              <Stat n={w.convs.length} label={t('tabChats')} />
              <Stat n={w.meetings.length} label={t('meetingTitle')} />
            </View>
          </Card>

          {w.meetings.map((m) => (
            <Pressable key={m.id} onPress={() => router.push(`/chat/${m.conversation_id}`)} style={styles.meeting} accessibilityRole="button">
              <Icon name="calendar" size={24} color="#E9C766" />
              <View style={{ flex: 1 }}>
                <Text style={styles.meetTitle}>{t(`meetingType_${m.meeting_type}` as TKey)}</Text>
                <Text style={styles.meetSub}>{new Date(m.scheduled_for).toLocaleString()} · {t(`meetingStatus_${m.status}` as TKey)}</Text>
              </View>
            </Pressable>
          ))}

          {w.convs.length > 0 && (
            <Card>
              <H2>{t('tabChats')}</H2>
              {w.convs.map((c) => (
                <Pressable key={c.conversation_id} onPress={() => router.push(`/chat/${c.conversation_id}`)} style={styles.conv} accessibilityRole="button">
                  <Avatar name={c.other_first_name} size={40} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.convName}>{c.other_first_name}, {c.other_age}</Text>
                    <Text style={styles.convMsg} numberOfLines={1}>{c.last_message_kind === 'system' ? t(`sys_${c.last_message}` as TKey) : c.last_message}</Text>
                  </View>
                  <Tag label={t('readOnly')} tone="grey" />
                </Pressable>
              ))}
            </Card>
          )}
        </View>
      ))}

      {wards.length > 0 && <Button title={t('joinAsGuardian')} variant="ghost" onPress={() => router.push('/guardian')} />}
    </Screen>
  );
}

function Stat({ n, label }: { n: number; label: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statN}>{n}</Text>
      <Text style={styles.statL}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  kicker: { fontSize: 12, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase', color: colors.muted },
  name: { fontSize: 17, fontWeight: '700', color: colors.text, marginBottom: 4 },
  stats: { flexDirection: 'row', gap: space(2) },
  stat: { flex: 1, backgroundColor: colors.bg, borderRadius: radius.md, padding: space(2.5), alignItems: 'center' },
  statN: { fontSize: 20, fontWeight: '800', color: colors.primary },
  statL: { fontSize: 12, color: colors.muted, marginTop: 2 },
  meeting: { flexDirection: 'row', alignItems: 'center', gap: space(3), backgroundColor: colors.primary, borderRadius: radius.lg, padding: space(4) },
  meetTitle: { color: '#fff', fontSize: 15, fontWeight: '700' },
  meetSub: { color: '#C9D3E0', fontSize: 13, marginTop: 2 },
  conv: { flexDirection: 'row', alignItems: 'center', gap: space(3), paddingVertical: space(2) },
  convName: { fontSize: 15, fontWeight: '700', color: colors.text },
  convMsg: { fontSize: 13, color: colors.muted, marginTop: 2 },
});
