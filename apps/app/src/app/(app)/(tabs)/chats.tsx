import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Avatar, EmptyState, Tag } from '../../../components/kit';
import { TopBar } from '../../../components/TopBar';
import { H1, Screen } from '../../../components/ui';
import { timeAgo, useLabels } from '../../../lib/format';
import { useI18n, type TKey } from '../../../lib/i18n';
import { useSession } from '../../../lib/session';
import { supabase } from '../../../lib/supabase';
import { colors, radius, space } from '../../../lib/theme';

type Conv = {
  conversation_id: string; stage: string; closed_at: string | null; last_message_at: string | null;
  last_message: string | null; last_message_kind: 'text' | 'system' | null; unread_count: number;
  other_profile_id: string; other_first_name: string; other_age: number; other_city: string | null;
};

export default function Chats() {
  const { t, lang } = useI18n();
  const { lbl } = useLabels();
  const { active } = useSession();
  const [rows, setRows] = useState<Conv[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!active) { setLoading(false); return; }
    const { data } = await supabase.rpc('list_conversations', { p_profile: active.id });
    setRows((data ?? []) as Conv[]);
    setLoading(false);
  }, [active]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const preview = (c: Conv) => c.last_message_kind === 'system'
    ? t(`sys_${c.last_message}` as TKey) : c.last_message ?? '';

  return (
    <Screen>
      <TopBar />
      <H1>{t('tabChats')}</H1>
      {loading && <ActivityIndicator color={colors.primary} />}
      {!loading && rows.length === 0 && <EmptyState icon="chatbubbles-outline" text={t('noChats')} />}
      <View style={styles.list}>
        {rows.map((c, i) => (
          <Pressable key={c.conversation_id} accessibilityRole="button" onPress={() => router.push(`/chat/${c.conversation_id}`)}
            style={[styles.row, i > 0 && styles.divider]}>
            <Avatar name={c.other_first_name} size={50} locked />
            <View style={{ flex: 1, minWidth: 0 }}>
              <View style={styles.top}>
                <Text style={styles.name} numberOfLines={1}>{c.other_first_name}, {c.other_age} · {lbl('city', c.other_city)}</Text>
                <Text style={styles.time}>{timeAgo(c.last_message_at, lang)}</Text>
              </View>
              <View style={styles.top}>
                <Text style={[styles.preview, c.unread_count > 0 && styles.unread]} numberOfLines={1}>{preview(c)}</Text>
                {c.unread_count > 0 && <View style={styles.badge}><Text style={styles.badgeText}>{c.unread_count}</Text></View>}
              </View>
              {c.stage === 'rishta_confirmed' || c.stage === 'engaged' || c.stage === 'married'
                ? <Tag label={t('status_matched')} tone="gold" /> : c.closed_at ? <Tag label={t('sys_conversation_closed')} tone="grey" /> : null}
            </View>
          </Pressable>
        ))}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { backgroundColor: '#fff', borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  row: { flexDirection: 'row', gap: space(3), padding: space(4), alignItems: 'center' },
  divider: { borderTopWidth: 1, borderTopColor: '#EFEBE3' },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: space(2) },
  name: { flexShrink: 1, fontSize: 16, fontWeight: '700', color: colors.text },
  time: { fontSize: 12, color: colors.muted },
  preview: { flex: 1, fontSize: 14, color: colors.muted, marginTop: 2 },
  unread: { color: colors.text, fontWeight: '700' },
  badge: { minWidth: 20, height: 20, borderRadius: 10, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5 },
  badgeText: { color: '#fff', fontSize: 12, fontWeight: '700' },
});
