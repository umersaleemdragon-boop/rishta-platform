import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Platform, StyleSheet, Text, View } from 'react-native';
import { useI18n } from '../lib/i18n';
import { friendlyError } from '../lib/profile';
import { fetchPhotoUrls, type PhotoUrl } from '../lib/upload';
import { colors, radius, space } from '../lib/theme';
import { Sheet } from './kit';
import { Banner } from './ui';

// Shows another member's approved photos. Links come from the photo-urls Edge
// Function (permission re-checked every time, links expire after 60 s). Each
// image carries a visible watermark naming the viewer, so screenshots are traceable.
export function PhotoViewer({ open, onClose, owner, viewer, viewerCode, title }: {
  open: boolean; onClose: () => void; owner: string; viewer: string; viewerCode: string; title: string;
}) {
  const { t, lang } = useI18n();
  const [photos, setPhotos] = useState<PhotoUrl[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) { setPhotos(null); return; }
    setError(null);
    fetchPhotoUrls(owner, viewer).then(setPhotos).catch(() => setError(friendlyError({ message: 'photo_access_required' }, lang)));
  }, [open, owner, viewer]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Sheet open={open} onClose={onClose} title={title}>
      {error && <Banner kind="error">{error}</Banner>}
      {!photos && !error && <ActivityIndicator color={colors.primary} />}
      {photos?.length === 0 && <Text style={{ color: colors.muted }}>{t('noPhotos')}</Text>}
      {photos?.map((p) => (
        <View key={p.id} style={styles.frame}
          // web: no right-click "save image" menu (a deterrent, not a guarantee)
          {...(Platform.OS === 'web' ? ({ onContextMenu: (e: { preventDefault: () => void }) => e.preventDefault() } as object) : {})}>
          <Image source={{ uri: p.url }} style={styles.img} resizeMode="cover" accessibilityLabel={title} />
          <View pointerEvents="none" style={styles.mark}>
            {[0, 1, 2].map((i) => <Text key={i} style={styles.markText}>{viewerCode} · Zaujyn</Text>)}
          </View>
        </View>
      ))}
      {photos && photos.length > 0 && <Text style={styles.note}>{t('sharedWith', { code: viewerCode })}</Text>}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  frame: { borderRadius: radius.lg, overflow: 'hidden', backgroundColor: colors.chip },
  img: { width: '100%', aspectRatio: 3 / 4 },
  mark: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'space-around', alignItems: 'center', transform: [{ rotate: '-24deg' }] },
  markText: { color: 'rgba(255,255,255,0.55)', fontSize: 22, fontWeight: '800', letterSpacing: 2, textShadowColor: 'rgba(0,0,0,0.35)', textShadowRadius: 4 },
  note: { fontSize: 12.5, color: colors.muted, textAlign: 'center', marginTop: space(1) },
});
