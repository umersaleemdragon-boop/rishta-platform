import { type ReactNode } from 'react';
import {
  ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
  type StyleProp, type TextInputProps, type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useI18n } from '../lib/i18n';
import { colors, radius, space } from '../lib/theme';

export function Screen({ children, scroll = true }: { children: ReactNode; scroll?: boolean }) {
  const inner = <View style={styles.container}>{children}</View>;
  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      {scroll ? <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">{inner}</ScrollView> : inner}
    </SafeAreaView>
  );
}

export function H1({ children }: { children: ReactNode }) {
  return <Text style={styles.h1} accessibilityRole="header">{children}</Text>;
}
export function H2({ children }: { children: ReactNode }) {
  return <Text style={styles.h2} accessibilityRole="header">{children}</Text>;
}
export function P({ children, muted, style }: { children: ReactNode; muted?: boolean; style?: object }) {
  const { isRTL } = useI18n();
  return <Text style={[styles.p, muted && styles.muted, isRTL && styles.rtl, style]}>{children}</Text>;
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

type ButtonProps = {
  title: string; onPress: () => void; variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  disabled?: boolean; loading?: boolean; testID?: string;
};
export function Button({ title, onPress, variant = 'primary', disabled, loading, testID }: ButtonProps) {
  const isDisabled = disabled || loading;
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!isDisabled, busy: !!loading }}
      onPress={isDisabled ? undefined : onPress}
      style={({ pressed }) => [
        styles.btn, styles[`btn_${variant}`], pressed && !isDisabled && styles.btnPressed, isDisabled && styles.btnDisabled,
      ]}
    >
      {loading
        ? <ActivityIndicator color={variant === 'primary' || variant === 'danger' ? '#fff' : colors.primary} />
        : <Text style={[styles.btnText, styles[`btnText_${variant}`]]}>{title}</Text>}
    </Pressable>
  );
}

type FieldProps = TextInputProps & { label: string; help?: string; error?: string | null; required?: boolean };
export function Field({ label, help, error, required, style, ...input }: FieldProps) {
  const { t, isRTL } = useI18n();
  // phone numbers, codes and amounts always read left-to-right, even in Urdu
  const isNumeric = input.keyboardType === 'phone-pad' || input.keyboardType === 'number-pad';
  return (
    <View style={styles.field}>
      <Text style={[styles.label, isRTL && styles.rtl]}>
        {label}{required ? ' *' : <Text style={styles.optional}>{`  (${t('optional')})`}</Text>}
      </Text>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor="#9AA0A6"
        style={[styles.input, isRTL && styles.rtl, isNumeric && styles.numeric, isNumeric && isRTL && { textAlign: 'right' },
          input.multiline && styles.inputMultiline, error ? styles.inputError : null, style]}
        {...input}
      />
      {error ? <Text style={styles.errorText}>{error}</Text> : help ? <Text style={[styles.help, isRTL && styles.rtl]}>{help}</Text> : null}
    </View>
  );
}

export type Option = { value: string; label: string };

export function ChipSelect({ label, options, value, onChange, required, help }: {
  label: string; options: Option[]; value: string | null | undefined; onChange: (v: string | null) => void;
  required?: boolean; help?: string;
}) {
  const { t, isRTL } = useI18n();
  return (
    <View style={styles.field} accessibilityRole="radiogroup" accessibilityLabel={label}>
      <Text style={[styles.label, isRTL && styles.rtl]}>
        {label}{required ? ' *' : <Text style={styles.optional}>{`  (${t('optional')})`}</Text>}
      </Text>
      <View style={styles.chips}>
        {options.map((o) => {
          const selected = value === o.value;
          return (
            <Pressable key={o.value} accessibilityRole="radio" accessibilityState={{ selected }}
              onPress={() => onChange(selected && !required ? null : o.value)}
              style={[styles.chip, selected && styles.chipSelected]}>
              <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{o.label}</Text>
            </Pressable>
          );
        })}
      </View>
      {help ? <Text style={[styles.help, isRTL && styles.rtl]}>{help}</Text> : null}
    </View>
  );
}

export function MultiChipSelect({ label, options, values, onChange, help }: {
  label: string; options: Option[]; values: string[]; onChange: (v: string[]) => void; help?: string;
}) {
  const { t, isRTL } = useI18n();
  return (
    <View style={styles.field} accessibilityLabel={label}>
      <Text style={[styles.label, isRTL && styles.rtl]}>
        {label}<Text style={styles.optional}>{`  (${values.length ? values.length : t('any')})`}</Text>
      </Text>
      <View style={styles.chips}>
        {options.map((o) => {
          const selected = values.includes(o.value);
          return (
            <Pressable key={o.value} accessibilityRole="checkbox" accessibilityState={{ checked: selected }}
              onPress={() => onChange(selected ? values.filter((v) => v !== o.value) : [...values, o.value])}
              style={[styles.chip, selected && styles.chipSelected]}>
              <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{o.label}</Text>
            </Pressable>
          );
        })}
      </View>
      {help ? <Text style={[styles.help, isRTL && styles.rtl]}>{help}</Text> : null}
    </View>
  );
}

export function YesNo({ label, value, onChange }: { label: string; value: boolean | null | undefined; onChange: (v: boolean) => void }) {
  const { t } = useI18n();
  return (
    <ChipSelect label={label} value={value == null ? null : value ? 'yes' : 'no'}
      options={[{ value: 'yes', label: t('yes') }, { value: 'no', label: t('no') }]}
      onChange={(v) => v && onChange(v === 'yes')} />
  );
}

export function Banner({ kind = 'info', children }: { kind?: 'info' | 'error' | 'success'; children: ReactNode }) {
  const { isRTL } = useI18n();
  return (
    <View accessibilityRole={kind === 'error' ? 'alert' : undefined}
      style={[styles.banner, kind === 'error' ? styles.bannerError : kind === 'success' ? styles.bannerSuccess : styles.bannerInfo]}>
      <Text style={[styles.bannerText, kind === 'error' && { color: colors.danger }, kind === 'success' && { color: colors.success }, isRTL && styles.rtl]}>
        {children}
      </Text>
    </View>
  );
}

export function Row({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.row, style]}>{children}</View>;
}

export function Loading() {
  return <View style={styles.center}><ActivityIndicator size="large" color={colors.primary} /></View>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  scroll: { flexGrow: 1 },
  container: { flex: 1, width: '100%', maxWidth: 640, alignSelf: 'center', paddingHorizontal: space(4), paddingVertical: space(5), gap: space(4) },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
  h1: { fontSize: 26, fontWeight: '700', color: colors.primary },
  h2: { fontSize: 19, fontWeight: '700', color: colors.text },
  p: { fontSize: 15, lineHeight: 22, color: colors.text },
  muted: { color: colors.muted },
  rtl: { textAlign: 'right', writingDirection: 'rtl' },
  numeric: { writingDirection: 'ltr' },
  card: { backgroundColor: colors.card, borderRadius: radius.lg, padding: space(4), borderWidth: 1, borderColor: colors.border, gap: space(3) },
  row: { flexDirection: 'row', gap: space(3), alignItems: 'flex-start', flexWrap: 'wrap' },
  btn: { minHeight: 48, borderRadius: radius.md, paddingHorizontal: space(5), alignItems: 'center', justifyContent: 'center' },
  btn_primary: { backgroundColor: colors.primary },
  btn_secondary: { backgroundColor: colors.card, borderWidth: 1.5, borderColor: colors.primary },
  btn_ghost: { backgroundColor: 'transparent' },
  btn_danger: { backgroundColor: colors.danger },
  btnPressed: { opacity: 0.85 },
  btnDisabled: { opacity: 0.5 },
  btnText: { fontSize: 16, fontWeight: '600' },
  btnText_primary: { color: colors.primaryText },
  btnText_secondary: { color: colors.primary },
  btnText_ghost: { color: colors.primary, textDecorationLine: 'underline' },
  btnText_danger: { color: '#fff' },
  field: { gap: space(1.5) },
  label: { fontSize: 14, fontWeight: '600', color: colors.text },
  optional: { fontWeight: '400', color: colors.muted, fontSize: 13 },
  input: { minHeight: 48, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.card, paddingHorizontal: space(3), fontSize: 16, color: colors.text },
  inputMultiline: { minHeight: 100, paddingVertical: space(3), textAlignVertical: 'top' },
  inputError: { borderColor: colors.danger },
  help: { fontSize: 13, color: colors.muted, lineHeight: 18 },
  errorText: { fontSize: 13, color: colors.danger },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space(2) },
  chip: { minHeight: 40, paddingHorizontal: space(3.5), borderRadius: radius.pill, backgroundColor: colors.chip, borderWidth: 1, borderColor: colors.chip, justifyContent: 'center' },
  chipSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: 14, color: colors.text },
  chipTextSelected: { color: '#fff', fontWeight: '600' },
  banner: { borderRadius: radius.md, padding: space(3) },
  bannerInfo: { backgroundColor: colors.infoBg },
  bannerError: { backgroundColor: colors.dangerBg },
  bannerSuccess: { backgroundColor: colors.successBg },
  bannerText: { fontSize: 14, lineHeight: 20, color: colors.info },
});
