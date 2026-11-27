import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Image, StyleSheet, Text, View } from 'react-native';
import { EmptyState, Tag } from '../../../../components/kit';
import { TopBar } from '../../../../components/TopBar';
import { Banner, Button, H1, P, Row, Screen } from '../../../../components/ui';
import { useI18n, type TKey } from '../../../../lib/i18n';
import { friendlyError } from '../../../../lib/profile';
import { supabase } from '../../../../lib/supabase';
import { colors, radius, space } from '../../../../lib/theme';
import { fetchPhotoUrls, pickImage, uploadImage, type PhotoUrl } from '../../../../lib/upload';

type Row = { id: string; storage_path: string; status: string; is_primary: boolean; sort_order: number };

export default function MyPhotos() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, lang } = useI18n();
  const [rows, setRows] = useState<Row[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data } = await supabase.from('profile_photos').select('id,storage_path,status,is_primary,sort_order')
      .eq('profile_id', id).order('is_primary', { ascending: false }).order('sort_order');
    setRows((data ?? []) as Row[]);
    try {
      const list: PhotoUrl[] = await fetchPhotoUrls(id);
      setUrls(Object.fromEntries(list.map((p) => [p.id, p.url])));
    } catch { /* thumbnails optional */ }
    setLoading(false);
  }, [id]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function add() {
    setError(null);
    const img = await pickImage();
    if (!img) return;
    setBusy(true);
    try {
      const path = await uploadImage('profile-photos', id, img);
      const { error: err } = await supabase.from('profile_photos')
        .insert({ profile_id: id, storage_path: path, is_primary: rows.length === 0, sort_order: rows.length });
      if (err) throw err;
      await load();
    } catch (e) {
      const msg = (e as Error).message;
      setError(msg === 'image_too_large' ? t('imageTooLarge') : friendlyError(e as { message?: string }, lang));
    } finally { setBusy(false); }
  }

  async function remove(r: Row) {
    setError(null);
    const { error: err } = await supabase.from('profile_photos').delete().eq('id', r.id);
    if (err) { setError(friendlyError(err, lang)); return; }
    await supabase.storage.from('profile-photos').remove([r.storage_path]);
    load();
  }

  async function makeMain(r: Row) {
    await supabase.from('profile_photos').update({ is_primary: false }).eq('profile_id', id).neq('id', r.id);
    await supabase.from('profile_photos').update({ is_primary: true }).eq('id', r.id);
    load();
  }

  return (
    <Screen>
      <TopBar back />
      <H1>{t('myPhotos')}</H1>
      <P muted>{t('photosHelp')}</P>
      {error && <Banner kind="error">{error}</Banner>}
      {loading && <ActivityIndicator color={colors.primary} />}
      {!loading && rows.length === 0 && <EmptyState icon="images-outline" text={t('maxPhotos')} />}
      <View style={styles.grid}>
        {rows.map((r) => (
          <View key={r.id} style={styles.tile}>
            {urls[r.id] ? <Image source={{ uri: urls[r.id] }} style={styles.img} resizeMode="cover" accessibilityLabel={t('myPhotos')} />
              : <View style={[styles.img, { alignItems: 'center', justifyContent: 'center' }]}><ActivityIndicator color={colors.muted} /></View>}
            <View style={styles.meta}>
              <Row style={{ alignItems: 'center' }}>
                <Tag label={t(`photo_${r.status}` as TKey)} tone={r.status === 'approved' ? 'green' : r.status === 'rejected' ? 'red' : 'gold'} />
                {r.is_primary && <Tag label="★" tone="navy" />}
              </Row>
              <Row>
                {!r.is_primary && r.status !== 'rejected' && <Button title={t('makeMain')} variant="ghost" onPress={() => makeMain(r)} />}
                <Button title={t('removePhoto')} variant="ghost" onPress={() => remove(r)} />
              </Row>
            </View>
          </View>
        ))}
      </View>
      {rows.length < 6 && <Button title={`+ ${t('addPhoto')}`} onPress={add} loading={busy} />}
      <Text style={styles.note}>{t('maxPhotos')}</Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space(3) },
  tile: { flexGrow: 1, flexBasis: 150, maxWidth: 300, backgroundColor: '#fff', borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  img: { width: '100%', aspectRatio: 3 / 4, backgroundColor: colors.chip },
  meta: { padding: space(2.5), gap: space(1) },
  note: { fontSize: 12.5, color: colors.muted, textAlign: 'center' },
});
