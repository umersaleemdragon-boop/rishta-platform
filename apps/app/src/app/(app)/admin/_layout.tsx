import { router, Slot } from 'expo-router';
import { ActivityIndicator, Text, View } from 'react-native';
import { AdminShell } from '../../../components/admin';
import { Button } from '../../../components/ui';
import { useSession } from '../../../lib/session';
import { colors } from '../../../lib/theme';

export default function AdminLayout() {
  const { loading, staffRole } = useSession();
  if (loading) return <ActivityIndicator color={colors.primary} style={{ marginTop: 80 }} />;
  if (!staffRole) {
    // Members never see the panel; the database refuses them anyway.
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, padding: 24, backgroundColor: colors.bg }}>
        <Text style={{ fontSize: 18, fontWeight: '700', color: colors.text }}>Staff only</Text>
        <Button title="Back to app" onPress={() => router.replace('/me')} />
      </View>
    );
  }
  return <AdminShell role={staffRole}><Slot /></AdminShell>;
}
