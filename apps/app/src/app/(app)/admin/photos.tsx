import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { PageTitle } from '../../../components/admin';
import { EmptyState } from '../../../components/kit';
import { Banner, Button, Row } from '../../../components/ui';
import { supabase } from '../../../lib/supabase';
import { colors, radius, space } from '../../../lib/theme';

type P = { id: string; profile_id: string; storage_path: string; created_at: string; profiles: { first_name: string; public_code: string; gender: string } | null; url?: string };

// Every member photo is checked here before anyone else can ever see it.
export default function PhotoQueue() {
  const [rows, setRows] = useState<P[]>([]);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await supabase.from('profile_photos')
      .select('id,profile_id,storage_path,created_at,profiles(first_name,public_code,gender)').eq('status', 'pending').order('created_at').limit(60);
    if (error) { setMsg(error.message); return; }
    const list = (data ?? []) as unknown as P[];
    // staff may read the private bucket; links last 5 minutes
    const { data: signed } = list.length
      ? await supabase.storage.from('profile-photos').createSignedUrls(list.map((r) => r.storage_path), 300)
      : { data: [] as { path: string | null; signedUrl: string }[] };
    const byPath = new Map((signed ?? []).map((s) => [s.path, s.signedUrl]));
    setRows(list.map((r) => ({ ...r, url: byPath.get(r.storage_path) ?? undefined })));
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function decide(r: P, approve: boolean) {
    const { error } = await supabase.rpc('admin_review_photo', { p_photo: r.id, p_approve: approve });
    if (error) setMsg(error.message); else setRows((x) => x.filter((y) => y.id !== r.id));
  }

  return (
    <>
      <PageTitle title="Photo checks" sub="Approve only real, decent photos of the candidate — no group photos, no other people, no contact details" />
      {msg && <Banner kind="error">{msg}</Banner>}
      {rows.length === 0 ? <EmptyState icon="images-outline" text="No photos waiting." /> : (
        <View style={styles.grid}>
          {rows.map((r) => (
            <View key={r.id} style={styles.tile}>
              {r.url ? <Image source={{ uri: r.url }} style={styles.img} resizeMode="cover" accessibilityLabel={`Photo of ${r.profiles?.first_name}`} /> : <View style={styles.img} />}
              <View style={{ padding: space(3), gap: space(2) }}>
                <Text style={styles.name} onPress={() => router.push(`/admin/member/${r.profile_id}`)}>
                  {r.profiles?.first_name} · {r.profiles?.public_code} · {r.profiles?.gender === 'female' ? 'F' : 'M'}
                </Text>
                <Row>
                  <Button title="Approve" onPress={() => decide(r, true)} />
                  <Button title="Reject" variant="secondary" onPress={() => decide(r, false)} />
                </Row>
              </View>
            </View>
          ))}
        </View>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space(4) },
  tile: { width: 260, backgroundColor: '#fff', borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  img: { width: '100%', aspectRatio: 3 / 4, backgroundColor: colors.chip },
  name: { fontSize: 14.5, fontWeight: '700', color: colors.primary, textDecorationLine: 'underline' },
});
