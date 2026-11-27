import Ionicons from '@expo/vector-icons/Ionicons';
import { type ComponentProps, type ReactNode } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useI18n, type TKey } from '../lib/i18n';
import { colors, radius, space } from '../lib/theme';

export type IconName = ComponentProps<typeof Ionicons>['name'];
export const Icon = ({ name, size = 20, color = colors.primary }: { name: IconName; size?: number; color?: string }) =>
  <Ionicons name={name} size={size} color={color} />;

const AVATAR_TINTS = [['#E8EEF5', colors.primary], ['#F3EDE0', '#7A5C0E'], ['#E8F3EA', colors.success]] as const;

// Monogram instead of a photo: photos are private by default.
export function Avatar({ name, size = 56, locked }: { name: string; size?: number; locked?: boolean }) {
  const letter = (name.trim()[0] ?? '?').toUpperCase();
  const [bg, fg] = AVATAR_TINTS[letter.charCodeAt(0) % AVATAR_TINTS.length];
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: fg, fontSize: size * 0.4, fontWeight: '800' }}>{letter}</Text>
      {locked && (
        <View style={[styles.lock, { right: -2, bottom: -2 }]} accessibilityLabel="Photos are private">
          <Icon name="lock-closed" size={11} color={colors.muted} />
        </View>
      )}
    </View>
  );
}

type Tone = 'navy' | 'gold' | 'green' | 'grey' | 'red';
const TONES: Record<Tone, { bg: string; fg: string }> = {
  navy: { bg: '#E8EEF5', fg: colors.primary }, gold: { bg: '#FBF3DC', fg: '#7A5C0E' },
  green: { bg: colors.successBg, fg: colors.success }, grey: { bg: '#EFEBE3', fg: '#3C4148' }, red: { bg: colors.dangerBg, fg: colors.danger },
};
export function Tag({ label, tone = 'navy', icon }: { label: string; tone?: Tone; icon?: IconName }) {
  const c = TONES[tone];
  return (
    <View style={[styles.tag, { backgroundColor: c.bg }]}>
      {icon && <Icon name={icon} size={12} color={c.fg} />}
      <Text style={[styles.tagText, { color: c.fg }]}>{label}</Text>
    </View>
  );
}

// Verification badges, saying how the person was checked.
export function VerificationTags({ level, managedBy, bureauClient }: { level: string; managedBy?: string; bureauClient?: boolean }) {
  const { t, enumLabel } = useI18n();
  const order = ['none', 'phone', 'cnic', 'bureau'];
  const n = order.indexOf(level);
  return (
    <View style={styles.row}>
      {n >= 2 && <Tag label={t('verified_cnic')} icon="card-outline" />}
      {n >= 3 && <Tag label={t('verified_bureau')} tone="gold" icon="shield-checkmark-outline" />}
      {n === 1 && <Tag label={t('verified_phone')} icon="call-outline" />}
      {bureauClient && <Tag label="Zaujyn" tone="gold" icon="ribbon-outline" />}
      {managedBy && managedBy !== 'self' && managedBy !== 'bureau' && <Tag label={enumLabel('managed_by', managedBy)} tone="green" icon="people-outline" />}
    </View>
  );
}

export function EmptyState({ icon, text, action }: { icon: IconName; text: string; action?: ReactNode }) {
  return (
    <View style={styles.empty}>
      <Icon name={icon} size={36} color={colors.muted} />
      <Text style={styles.emptyText}>{text}</Text>
      {action}
    </View>
  );
}

export function Segmented<T extends string>({ value, options, onChange }: {
  value: T; options: { value: T; label: string }[]; onChange: (v: T) => void;
}) {
  return (
    <View style={styles.seg} accessibilityRole="tablist">
      {options.map((o) => (
        <Pressable key={o.value} accessibilityRole="tab" accessibilityState={{ selected: o.value === value }}
          onPress={() => onChange(o.value)} style={[styles.segItem, o.value === value && styles.segActive]}>
          <Text style={[styles.segText, o.value === value && styles.segTextActive]}>{o.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

// Bottom sheet style modal (works on web and native).
export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close" />
      <View style={styles.sheet}>
        <View style={styles.sheetHead}>
          <Text style={styles.sheetTitle}>{title}</Text>
          <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button" accessibilityLabel="Close">
            <Icon name="close" size={24} color={colors.text} />
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={{ gap: space(4), paddingBottom: space(6) }} keyboardShouldPersistTaps="handled">{children}</ScrollView>
      </View>
    </Modal>
  );
}

export const tk = (k: string) => k as TKey;

const styles = StyleSheet.create({
  lock: { position: 'absolute', width: 22, height: 22, borderRadius: 11, backgroundColor: '#fff', borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  tag: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  tagText: { fontSize: 12, fontWeight: '600' },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  empty: { alignItems: 'center', gap: space(3), paddingVertical: space(10), paddingHorizontal: space(4) },
  emptyText: { fontSize: 15, color: colors.muted, textAlign: 'center', lineHeight: 22 },
  seg: { flexDirection: 'row', backgroundColor: '#ECE8DF', borderRadius: radius.md, padding: 4 },
  segItem: { flex: 1, minHeight: 40, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  segActive: { backgroundColor: '#fff' },
  segText: { fontSize: 14, fontWeight: '600', color: colors.muted },
  segTextActive: { color: colors.primary, fontWeight: '700' },
  backdrop: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.35)' },
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, maxHeight: '88%', alignSelf: 'center', width: '100%', maxWidth: 640,
    backgroundColor: colors.bg, borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: space(5), gap: space(3) },
  sheetHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sheetTitle: { fontSize: 19, fontWeight: '800', color: colors.primary },
});
