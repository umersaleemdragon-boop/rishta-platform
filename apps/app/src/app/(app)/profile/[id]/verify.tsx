import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { Image, Platform, StyleSheet, Text, View } from 'react-native';
import { Tag } from '../../../../components/kit';
import { TopBar } from '../../../../components/TopBar';
import { Banner, Button, Card, H1, P, Row, Screen } from '../../../../components/ui';
import { useI18n, type TKey } from '../../../../lib/i18n';
import { friendlyError } from '../../../../lib/profile';
import { supabase } from '../../../../lib/supabase';
import { colors, radius, space } from '../../../../lib/theme';
import { pickImage, uploadImage, type Picked } from '../../../../lib/upload';

type Req = { id: string; level: string; status: string; created_at: string; reviewer_note: string | null };
type Slot = 'front' | 'back' | 'selfie';

export default function Verify() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, lang } = useI18n();
  const [reqs, setReqs] = useState<Req[]>([]);
  const [level, setLevel] = useState<string>('none');
  const [imgs, setImgs] = useState<Partial<Record<Slot, Picked>>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const load = useCallback(async () => {
    const [r, p] = await Promise.all([
      supabase.from('verification_requests').select('id,level,status,created_at,reviewer_note').eq('profile_id', id).order('created_at', { ascending: false }),
      supabase.from('profiles').select('verification_level').eq('id', id).single(),
    ]);
    setReqs((r.data ?? []) as Req[]); setLevel(p.data?.verification_level ?? 'none');
  }, [id]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function choose(slot: Slot, camera?: boolean) {
    const img = await pickImage({ camera: camera && Platform.OS !== 'web' });
    if (img) setImgs((x) => ({ ...x, [slot]: img }));
  }

  async function submit() {
    if (!imgs.front || !imgs.back || !imgs.selfie) return;
    setBusy(true); setError(null);
    try {
      const [front, back, selfie] = await Promise.all([
        uploadImage('verification-docs', id, imgs.front), uploadImage('verification-docs', id, imgs.back), uploadImage('verification-docs', id, imgs.selfie),
      ]);
      const { error: err } = await supabase.rpc('submit_verification', { p_profile: id, p_cnic_front_path: front, p_cnic_back_path: back, p_selfie_path: selfie });
      if (err) throw err;
      setDone(true); setImgs({}); load();
    } catch (e) {
      const msg = (e as Error).message;
      setError(msg === 'image_too_large' ? t('imageTooLarge') : friendlyError(e as { message?: string }, lang));
    } finally { setBusy(false); }
  }

  const pending = reqs.some((r) => r.status === 'pending' && r.level === 'cnic');
  const verified = level === 'cnic' || level === 'bureau';
  const slots: { key: Slot; label: string; camera?: boolean }[] = [
    { key: 'front', label: t('cnicFront') }, { key: 'back', label: t('cnicBack') }, { key: 'selfie', label: t('selfie'), camera: true },
  ];

  return (
    <Screen>
      <TopBar back />
      <H1>{t('verifyCnicTitle')}</H1>
      <P muted>{t('verifyCnicHelp')}</P>
      {verified && <Banner kind="success">{t(level === 'bureau' ? 'verified_bureau' : 'verified_cnic')} ✓</Banner>}
      {done && <Banner kind="success">{t('verificationSubmitted')}</Banner>}
      {error && <Banner kind="error">{error}</Banner>}

      {!verified && !pending && (
        <Card>
          {slots.map((s) => (
            <View key={s.key} style={styles.slot}>
              <Text style={styles.label}>{s.label} *</Text>
              {imgs[s.key] && <Image source={{ uri: imgs[s.key]!.uri }} style={styles.preview} resizeMode="contain" accessibilityLabel={s.label} />}
              <Row>
                <Button title={imgs[s.key] ? '✓ ' + t('chooseImage') : t('chooseImage')} variant="secondary" onPress={() => choose(s.key)} />
                {s.camera && Platform.OS !== 'web' && <Button title={t('takeSelfie')} variant="ghost" onPress={() => choose(s.key, true)} />}
              </Row>
            </View>
          ))}
          <Button title={t('submitVerification')} onPress={submit} loading={busy} disabled={!imgs.front || !imgs.back || !imgs.selfie} />
        </Card>
      )}

      {reqs.map((r) => (
        <Card key={r.id}>
          <Row style={{ justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={styles.label}>{r.level === 'bureau' ? t('verified_bureau') : t('verifyCnicTitle')} · {new Date(r.created_at).toLocaleDateString()}</Text>
            <Tag label={t(`ver_${r.status}` as TKey)} tone={r.status === 'approved' ? 'green' : r.status === 'pending' ? 'gold' : 'red'} />
          </Row>
          {r.reviewer_note && r.status === 'rejected' && <P muted>{r.reviewer_note}</P>}
        </Card>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  slot: { gap: space(2), paddingBottom: space(3), borderBottomWidth: 1, borderBottomColor: '#EFEBE3' },
  label: { fontSize: 15, fontWeight: '700', color: colors.text },
  preview: { width: '100%', height: 180, borderRadius: radius.md, backgroundColor: colors.chip },
});
