import { router, usePathname } from 'expo-router';
import { type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, radius, space } from '../lib/theme';
import { Icon, type IconName } from './kit';

// Staff-only admin panel (English). Every action is also enforced in the database.
export const NAV: { href: string; label: string; icon: IconName; roles: string[] }[] = [
  { href: '/admin', label: 'Dashboard', icon: 'grid-outline', roles: ['super_admin', 'verifier', 'matchmaker', 'accountant'] },
  { href: '/admin/approvals', label: 'Approvals', icon: 'checkmark-done-outline', roles: ['super_admin', 'verifier'] },
  { href: '/admin/verifications', label: 'CNIC checks', icon: 'card-outline', roles: ['super_admin', 'verifier'] },
  { href: '/admin/photos', label: 'Photo checks', icon: 'images-outline', roles: ['super_admin', 'verifier'] },
  { href: '/admin/payments', label: 'Payments', icon: 'cash-outline', roles: ['super_admin', 'accountant'] },
  { href: '/admin/members', label: 'All members', icon: 'people-outline', roles: ['super_admin', 'verifier', 'matchmaker', 'accountant'] },
  { href: '/admin/import', label: 'WhatsApp import', icon: 'cloud-upload-outline', roles: ['super_admin', 'matchmaker'] },
];

export function AdminShell({ role, children }: { role: string; children: ReactNode }) {
  const { width } = useWindowDimensions();
  const path = usePathname();
  const wide = width >= 900;
  const items = NAV.filter((n) => n.roles.includes(role));
  const isActive = (href: string) => (href === '/admin' ? path === '/admin' : path.startsWith(href));

  const nav = items.map((n) => (
    <Pressable key={n.href} accessibilityRole="link" accessibilityState={{ selected: isActive(n.href) }}
      onPress={() => router.push(n.href as never)} style={[wide ? styles.side : styles.top, isActive(n.href) && (wide ? styles.sideOn : styles.topOn)]}>
      <Icon name={n.icon} size={18} color={wide ? (isActive(n.href) ? '#fff' : '#C9D3E0') : (isActive(n.href) ? '#fff' : colors.primary)} />
      <Text style={[wide ? styles.sideText : styles.topText, isActive(n.href) && { color: '#fff', fontWeight: '700' }]}>{n.label}</Text>
    </Pressable>
  ));

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F4F2ED' }} edges={['top', 'bottom']}>
      <View style={{ flex: 1, flexDirection: wide ? 'row' : 'column' }}>
        {wide ? (
          <View style={styles.sidebar}>
            <Text style={styles.brand}>Zaujyn</Text>
            <Text style={styles.brandSub}>Staff panel · {role.replace('_', ' ')}</Text>
            <View style={{ gap: 2, marginTop: space(4) }}>{nav}</View>
            <Pressable onPress={() => router.replace('/me')} style={[styles.side, { marginTop: 'auto' }]} accessibilityRole="link">
              <Icon name="arrow-back" size={18} color="#C9D3E0" /><Text style={styles.sideText}>Back to app</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.topbar}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={[styles.brand, { color: colors.primary }]}>Zaujyn staff</Text>
              <Pressable onPress={() => router.replace('/me')} accessibilityRole="link" hitSlop={10}><Text style={{ color: colors.primary, fontWeight: '600' }}>Back to app</Text></Pressable>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space(2) }}>{nav}</ScrollView>
          </View>
        )}
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: wide ? space(7) : space(4), gap: space(4), maxWidth: 1280, width: '100%' }}>
          {children}
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

export function PageTitle({ title, sub }: { title: string; sub?: string }) {
  return (
    <View>
      <Text style={styles.h1}>{title}</Text>
      {sub && <Text style={styles.sub}>{sub}</Text>}
    </View>
  );
}

export function Panel({ children, style }: { children: ReactNode; style?: object }) {
  return <View style={[styles.panel, style]}>{children}</View>;
}

export function KV({ k, v }: { k: string; v: ReactNode }) {
  if (v === null || v === undefined || v === '') return null;
  return (
    <View style={styles.kv}>
      <Text style={styles.k}>{k}</Text>
      {typeof v === 'string' || typeof v === 'number' ? <Text style={styles.v}>{v}</Text> : <View style={{ flex: 1 }}>{v}</View>}
    </View>
  );
}

export function Split({ left, right }: { left: ReactNode; right: ReactNode }) {
  const { width } = useWindowDimensions();
  const wide = width >= 1100;
  return (
    <View style={{ flexDirection: wide ? 'row' : 'column', gap: space(4), alignItems: 'flex-start' }}>
      <View style={{ width: wide ? 380 : '100%', gap: space(2) }}>{left}</View>
      <View style={{ flex: 1, width: wide ? undefined : '100%', gap: space(3) }}>{right}</View>
    </View>
  );
}

export function QueueItem({ title, sub, flag, selected, onPress, right }: {
  title: string; sub?: string; flag?: string | null; selected?: boolean; onPress: () => void; right?: string;
}) {
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ selected }} onPress={onPress} style={[styles.item, selected && styles.itemOn]}>
      <View style={{ flex: 1 }}>
        <Text style={styles.itemTitle}>{title}</Text>
        {sub && <Text style={styles.itemSub}>{sub}</Text>}
        {flag && <Text style={styles.flag}>⚑ {flag}</Text>}
      </View>
      {right && <Text style={styles.itemSub}>{right}</Text>}
    </Pressable>
  );
}

export const ageFromDob = (dob: string) => {
  const d = new Date(dob); const n = new Date();
  return n.getFullYear() - d.getFullYear() - (n < new Date(n.getFullYear(), d.getMonth(), d.getDate()) ? 1 : 0);
};

const styles = StyleSheet.create({
  sidebar: { width: 240, backgroundColor: colors.primary, padding: space(5), gap: 2 },
  brand: { fontSize: 20, fontWeight: '800', color: '#fff' },
  brandSub: { fontSize: 12, color: '#C9D3E0', textTransform: 'capitalize' },
  side: { flexDirection: 'row', alignItems: 'center', gap: space(2.5), minHeight: 42, paddingHorizontal: space(3), borderRadius: radius.md },
  sideOn: { backgroundColor: 'rgba(255,255,255,0.14)' },
  sideText: { fontSize: 14.5, color: '#C9D3E0', fontWeight: '600' },
  topbar: { backgroundColor: '#fff', padding: space(3), gap: space(3), borderBottomWidth: 1, borderBottomColor: colors.border },
  top: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 38, paddingHorizontal: 12, borderRadius: 19, borderWidth: 1, borderColor: colors.border },
  topOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  topText: { fontSize: 13.5, color: colors.primary, fontWeight: '600' },
  h1: { fontSize: 26, fontWeight: '800', color: colors.primary },
  sub: { fontSize: 14, color: colors.muted, marginTop: 3 },
  panel: { backgroundColor: '#fff', borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, padding: space(5), gap: space(3) },
  kv: { flexDirection: 'row', gap: space(3), paddingVertical: 3 },
  k: { width: 150, fontSize: 13.5, color: colors.muted },
  v: { flex: 1, fontSize: 14, color: colors.text },
  item: { flexDirection: 'row', gap: space(3), backgroundColor: '#fff', borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: space(3.5) },
  itemOn: { borderWidth: 2, borderColor: colors.primary },
  itemTitle: { fontSize: 15, fontWeight: '700', color: colors.text },
  itemSub: { fontSize: 13, color: colors.muted, marginTop: 2 },
  flag: { fontSize: 12.5, fontWeight: '700', color: '#8A3A12', marginTop: 6 },
});
