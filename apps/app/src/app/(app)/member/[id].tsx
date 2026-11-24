import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Avatar, Icon, Sheet, Tag, VerificationTags } from '../../../components/kit';
import { TopBar } from '../../../components/TopBar';
import { Banner, Button, Card, ChipSelect, Field, H2, P, Row, Screen } from '../../../components/ui';
import { heightText, joinDot, useLabels } from '../../../lib/format';
import { ENUM_LABELS, useI18n } from '../../../lib/i18n';
import { friendlyError } from '../../../lib/profile';
import { useSession } from '../../../lib/session';
import { supabase } from '../../../lib/supabase';
import { colors, radius, space } from '../../../lib/theme';

type Detail = {
  profile_id: string; public_code: string; first_name: string; managed_by: string; is_bureau_client: boolean; age: number;
  marital_status: string; children_count: number; height_cm: number | null; sect: string | null; caste: string | null;
  mother_tongue: string | null; city: string | null; country: string; willing_to_relocate: boolean;
  education_level: string | null; degree_title: string | null; institution: string | null; profession: string | null;
  income_band: string | null; religiosity: string | null; is_hafiz: boolean; smokes: boolean | null; about: string | null;
  family: Record<string, string | number | null>; looking_for: { age_min: number | null; age_max: number | null; education_min: string | null; cities: string[]; sects: string[]; notes: string | null };
  verification_level: string; is_premium: boolean; has_photos: boolean; match_score: number;
  relationship: { interest_id: string | null; interest_status: string | null; interest_sent_by_me: boolean | null; conversation_id: string | null; bureau_suggested: boolean };
};

export default function MemberProfile() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, lang, enumLabel } = useI18n();
  const { lbl } = useLabels();
  const { active } = useSession();
  const [d, setD] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [upgrade, setUpgrade] = useState(false);
  const [interestOpen, setInterestOpen] = useState(false);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [reason, setReason] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!active) return;
    const { data, error: err } = await supabase.rpc('get_profile_detail', { p_viewer: active.id, p_target: id });
    if (err) { setUpgrade(err.message === 'upgrade_required'); setError(friendlyError(err, lang)); return; }
    setD(data as Detail);
  }, [active, id, lang]);
  useEffect(() => { load(); }, [load]);

  async function sendInterest() {
    if (!active) return;
    setBusy(true); setError(null);
    const { error: err } = await supabase.rpc('send_interest', { p_from: active.id, p_to: id, p_message: note.trim() || null });
    setBusy(false);
    if (err) { if (err.message === 'upgrade_required') { router.push('/plans'); return; } setError(friendlyError(err, lang)); return; }
    setInterestOpen(false); load();
  }

  async function report() {
    if (!active || !reason) return;
    const { error: err } = await supabase.rpc('report_profile', { p_from: active.id, p_target: id, p_reason: reason, p_details: null, p_conversation: null });
    if (err) setError(friendlyError(err, lang)); else { setMoreOpen(false); setDone(t('reportSent')); }
  }
  async function block() {
    if (!active) return;
    const { error: err } = await supabase.rpc('block_profile', { p_from: active.id, p_target: id });
    if (err) setError(friendlyError(err, lang)); else router.back();
  }

  if (!d) {
    return (
      <Screen>
        <TopBar back />
        {error ? <Banner kind="error">{error}</Banner> : <ActivityIndicator color={colors.primary} />}
        {upgrade && <Button title={t('seePlans')} onPress={() => router.push('/plans')} />}
      </Screen>
    );
  }

  const rel = d.relationship;
  const fam = d.family;
  const rows: [string, string][] = ([
    [t('educationLevel'), joinDot(enumLabel('education_level', d.education_level), d.degree_title, d.institution)],
    [t('profession'), joinDot(d.profession, d.income_band ? ENUM_LABELS.income_band[d.income_band]?.[lang] : null)],
    [t('maritalStatus'), joinDot(enumLabel('marital_status', d.marital_status), d.children_count ? `${d.children_count} ${t('children')}` : null)],
    [t('religiosity'), joinDot(enumLabel('religiosity', d.religiosity), d.is_hafiz ? t('hafiz') : null)],
    [t('motherTongue'), lbl('mother_tongue', d.mother_tongue)],
    [t('fatherOccupation'), String(fam.father_occupation ?? '')],
    [t('motherOccupation'), String(fam.mother_occupation ?? '')],
    [t('familyType'), joinDot(enumLabel('family_type', fam.family_type as string), enumLabel('house_ownership', fam.house_ownership as string), fam.house_size as string)],
    [`${t('brothers')} / ${t('sisters')}`, `${fam.brothers_count ?? 0} / ${fam.sisters_count ?? 0}`],
    [t('familyStatus'), enumLabel('socioeconomic_class', fam.socioeconomic_class as string)],
  ] as [string, string][]).filter(([, v]) => !!v && v !== '0 / 0');
  const lf = d.looking_for;

  return (
    <Screen>
      <TopBar back />
      {error && <Banner kind="error">{error}</Banner>}
      {done && <Banner kind="success">{done}</Banner>}

      <Card style={{ alignItems: 'center' }}>
        <Avatar name={d.first_name} size={88} locked />
        <Text style={styles.name}>{d.first_name}, {d.age}</Text>
        <P muted style={{ textAlign: 'center' }}>{joinDot(d.public_code, lbl('city', d.city), lbl('sect', d.sect), lbl('caste', d.caste), heightText(d.height_cm))}</P>
        <Row style={{ justifyContent: 'center' }}>
          <Tag label={t('matchPct', { n: d.match_score })} tone="green" />
          {d.is_premium && <Tag label="Premium" tone="gold" icon="diamond-outline" />}
        </Row>
        <VerificationTags level={d.verification_level} managedBy={d.managed_by} bureauClient={d.is_bureau_client} />
        <View style={styles.privacy}>
          <Icon name="lock-closed-outline" size={14} color="#3C4148" />
          <Text style={styles.privacyText}>{t('photoPrivate')}</Text>
        </View>
      </Card>

      {d.about && (
        <Card>
          <H2>{t('aboutFamily')}</H2>
          <P>{d.about}</P>
          {fam.about ? <P muted>{String(fam.about)}</P> : null}
        </Card>
      )}

      <Card>
        {rows.map(([k, v]) => (
          <View key={k} style={styles.kv}>
            <Text style={styles.k}>{k}</Text>
            <Text style={styles.v}>{v}</Text>
          </View>
        ))}
      </Card>

      <Card>
        <H2>{t('lookingFor')}</H2>
        <P>{joinDot(lf.age_min || lf.age_max ? `${lf.age_min ?? 18}–${lf.age_max ?? 80}` : null,
          enumLabel('education_level', lf.education_min) ? `${enumLabel('education_level', lf.education_min)}+` : null,
          lf.cities?.map((c) => lbl('city', c)).join(', '), lf.sects?.map((s) => lbl('sect', s)).join(', '))}</P>
        {lf.notes && <P muted>{lf.notes}</P>}
      </Card>

      <View style={styles.verify}>
        <Icon name="shield-checkmark-outline" size={22} color="#7A5C0E" />
        <View style={{ flex: 1 }}>
          <Text style={styles.verifyTitle}>{t('howVerified')}</Text>
          <Text style={styles.verifyText}>
            {d.verification_level === 'none' ? t('verifiedNone') : t(`verified_${d.verification_level}` as never)} · {t('verifyNote')}
          </Text>
          {d.is_bureau_client && <Text style={styles.verifyText}>{t('bureauClient')}</Text>}
        </View>
      </View>

      {rel.conversation_id ? (
        <Button title={t('tabChats')} onPress={() => router.push(`/chat/${rel.conversation_id}`)} />
      ) : rel.interest_status === 'pending' && !rel.interest_sent_by_me ? (
        <Button title={t('tabInterests')} onPress={() => router.push('/interests')} />
      ) : rel.interest_status === 'pending' ? (
        <Banner kind="success">{t('interestSent')}</Banner>
      ) : (
        <Button title={t('sendInterest')} onPress={() => setInterestOpen(true)} />
      )}
      <Button title={t('moreActions')} variant="ghost" onPress={() => setMoreOpen(true)} />

      <Sheet open={interestOpen} onClose={() => setInterestOpen(false)} title={t('sendInterest')}>
        <Field label={t('interestMessage')} value={note} onChangeText={setNote} placeholder={t('interestMessagePh')} multiline maxLength={300} />
        {error && <Banner kind="error">{error}</Banner>}
        <Button title={t('sendInterest')} onPress={sendInterest} loading={busy} />
      </Sheet>

      <Sheet open={moreOpen} onClose={() => setMoreOpen(false)} title={t('moreActions')}>
        <ChipSelect label={t('reportReason')} value={reason} onChange={setReason}
          options={Object.entries(ENUM_LABELS.report_reason).map(([value, l]) => ({ value, label: l[lang] }))} />
        <Button title={t('report')} onPress={report} disabled={!reason} />
        <Button title={t('block')} variant="danger" onPress={block} />
      </Sheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  name: { fontSize: 22, fontWeight: '800', color: colors.primary, textAlign: 'center' },
  privacy: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#F3F1EC', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6 },
  privacyText: { fontSize: 13, color: '#3C4148' },
  kv: { flexDirection: 'row', gap: space(3), paddingVertical: 4 },
  k: { width: 130, fontSize: 13.5, color: colors.muted },
  v: { flex: 1, fontSize: 14, color: colors.text },
  verify: { flexDirection: 'row', gap: space(3), backgroundColor: '#FBF3DC', borderWidth: 1, borderColor: '#EBD9A6', borderRadius: radius.lg, padding: space(4) },
  verifyTitle: { fontSize: 14, fontWeight: '700', color: '#5E470B' },
  verifyText: { fontSize: 13, lineHeight: 19, color: '#5E470B', marginTop: 2 },
});
