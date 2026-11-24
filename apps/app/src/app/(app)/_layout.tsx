import { Stack } from 'expo-router';
import { SessionProvider } from '../../lib/session';
import { colors } from '../../lib/theme';

export default function AppLayout() {
  return (
    <SessionProvider>
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }} />
    </SessionProvider>
  );
}
