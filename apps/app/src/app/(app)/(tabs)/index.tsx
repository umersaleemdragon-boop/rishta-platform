import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Avatar, EmptyState, Icon, Sheet, Tag, VerificationTags } from '../../../components/kit';
import { TopBar } from '../../../components/TopBar';
import { Banner, Button, Field, H1, MultiChipSelect, P, Row, Screen, YesNo } from '../../../components/ui';
import { heightText, joinDot, useLabels } from '../../../lib/format';
import { useI18n } from '../../../lib/i18n';
import { useLookups } from '../../../lib/lookups';
import { friendlyError, toInt } from '../../../lib/profile';
import { canBrowse, useSession } from '../../../lib/session';
import { supabase } from '../../../lib/supabase';
import { colors, radius, space } from '../../../lib/theme';

type Card = {
  profile_id: string; public_code: string; first_name: string | null; age: number; height_cm: number | null; city: string | null;
  education_level: string | null; degree_title: string | null; profession: string | null; sect: string | null; caste: string | null;
  verification_level: string; match_score: number; is_premium: boolean; interest_status: string | null; is_limited_preview: boolean;
};
type Filters = { age_min?: number | null; age_max?: number | null; cities: string[]; sects: string[]; verified_only: boolean };
type Suggestion = { id: string; note: string | null; suggested_profile_id: string; name?: string };

const PAGE = 20;

export default function Matches() {
  const { t, lang, enumLabel } = useI18n();
  const { lbl } = useLabels();
  const { options } = useLookups();
  const { active, loading: sessionLoading, entitlements } = useSession();
  const [items, setItems] = useState<Card[]>([]);
  const [loading, setLoading] = useState(true);
  const [more, setMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<Filters>({ cities: [], sects: [], verified_only: false });
  const [draft, setDraft] = useState({ ...filters, ageMin: '', ageMax: '' });
  const [filterOpen, setFilterOpen] = useState(false);
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null);
  const [sending, setSending] = useState<string | null>(null);

  const load = useCallback(async (offset = 0) => {
    if (!active || !canBrowse(active)) { setLoading(false); return; }
    setLoading(offset === 0); setError(null);
    const { data, error: err } = await supabase.rpc('search_profiles', {
      p_viewer: active.id, p_filters: filters, p_limit: PAGE, p_offset: offset,
    });
    if (err) setError(friendlyError(err, lang));
    const rows = (data ?? []) as Card[];
    setItems((prev) => (offset === 0 ? rows : [...prev, ...rows]));
    setMore(rows.length === PAGE && !rows[0]?.is_limited_preview);
    setLoading(false);
  }, [active, filters, lang]);

  useFocusEffect(useCallback(() => { load(0); }, [load]));

  // newest bureau suggestion, with the suggested person's first name
  useEffect(() => {
    if (!active) return;
    supabase.from('bureau_suggestions').select('id,note,suggested_profile_id')
      .eq('profile_id', active.id).in('status', ['sent', 'viewed']).order('created_at', { ascending: false }).limit(1)
      .then(async ({ data }) => {
        const s = data?.[0] as Suggestion | undefined;
        if (!s) { setSuggestion(null); return; }
        const { data: d } = await supabase.rpc('get_profile_detail', { p_viewer: active.id, p_target: s.suggested_profile_id });
        setSuggestion({ ...s, name: d ? `${d.first_name}, ${d.age}` : undefined });
      });
  }, [active]);

  async function sendInterest(c: Card) {
    if (!active) return;
    setSending(c.profile_id); setError(null);
    const { error: err } = await supabase.rpc('send_interest', { p_from: active.id, p_to: c.profile_id, p_message: null });
    setSending(null);
    if (err) {
      if (err.message === 'upgrade_required') { router.push('/plans'); return; }
      setError(friendlyError(err, lang)); return;
    }
    setItems((prev) => prev.map((x) => (x.profile_id === c.profile_id ? { ...x, interest_status: 'pending' } : x)));
  }

  function applyFilters() {
    setFilters({ cities: draft.cities, sects: draft.sects, verified_only: draft.verified_only,
      age_min: toInt(draft.ageMin), age_max: toInt(draft.ageMax) });
    setFilterOpen(false);
  }
  const filterCount = filters.cities.length + filters.sects.length + (filters.verified_only ? 1 : 0) + (filters.age_min || filters.age_max ? 1 : 0);
  const limited = items[0]?.is_limited_preview ?? entitlements?.tier === 'free';

  if (sessionLoading) return <Screen><ActivityIndicator color={colors.primary} /></Screen>;

  if (!active || !canBrowse(active)) {
    return (
      <Screen>
        <TopBar />
        <H1>{t('yourMatches')}</H1>
        <EmptyState icon="person-add-outline" text={t('needProfile')} action={
          <Button title={active ? t('continueProfile') : t('createProfile')}
            onPress={() => router.push(active ? `/profile/${active.id}/edit` : '/profile/new')} />} />
      </Screen>
    );
  }

  return (
    <Screen>
      <TopBar />
      <View>
        <H1>{t('yourMatches')}</H1>
        <P muted>{t('matchesSub')}</P>
      </View>
      {active.status === 'pending_review' && <Banner>{t('profilePending')}</Banner>}

      <Row style={{ alignItems: 'center' }}>
        <Pressable accessibilityRole="button" onPress={() => { setDraft({ ...filters, ageMin: String(filters.age_min ?? ''), ageMax: String(filters.age_max ?? '') }); setFilterOpen(true); }}
          style={[styles.chip, styles.chipDark]}>
          <Icon name="options-outline" size={16} color="#fff" />
          <Text style={styles.chipDarkText}>{t('filters')}{filterCount ? ` · ${filterCount}` : ''}</Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityState={{ selected: filters.verified_only }}
          onPress={() => setFilters((f) => ({ ...f, verified_only: !f.verified_only }))}
          style={[styles.chip, filters.verified_only && styles.chipOn]}>
          <Icon name="shield-checkmark-outline" size={16} color={filters.verified_only ? '#fff' : colors.primary} />
          <Text style={[styles.chipText, filters.verified_only && { color: '#fff' }]}>{t('verifiedOnly')}</Text>
        </Pressable>
      </Row>

      {suggestion && (
        <Pressable accessibilityRole="button" onPress={() => router.push(`/member/${suggestion.suggested_profile_id}`)} style={styles.suggest}>
          <Row style={{ alignItems: 'center', gap: space(2) }}>
            <Icon name="star" size={14} color="#E9C766" />
            <Text style={styles.suggestKicker}>{t('bureauSuggestion')}</Text>
          </Row>
          {suggestion.name && <Text style={styles.suggestName}>{suggestion.name}</Text>}
          {suggestion.note && <Text style={styles.suggestNote}>“{suggestion.note}”</Text>}
          <Text style={styles.suggestFrom}>— {t('fromMatchmaker')} · {t('viewProfile2')} →</Text>
        </Pressable>
      )}

      {limited && items.length > 0 && (
        <View style={styles.upsell}>
          <Text style={styles.upsellText}>{t('previewLocked')}</Text>
          <Button title={t('seePlans')} onPress={() => router.push('/plans')} />
        </View>
      )}
      {error && <Banner kind="error">{error}</Banner>}
      {loading && <ActivityIndicator color={colors.primary} style={{ marginTop: space(6) }} />}
      {!loading && items.length === 0 && !error && <EmptyState icon="search-outline" text={t('noMatches')} />}

      {items.map((c) => {
        const title = c.first_name ? `${c.first_name}, ${c.age}` : `${c.public_code} · ${c.age}`;
        const work = joinDot(c.degree_title || enumLabel('education_level', c.education_level), c.profession);
        return (
          <View key={c.profile_id} style={styles.card}>
            <Row style={{ alignItems: 'flex-start', flexWrap: 'nowrap' }}>
              <Avatar name={c.first_name ?? c.public_code.slice(-1)} size={60} locked />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Row style={{ justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'nowrap' }}>
                  <Text style={styles.name} numberOfLines={1}>{title}</Text>
                  <Tag label={t('matchPct', { n: c.match_score })} tone="green" />
                </Row>
                {!!work && <Text style={styles.line}>{work}</Text>}
                <Text style={styles.sub}>{joinDot(lbl('city', c.city), lbl('sect', c.sect), lbl('caste', c.caste), heightText(c.height_cm))}</Text>
              </View>
            </Row>
            <VerificationTags level={c.verification_level} />
            {c.is_premium && <Tag label="Premium" tone="gold" icon="diamond-outline" />}
            <Row>
              <View style={{ flex: 1 }}>
                <Button title={t('viewProfile2')} variant="secondary"
                  onPress={() => (c.is_limited_preview ? router.push('/plans') : router.push(`/member/${c.profile_id}`))} />
              </View>
              <View style={{ flex: 1 }}>
                {c.interest_status
                  ? <View style={styles.sentBox}><Text style={styles.sentText}>{t(`status_i_${c.interest_status}` as never)}</Text></View>
                  : <Button title={t('sendInterest')} loading={sending === c.profile_id}
                      onPress={() => (c.is_limited_preview ? router.push('/plans') : sendInterest(c))} />}
              </View>
            </Row>
          </View>
        );
      })}
      {more && <Button title="…" variant="ghost" onPress={() => load(items.length)} />}

      <Sheet open={filterOpen} onClose={() => setFilterOpen(false)} title={t('filters')}>
        <Row>
          <View style={{ flex: 1 }}><Field label={t('ageFrom')} keyboardType="number-pad" maxLength={2} value={draft.ageMin}
            onChangeText={(v) => setDraft({ ...draft, ageMin: v.replace(/\D/g, '') })} /></View>
          <View style={{ flex: 1 }}><Field label={t('ageTo')} keyboardType="number-pad" maxLength={2} value={draft.ageMax}
            onChangeText={(v) => setDraft({ ...draft, ageMax: v.replace(/\D/g, '') })} /></View>
        </Row>
        <MultiChipSelect label={t('city')} options={options('city', lang)} values={draft.cities} onChange={(v) => setDraft({ ...draft, cities: v })} />
        <MultiChipSelect label={t('sect')} options={options('sect', lang)} values={draft.sects} onChange={(v) => setDraft({ ...draft, sects: v })} />
        <YesNo label={t('verifiedOnly')} value={draft.verified_only} onChange={(v) => setDraft({ ...draft, verified_only: v })} />
        <Row>
          <View style={{ flex: 1 }}><Button title={t('clearFilters')} variant="secondary"
            onPress={() => setDraft({ cities: [], sects: [], verified_only: false, ageMin: '', ageMax: '' })} /></View>
          <View style={{ flex: 1 }}><Button title={t('applyFilters')} onPress={applyFilters} /></View>
        </Row>
      </Sheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 40, paddingHorizontal: space(3.5), borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: '#fff' },
  chipText: { fontSize: 14, fontWeight: '600', color: colors.primary },
  chipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipDark: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipDarkText: { fontSize: 14, fontWeight: '700', color: '#fff' },
  suggest: { backgroundColor: colors.primary, borderRadius: radius.lg, padding: space(4), gap: 6 },
  suggestKicker: { color: '#E9C766', fontSize: 12, fontWeight: '800', letterSpacing: 0.8, textTransform: 'uppercase' },
  suggestName: { color: '#fff', fontSize: 18, fontWeight: '800' },
  suggestNote: { color: '#fff', fontSize: 15, lineHeight: 22, fontWeight: '600' },
  suggestFrom: { color: '#C9D3E0', fontSize: 13 },
  upsell: { backgroundColor: '#FBF3DC', borderColor: '#EBD9A6', borderWidth: 1, borderRadius: radius.lg, padding: space(4), gap: space(3) },
  upsellText: { color: '#5E470B', fontSize: 14, lineHeight: 20 },
  card: { backgroundColor: '#fff', borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, padding: space(4), gap: space(3) },
  name: { flexShrink: 1, fontSize: 18, fontWeight: '700', color: colors.text },
  line: { fontSize: 14, color: '#3C4148', marginTop: 3 },
  sub: { fontSize: 13, color: colors.muted, marginTop: 2 },
  sentBox: { minHeight: 48, borderRadius: radius.md, backgroundColor: colors.successBg, alignItems: 'center', justifyContent: 'center' },
  sentText: { color: colors.success, fontWeight: '700', fontSize: 15 },
});
