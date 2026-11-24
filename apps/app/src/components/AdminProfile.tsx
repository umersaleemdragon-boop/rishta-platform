import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { heightText, joinDot, useLabels } from '../lib/format';
import { useI18n } from '../lib/i18n';
import type { Profile } from '../lib/profile';
import { supabase } from '../lib/supabase';
import { colors, space } from '../lib/theme';
import { ageFromDob, KV, Panel } from './admin';
import { Tag } from './kit';
import { Button } from './ui';

// Full staff view of a profile; private contact details stay masked until
// "Reveal" (which is written to the audit log).
export function AdminProfileCard({ p, prefs }: { p: Profile; prefs?: Record<string, unknown> | null }) {
  const { enumLabel } = useI18n();
  const { lbl } = useLabels();
  const [contact, setContact] = useState<Record<string, string | null> | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function reveal() {
    const { data, error } = await supabase.rpc('admin_reveal_contact', { p_profile: p.id });
    if (error) setErr(error.message); else setContact(data as Record<string, string | null>);
  }
  const arr = (k: string) => ((prefs?.[k] as string[] | undefined) ?? []);

  return (
    <Panel>
      <View style={styles.head}>
        <View style={{ flex: 1 }}>
          <Text style={styles.name}>{p.first_name}, {ageFromDob(p.date_of_birth)} · {p.public_code}</Text>
          <Text style={styles.sub}>{joinDot(enumLabel('gender', p.gender), lbl('city', p.city), enumLabel('managed_by', p.managed_by), `${p.completeness}% complete`)}</Text>
        </View>
        <Tag label={p.status.replace('_', ' ')} tone={p.status === 'active' ? 'green' : p.status === 'pending_review' ? 'gold' : 'grey'} />
      </View>
      <KV k="Education & work" v={joinDot(enumLabel('education_level', p.education_level), p.degree_title, p.institution, p.profession)} />
      <KV k="Income" v={p.monthly_income_pkr ? `PKR ${p.monthly_income_pkr.toLocaleString('en-PK')} / month` : ''} />
      <KV k="Community" v={joinDot(lbl('sect', p.sect), lbl('caste', p.caste), lbl('mother_tongue', p.mother_tongue), enumLabel('religiosity', p.religiosity))} />
      <KV k="Personal" v={joinDot(enumLabel('marital_status', p.marital_status), heightText(p.height_cm), p.date_of_birth, p.is_hafiz ? 'Hafiz' : null)} />
      <KV k="Family" v={joinDot(p.father_occupation && `Father: ${p.father_occupation}`, p.mother_occupation && `Mother: ${p.mother_occupation}`,
        `${p.brothers_count} brothers, ${p.sisters_count} sisters`, enumLabel('family_type', p.family_type), enumLabel('house_ownership', p.house_ownership),
        p.house_size, enumLabel('socioeconomic_class', p.socioeconomic_class))} />
      <KV k="Verification" v={p.verification_level} />
      {p.about && <Text style={styles.about}>{p.about}</Text>}
      {p.family_about && <Text style={styles.about}>{p.family_about}</Text>}
      {prefs && (
        <KV k="Looking for" v={joinDot(prefs.age_min || prefs.age_max ? `${prefs.age_min ?? 18}–${prefs.age_max ?? 80} yrs` : null,
          enumLabel('education_level', prefs.education_min as string), arr('cities').map((c) => lbl('city', c)).join(', '),
          arr('sects').join(', '), arr('castes').join(', '), prefs.notes as string)} />
      )}
      <View style={styles.contact}>
        <Text style={styles.k}>Private contact</Text>
        {contact ? (
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={styles.v}>{joinDot(contact.last_name, contact.contact_phone, contact.whatsapp_number && `WA ${contact.whatsapp_number}`)}</Text>
            <Text style={styles.sub}>{joinDot(contact.login_email, contact.login_phone, contact.address)}</Text>
          </View>
        ) : (
          <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: space(3), flexWrap: 'wrap' }}>
            <Text style={styles.v}>•••• ••••••</Text>
            <Button title="Reveal (logged)" variant="ghost" onPress={reveal} />
          </View>
        )}
      </View>
      {err && <Text style={{ color: colors.danger }}>{err}</Text>}
    </Panel>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', gap: space(3), alignItems: 'flex-start' },
  name: { fontSize: 20, fontWeight: '800', color: colors.primary },
  sub: { fontSize: 13, color: colors.muted, marginTop: 2 },
  about: { fontSize: 14, lineHeight: 21, color: '#3C4148', backgroundColor: colors.bg, borderRadius: 10, padding: space(3) },
  contact: { flexDirection: 'row', gap: space(3), alignItems: 'center', borderTopWidth: 1, borderTopColor: '#EFEBE3', paddingTop: space(3) },
  k: { width: 150, fontSize: 13.5, color: colors.muted },
  v: { fontSize: 14, color: colors.text, fontWeight: '600' },
});
