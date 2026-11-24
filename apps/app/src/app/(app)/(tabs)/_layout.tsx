import { Tabs } from 'expo-router';
import { Icon, type IconName } from '../../../components/kit';
import { useI18n, type TKey } from '../../../lib/i18n';
import { colors } from '../../../lib/theme';

const TABS: { name: string; label: TKey; icon: IconName; iconActive: IconName }[] = [
  { name: 'index', label: 'tabMatches', icon: 'sparkles-outline', iconActive: 'sparkles' },
  { name: 'interests', label: 'tabInterests', icon: 'heart-outline', iconActive: 'heart' },
  { name: 'chats', label: 'tabChats', icon: 'chatbubbles-outline', iconActive: 'chatbubbles' },
  { name: 'family', label: 'tabFamily', icon: 'people-outline', iconActive: 'people' },
  { name: 'me', label: 'tabMe', icon: 'person-circle-outline', iconActive: 'person-circle' },
];

export default function TabsLayout() {
  const { t } = useI18n();
  return (
    <Tabs screenOptions={{
      headerShown: false,
      tabBarActiveTintColor: colors.primary,
      tabBarInactiveTintColor: colors.muted,
      tabBarStyle: { backgroundColor: '#FFFFFF', borderTopColor: colors.border, height: 64, paddingBottom: 8, paddingTop: 6 },
      tabBarLabelStyle: { fontSize: 12, fontWeight: '600' },
      sceneStyle: { backgroundColor: colors.bg },
    }}>
      {TABS.map((tab) => (
        <Tabs.Screen key={tab.name} name={tab.name} options={{
          title: t(tab.label),
          tabBarIcon: ({ color, focused, size }) => <Icon name={focused ? tab.iconActive : tab.icon} color={String(color)} size={size} />,
        }} />
      ))}
    </Tabs>
  );
}
