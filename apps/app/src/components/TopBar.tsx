import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useI18n } from '../lib/i18n';
import { colors, space } from '../lib/theme';

export function TopBar({ title, back }: { title?: string; back?: boolean }) {
  const { t, lang, setLang } = useI18n();
  return (
    <View style={styles.bar}>
      <View style={styles.side}>
        {back ? (
          <Pressable accessibilityRole="button" onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} hitSlop={12}>
            <Text style={styles.link}>{lang === 'ur' ? '→ ' : '← '}{t('back')}</Text>
          </Pressable>
        ) : <Text style={styles.brand}>{t('appName')}</Text>}
      </View>
      {title ? <Text style={styles.title} numberOfLines={1}>{title}</Text> : <View style={{ flex: 1 }} />}
      <View style={[styles.side, { alignItems: 'flex-end' }]}>
        <Pressable accessibilityRole="button" accessibilityLabel="Change language / زبان تبدیل کریں"
          onPress={() => setLang(lang === 'en' ? 'ur' : 'en')} style={styles.lang} hitSlop={8}>
          <Text style={styles.langText}>{t('language')}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', gap: space(2), minHeight: 44 },
  side: { minWidth: 80 },
  brand: { fontSize: 20, fontWeight: '800', color: colors.primary, letterSpacing: 0.5 },
  title: { flex: 1, textAlign: 'center', fontSize: 16, fontWeight: '600', color: colors.text },
  link: { fontSize: 15, color: colors.primary, fontWeight: '600' },
  lang: { paddingHorizontal: space(3), paddingVertical: space(1.5), borderRadius: 999, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card },
  langText: { fontSize: 14, color: colors.primary, fontWeight: '600' },
});
