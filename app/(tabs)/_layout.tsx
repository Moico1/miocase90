import { Pressable, StyleSheet, View } from 'react-native';
import { SymbolView } from 'expo-symbols';
import { Tabs, useRouter } from 'expo-router';
import { Text, useTheme } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { VerifiedMemberGate } from '@/features/auth/VerifiedMemberGate';

export default function TabLayout() {
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const tabs = (
    <Tabs
      tabBar={(props) => {
        function renderTab(routeName: 'index' | 'two') {
          const route = props.state.routes.find((item) => item.name === routeName);
          if (!route) return null;

          const focused = props.state.routes[props.state.index]?.key === route.key;
          const label = routeName === 'index' ? 'Inicio' : 'Perfil';
          const iconName =
            routeName === 'index'
              ? ({ ios: 'house.fill', android: 'home', web: 'home' } as const)
              : ({ ios: 'person.crop.circle.fill', android: 'person', web: 'person' } as const);

          return (
            <Pressable
              key={route.key}
              accessibilityRole="button"
              accessibilityState={focused ? { selected: true } : {}}
              accessibilityLabel={label}
              onPress={() => {
                const event = props.emitter.emit({
                  type: 'tabPress',
                  target: route.key,
                  canPreventDefault: true,
                });
                if (!focused && !event.defaultPrevented) {
                  props.navigateToTab(route.key);
                }
              }}
              style={styles.tabButton}
            >
              <SymbolView
                name={iconName}
                tintColor={focused ? theme.colors.primary : theme.colors.onSurfaceVariant}
                size={24}
              />
              <Text
                variant="labelSmall"
                style={{
                  color: focused ? theme.colors.primary : theme.colors.onSurfaceVariant,
                  fontWeight: focused ? '700' : '500',
                }}
              >
                {label}
              </Text>
            </Pressable>
          );
        }

        return (
          <View
            style={[
              styles.tabBar,
              {
                backgroundColor: theme.colors.surface,
                borderTopColor: theme.colors.outlineVariant,
                paddingBottom: Math.max(insets.bottom, 8),
                height: 58 + Math.max(insets.bottom, 8),
              },
            ]}
          >
            {renderTab('index')}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Publicar producto"
              onPress={() => router.push('/publish')}
              style={styles.tabButton}
            >
              <View style={[styles.publishIcon, { backgroundColor: theme.colors.primary }]}>
                <SymbolView
                  name={{ ios: 'plus', android: 'add', web: 'add' }}
                  tintColor={theme.colors.onPrimary}
                  size={24}
                />
              </View>
              <Text variant="labelSmall" style={{ color: theme.colors.primary, fontWeight: '700' }}>
                Publicar
              </Text>
            </Pressable>
            {renderTab('two')}
          </View>
        );
      }}
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.colors.primary,
        tabBarInactiveTintColor: theme.colors.onSurfaceVariant,
        tabBarStyle: {
          backgroundColor: theme.colors.surface,
          borderTopColor: theme.colors.outlineVariant,
          height: 58 + Math.max(insets.bottom, 8),
          paddingBottom: Math.max(insets.bottom, 8),
          paddingTop: 6,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Inicio',
          tabBarLabel: 'Inicio',
        }}
      />
      <Tabs.Screen
        name="two"
        options={{
          title: 'Perfil',
          tabBarLabel: 'Perfil',
        }}
      />
    </Tabs>
  );

  return <VerifiedMemberGate>{tabs}</VerifiedMemberGate>;
}

const styles = StyleSheet.create({
  tabBar: {
    alignItems: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingHorizontal: 12,
    paddingTop: 6,
  },
  tabButton: {
    alignItems: 'center',
    flex: 1,
    gap: 3,
    justifyContent: 'center',
    minHeight: 52,
  },
  publishIcon: {
    alignItems: 'center',
    borderRadius: 18,
    height: 34,
    justifyContent: 'center',
    width: 52,
  },
});
