import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../lib/auth';
import { ENUM_LABELS, useI18n, type TKey } from '../lib/i18n';
import { useLookups } from '../lib/lookups';
import { normalizeAnyMobile } from '../lib/phone';
import {
  buildDob, cmToFtIn, EDITABLE_PROFILE_FIELDS, friendlyError, ftInToCm, loadProfileBundle, normalizeLookup, pick, toInt,
  type Preferences, type PrivateDetails, type Profile,
} from '../lib/profile';
import { supabase } from '../lib/supabase';
import { colors, radius, space } from '../lib/theme';
import { TopBar } from './TopBar';
import { Banner, Button, Card, ChipSelect, Field, H1, Loading, LookupSelect, MultiChipSelect, P, Row, Screen, YesNo } from './ui';

const STEPS = ['basics', 'community', 'education', 'location', 'family', 'preferences', 'review'] as const;
type Step = (typeof STEPS)[number];

const s = (v: number | null | undefined) => (v == null ? '' : String(v));

export function ProfileWizard({ profileId, initialStep = 0 }: { profileId?: string; initialStep?: number }) {
  const { t, lang, enumLabel } = useI18n();
  const { session } = useAuth();
  const { options: lookupOptions } = useLookups();

  const [id, setId] = useState<string | undefined>(profileId);
  const [loading, setLoading] = useState(!!profileId);
  const [stepIdx, setStepIdx] = useState(Math.min(Math.max(initialStep, 0), STEPS.length - 1));
  const [p, setP] = useState<Partial<Profile>>({ managed_by: 'self', marital_status: 'never_married', country: 'pakistan', contact_policy: 'anyone' });
  const [priv, setPriv] = useState<Partial<PrivateDetails>>({});
  const [prefs, setPrefs] = useState<Partial<Preferences>>({ marital_statuses: [], sects: [], castes: [], cities: [], mother_tongues: [] });
  const [dob, setDob] = useState({ d: '', m: '', y: '' });
  const [height, setHeight] = useState({ ft: '', inch: '' });
  const [prefH, setPrefH] = useState({ minFt: '', minIn: '', maxFt: '', maxIn: '' });
  const [num, setNum] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (!profileId) return;
    loadProfileBundle(profileId).then(({ profile, priv: pv, prefs: pf }) => {
      setP(profile); setPriv(pv); setPrefs(pf);
      const [y, m, d] = profile.date_of_birth.split('-');
      setDob({ d: String(+d), m: String(+m), y });
      setHeight(cmToFtIn(profile.height_cm));
      const lo = cmToFtIn(pf?.height_min_cm), hi = cmToFtIn(pf?.height_max_cm);
      setPrefH({ minFt: lo.ft, minIn: lo.inch, maxFt: hi.ft, maxIn: hi.inch });
      setNum({
        children_count: s(profile.children_count), monthly_income_pkr: s(profile.monthly_income_pkr),
        brothers_count: s(profile.brothers_count), sisters_count: s(profile.sisters_count), married_siblings: s(profile.married_siblings),
        age_min: s(pf?.age_min), age_max: s(pf?.age_max), height_min_cm: s(pf?.height_min_cm), height_max_cm: s(pf?.height_max_cm),
      });
      setLoading(false);
    }).catch((e) => { setError(friendlyError(e, lang)); setLoading(false); });
  }, [profileId, lang]);

  const step: Step = STEPS[stepIdx];
  const set = <K extends keyof Profile>(k: K) => (v: Profile[K] | null) => setP((prev) => ({ ...prev, [k]: v }));
  const setPref = <K extends keyof Preferences>(k: K) => (v: Preferences[K] | null) => setPrefs((prev) => ({ ...prev, [k]: v }));
  const enumOptions = (group: string) => Object.entries(ENUM_LABELS[group]).map(([value, l]) => ({ value, label: l[lang] }));
  const managedByOptions = useMemo(() => enumOptions('managed_by').filter((o) => o.value !== 'bureau'), [lang]); // eslint-disable-line react-hooks/exhaustive-deps
  const numField = (key: string, label: TKey, extra?: { help?: string; max?: number }) => (
    <Field label={t(label)} value={num[key] ?? ''} keyboardType="number-pad" help={extra?.help}
      onChangeText={(v) => setNum((n) => ({ ...n, [key]: v.replace(/\D/g, '').slice(0, extra?.max ?? 3) }))} />
  );

  async function updateProfile(fields: Partial<Profile>) {
    const { error: err } = await supabase.from('profiles').update(pick(fields, EDITABLE_PROFILE_FIELDS)).eq('id', id!);
    if (err) throw err;
  }

  async function saveStep(): Promise<boolean> {
    setError(null);
    const fail = (key: TKey) => { setError(t(key)); return false; };
    try {
      switch (step) {
        case 'basics': {
          const date = buildDob(dob.d, dob.m, dob.y);
          const cm = ftInToCm(height.ft, height.inch);
          if (!p.managed_by || !p.first_name?.trim() || !p.gender || !p.marital_status || !cm) return fail('fillRequired');
          if (!date) return fail('invalidDate');
          const fields: Partial<Profile> = {
            managed_by: p.managed_by, first_name: p.first_name.trim(), date_of_birth: date, marital_status: p.marital_status,
            children_count: p.marital_status === 'never_married' ? 0 : toInt(num.children_count ?? '') ?? 0, height_cm: cm,
          };
          if (!id) {
            const { data, error: err } = await supabase.from('profiles')
              .insert({ ...fields, gender: p.gender, owner_user_id: session!.user.id }).select('id').single();
            if (err) throw err;
            setId(data.id);
            router.replace(`/profile/${data.id}/edit?step=1`);
          } else {
            await updateProfile(fields);
          }
          return true;
        }
        case 'community': {
          const sect = normalizeLookup(p.sect, lookupOptions('sect', 'en'));
          const caste = normalizeLookup(p.caste, lookupOptions('caste', 'en'));
          const tongue = normalizeLookup(p.mother_tongue, lookupOptions('mother_tongue', 'en'));
          if (!p.sect) return fail('fillRequired');
          if (sect === 'other') return fail('typeOtherRequired');
          await updateProfile({ sect, caste, mother_tongue: tongue,
            religiosity: p.religiosity ?? null, is_hafiz: !!p.is_hafiz });
          setP((x) => ({ ...x, sect, caste, mother_tongue: tongue }));
          return true;
        }
        case 'education':
          if (!p.education_level) return fail('fillRequired');
          await updateProfile({ education_level: p.education_level, degree_title: p.degree_title?.trim() || null,
            institution: p.institution?.trim() || null, profession: p.profession?.trim() || null,
            monthly_income_pkr: toInt(num.monthly_income_pkr ?? '') });
          return true;
        case 'location': {
          const city = normalizeLookup(p.city, lookupOptions('city', 'en'));
          const country = normalizeLookup(p.country, lookupOptions('country', 'en')) ?? 'pakistan';
          if (!city) return fail('fillRequired');
          if (city === 'other' || country === 'other') return fail('typeOtherRequired');
          await updateProfile({ city, country, willing_to_relocate: !!p.willing_to_relocate,
            smokes: p.smokes ?? null, about: p.about?.trim() || null });
          setP((x) => ({ ...x, city, country }));
          return true;
        }
        case 'family':
          await updateProfile({
            father_occupation: p.father_occupation?.trim() || null, mother_occupation: p.mother_occupation?.trim() || null,
            brothers_count: toInt(num.brothers_count ?? '') ?? 0, sisters_count: toInt(num.sisters_count ?? '') ?? 0,
            married_siblings: toInt(num.married_siblings ?? '') ?? 0, family_type: p.family_type ?? null,
            house_ownership: p.house_ownership ?? null, house_size: p.house_size?.trim() || null,
            socioeconomic_class: p.socioeconomic_class ?? null, family_about: p.family_about?.trim() || null,
          });
          return true;
        case 'preferences': {
          const ageMin = toInt(num.age_min ?? ''), ageMax = toInt(num.age_max ?? '');
          const badAge = (a: number | null) => a !== null && (a < 18 || a > 80);
          if (badAge(ageMin) || badAge(ageMax) || (ageMin && ageMax && ageMin > ageMax)) return fail('ageRangeInvalid');
          const hMin = prefH.minFt ? ftInToCm(prefH.minFt, prefH.minIn) : null;
          const hMax = prefH.maxFt ? ftInToCm(prefH.maxFt, prefH.maxIn) : null;
          if ((prefH.minFt && !hMin) || (prefH.maxFt && !hMax) || (hMin && hMax && hMin > hMax)) return fail('heightRangeInvalid');
          const { error: err } = await supabase.from('partner_preferences').update({
            age_min: ageMin, age_max: ageMax, height_min_cm: hMin, height_max_cm: hMax,
            marital_statuses: prefs.marital_statuses ?? [], education_min: prefs.education_min ?? null,
            socioeconomic_min: prefs.socioeconomic_min ?? null,
            sects: prefs.sects ?? [], sect_is_must: !!prefs.sect_is_must, castes: prefs.castes ?? [], caste_is_must: !!prefs.caste_is_must,
            cities: prefs.cities ?? [], city_is_must: !!prefs.city_is_must, mother_tongues: prefs.mother_tongues ?? [],
            notes: prefs.notes?.trim() || null,
          }).eq('profile_id', id!);
          if (err) throw err;
          return true;
        }
        case 'review': {
          const phone = normalizeAnyMobile(priv.contact_phone ?? '');
          if (!phone) return fail('invalidMobile');
          const wa = priv.whatsapp_number?.trim() ? normalizeAnyMobile(priv.whatsapp_number) : phone;
          if (!wa) return fail('invalidMobile');
          const { error: err } = await supabase.from('profile_private')
            .update({ last_name: priv.last_name?.trim() || null, contact_phone: phone, whatsapp_number: wa }).eq('profile_id', id!);
          if (err) throw err;
          await updateProfile({ contact_policy: p.contact_policy ?? 'anyone' });
          return true;
        }
      }
    } catch (e) {
      setError(friendlyError(e as { message?: string }, lang));
      return false;
    }
  }

  async function next() {
    setBusy(true);
    const ok = await saveStep();
    setBusy(false);
    if (ok && stepIdx < STEPS.length - 1 && step !== 'basics') setStepIdx(stepIdx + 1);
    else if (ok && step === 'basics' && id) setStepIdx(1);
  }

  async function submit() {
    setBusy(true);
    const ok = await saveStep();
    if (ok && p.status === 'draft') {
      const { error: err } = await supabase.from('profiles').update({ status: 'pending_review' }).eq('id', id!);
      if (err) setError(friendlyError(err, lang)); else { setSubmitted(true); setP((x) => ({ ...x, status: 'pending_review' })); }
    } else if (ok) setSubmitted(true);
    setBusy(false);
  }

  if (loading) return <Loading />;

  return (
    <Screen>
      <TopBar back />
      <P muted>{t('stepOf', { n: stepIdx + 1, total: STEPS.length })}</P>
      <H1>{t(`step_${step}` as TKey)}</H1>
      {id && (
        <View style={styles.steps}>
          {STEPS.map((st, i) => (
            <Pressable key={st} accessibilityRole="tab" accessibilityState={{ selected: i === stepIdx }}
              accessibilityLabel={t(`step_${st}` as TKey)} onPress={() => { setError(null); setStepIdx(i); }}
              style={[styles.dot, i === stepIdx && styles.dotActive, i < stepIdx && styles.dotDone]} />
          ))}
        </View>
      )}
      {p.status === 'draft' && p.review_note ? <Banner kind="error">{t('reviewNote', { note: p.review_note })}</Banner> : null}
      {error && <Banner kind="error">{error}</Banner>}

      <Card>
        {step === 'basics' && (
          <>
            <ChipSelect label={t('whoFor')} options={managedByOptions} value={p.managed_by} onChange={set('managed_by')} required />
            <Field label={t('firstName')} required value={p.first_name ?? ''} onChangeText={set('first_name')}
              help={t('firstNameHelp')} maxLength={60} autoCapitalize="words" testID="first-name" />
            {id ? (
              <P muted>{t('gender')}: {enumLabel('gender', p.gender)}</P>
            ) : (
              <ChipSelect label={t('gender')} options={enumOptions('gender')} value={p.gender} onChange={(v) => set('gender')(v as Profile['gender'] | null)} required />
            )}
            <Text style={styles.label}>{t('dob')} *</Text>
            <Row>
              <View style={styles.dateDay}><Field label={t('day')} required value={dob.d} keyboardType="number-pad" maxLength={2}
                onChangeText={(v) => setDob({ ...dob, d: v.replace(/\D/g, '') })} testID="dob-day" /></View>
              <View style={styles.dateDay}><Field label={t('month')} required value={dob.m} keyboardType="number-pad" maxLength={2}
                onChangeText={(v) => setDob({ ...dob, m: v.replace(/\D/g, '') })} testID="dob-month" /></View>
              <View style={styles.dateYear}><Field label={t('year')} required value={dob.y} keyboardType="number-pad" maxLength={4}
                onChangeText={(v) => setDob({ ...dob, y: v.replace(/\D/g, '') })} testID="dob-year" /></View>
            </Row>
            <ChipSelect label={t('maritalStatus')} options={enumOptions('marital_status')} value={p.marital_status} onChange={set('marital_status')} required />
            {p.marital_status && p.marital_status !== 'never_married' && numField('children_count', 'children', { max: 2 })}
            <Text style={styles.label}>{t('height')} *</Text>
            <Row>
              <View style={styles.dateYear}><Field label={t('feet')} required value={height.ft} keyboardType="number-pad" maxLength={1}
                onChangeText={(v) => setHeight({ ...height, ft: v.replace(/\D/g, '') })} testID="height-ft" /></View>
              <View style={styles.dateYear}><Field label={t('inches')} required value={height.inch} keyboardType="number-pad" maxLength={2}
                onChangeText={(v) => setHeight({ ...height, inch: v.replace(/\D/g, '') })} testID="height-in" /></View>
            </Row>
          </>
        )}

        {step === 'community' && (
          <>
            <LookupSelect label={t('sect')} otherLabel={t('otherSect')} options={lookupOptions('sect', lang)} value={p.sect} onChange={set('sect')} required />
            <LookupSelect label={t('caste')} otherLabel={t('otherCaste')} options={lookupOptions('caste', lang)} value={p.caste} onChange={set('caste')} />
            <LookupSelect label={t('motherTongue')} otherLabel={t('otherTongue')} options={lookupOptions('mother_tongue', lang)} value={p.mother_tongue} onChange={set('mother_tongue')} />
            <ChipSelect label={t('religiosity')} options={enumOptions('religiosity')} value={p.religiosity} onChange={set('religiosity')} />
            <YesNo label={t('hafiz')} value={p.is_hafiz} onChange={set('is_hafiz')} />
          </>
        )}

        {step === 'education' && (
          <>
            <ChipSelect label={t('educationLevel')} options={enumOptions('education_level')} value={p.education_level} onChange={set('education_level')} required />
            <Field label={t('degree')} value={p.degree_title ?? ''} onChangeText={set('degree_title')} maxLength={120} />
            <Field label={t('institution')} value={p.institution ?? ''} onChangeText={set('institution')} maxLength={120} />
            <Field label={t('profession')} value={p.profession ?? ''} onChangeText={set('profession')} maxLength={120} />
            {numField('monthly_income_pkr', 'income', { help: t('incomeHelp'), max: 9 })}
          </>
        )}

        {step === 'location' && (
          <>
            <LookupSelect label={t('city')} otherLabel={t('otherCity')} options={lookupOptions('city', lang)} value={p.city} onChange={set('city')} required testID="city" />
            <LookupSelect label={t('country')} otherLabel={t('otherCountry')} options={lookupOptions('country', lang)} value={p.country} onChange={(v) => set('country')(v ?? 'pakistan')} />
            <YesNo label={t('relocate')} value={p.willing_to_relocate} onChange={set('willing_to_relocate')} />
            <YesNo label={t('smokes')} value={p.smokes} onChange={set('smokes')} />
            <Field label={t('about')} value={p.about ?? ''} onChangeText={set('about')} help={t('aboutHelp')} multiline maxLength={2000} />
          </>
        )}

        {step === 'family' && (
          <>
            <Field label={t('fatherOccupation')} value={p.father_occupation ?? ''} onChangeText={set('father_occupation')} maxLength={120} />
            <Field label={t('motherOccupation')} value={p.mother_occupation ?? ''} onChangeText={set('mother_occupation')} maxLength={120} />
            <Row>
              <View style={styles.third}>{numField('brothers_count', 'brothers', { max: 2 })}</View>
              <View style={styles.third}>{numField('sisters_count', 'sisters', { max: 2 })}</View>
              <View style={styles.third}>{numField('married_siblings', 'marriedSiblings', { max: 2 })}</View>
            </Row>
            <ChipSelect label={t('familyType')} options={enumOptions('family_type')} value={p.family_type} onChange={set('family_type')} />
            <ChipSelect label={t('house')} options={enumOptions('house_ownership')} value={p.house_ownership} onChange={set('house_ownership')} />
            <Field label={t('houseSize')} value={p.house_size ?? ''} onChangeText={set('house_size')} maxLength={60} />
            <ChipSelect label={t('familyStatus')} options={enumOptions('socioeconomic_class')} value={p.socioeconomic_class}
              onChange={set('socioeconomic_class')} help={t('familyStatusHelp')} />
            <Field label={t('familyAbout')} value={p.family_about ?? ''} onChangeText={set('family_about')} multiline maxLength={2000} />
          </>
        )}

        {step === 'preferences' && (
          <>
            <Text style={styles.label}>{t('prefAge')} (18–80)</Text>
            <Row>
              <View style={styles.dateYear}>{numField('age_min', 'from', { max: 2 })}</View>
              <View style={styles.dateYear}>{numField('age_max', 'to', { max: 2 })}</View>
            </Row>
            <Text style={styles.label}>{t('prefHeight')}</Text>
            <Row>
              <View style={styles.dateDay}><Field label={`${t('from')} (${t('feet')})`} value={prefH.minFt} keyboardType="number-pad" maxLength={1}
                onChangeText={(v) => setPrefH({ ...prefH, minFt: v.replace(/\D/g, '') })} /></View>
              <View style={styles.dateDay}><Field label={t('inches')} value={prefH.minIn} keyboardType="number-pad" maxLength={2}
                onChangeText={(v) => setPrefH({ ...prefH, minIn: v.replace(/\D/g, '') })} /></View>
              <View style={styles.dateDay}><Field label={`${t('to')} (${t('feet')})`} value={prefH.maxFt} keyboardType="number-pad" maxLength={1}
                onChangeText={(v) => setPrefH({ ...prefH, maxFt: v.replace(/\D/g, '') })} /></View>
              <View style={styles.dateDay}><Field label={t('inches')} value={prefH.maxIn} keyboardType="number-pad" maxLength={2}
                onChangeText={(v) => setPrefH({ ...prefH, maxIn: v.replace(/\D/g, '') })} /></View>
            </Row>
            <MultiChipSelect label={t('prefMarital')} options={enumOptions('marital_status')} values={prefs.marital_statuses ?? []} onChange={setPref('marital_statuses')} />
            <ChipSelect label={t('prefEducation')} options={enumOptions('education_level')} value={prefs.education_min} onChange={setPref('education_min')} />
            <ChipSelect label={t('prefFamilyStatus')} options={enumOptions('socioeconomic_class')} value={prefs.socioeconomic_min} onChange={setPref('socioeconomic_min')} />
            <Banner>{t('mustHelp')}</Banner>
            <MultiChipSelect label={t('prefSects')} options={lookupOptions('sect', lang)} values={prefs.sects ?? []} onChange={setPref('sects')} />
            {!!prefs.sects?.length && <YesNo label={`${t('prefSects')} — ${t('must')}`} value={prefs.sect_is_must} onChange={setPref('sect_is_must')} />}
            <MultiChipSelect label={t('prefCastes')} options={lookupOptions('caste', lang)} values={prefs.castes ?? []} onChange={setPref('castes')} />
            {!!prefs.castes?.length && <YesNo label={`${t('prefCastes')} — ${t('must')}`} value={prefs.caste_is_must} onChange={setPref('caste_is_must')} />}
            <MultiChipSelect label={t('prefCities')} options={lookupOptions('city', lang)} values={prefs.cities ?? []} onChange={setPref('cities')} />
            {!!prefs.cities?.length && <YesNo label={`${t('prefCities')} — ${t('must')}`} value={prefs.city_is_must} onChange={setPref('city_is_must')} />}
            <MultiChipSelect label={t('prefTongues')} options={lookupOptions('mother_tongue', lang)} values={prefs.mother_tongues ?? []} onChange={setPref('mother_tongues')} />
            <Field label={t('prefNotes')} value={prefs.notes ?? ''} onChangeText={setPref('notes')} multiline maxLength={1000} />
          </>
        )}

        {step === 'review' && (
          <>
            <Text style={styles.sectionTitle}>🔒 {t('privateDetails')}</Text>
            <P muted>{t('privateHelp')}</P>
            <Field label={t('lastName')} value={priv.last_name ?? ''} onChangeText={(v) => setPriv({ ...priv, last_name: v })} maxLength={60} />
            <Field label={t('contactPhone')} required value={priv.contact_phone ?? ''} onChangeText={(v) => setPriv({ ...priv, contact_phone: v })}
              keyboardType="phone-pad" maxLength={20} placeholder="03XX XXXXXXX" help={t('contactPhoneHelp')} testID="contact-phone" />
            <Field label={t('whatsapp')} value={priv.whatsapp_number ?? ''} onChangeText={(v) => setPriv({ ...priv, whatsapp_number: v })}
              keyboardType="phone-pad" maxLength={20} placeholder="03XX XXXXXXX" help={t('whatsappHelp')} />
            <ChipSelect label={t('whoCanContact')} options={enumOptions('contact_policy')} value={p.contact_policy}
              onChange={(v) => set('contact_policy')(v ?? 'anyone')} required />
            <Banner>{t('photosLater')}</Banner>
          </>
        )}
      </Card>

      {error && <Banner kind="error">{error}</Banner>}
      {submitted && <Banner kind="success">{t('submitted')}</Banner>}

      <Row>
        {stepIdx > 0 && (
          <View style={styles.flex}><Button title={t('back')} variant="secondary" onPress={() => { setError(null); setStepIdx(stepIdx - 1); }} /></View>
        )}
        <View style={styles.flex}>
          {step === 'review' ? (
            p.status === 'draft'
              ? <Button title={t('submit')} onPress={submit} loading={busy} disabled={submitted} testID="submit-profile" />
              : <Button title={t('save')} onPress={async () => { setBusy(true); if (await saveStep()) router.replace('/'); setBusy(false); }} loading={busy} />
          ) : (
            <Button title={t('saveContinue')} onPress={next} loading={busy} testID="save-continue" />
          )}
        </View>
      </Row>
      {step === 'review' && p.status === 'draft' && <P muted>{t('submitHelp')}</P>}
      {submitted && <Button title={t('done')} variant="ghost" onPress={() => router.replace('/')} />}
    </Screen>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: 14, fontWeight: '600', color: colors.text, marginBottom: -space(2) },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: colors.primary },
  steps: { flexDirection: 'row', gap: space(1.5) },
  dot: { flex: 1, height: 6, borderRadius: radius.pill, backgroundColor: colors.chip },
  dotActive: { backgroundColor: colors.primary },
  dotDone: { backgroundColor: colors.accent },
  dateDay: { width: 80 },
  dateYear: { width: 110 },
  third: { flexGrow: 1, flexBasis: 90 },
  flex: { flex: 1 },
});
