import { Pressable, StyleSheet, View } from 'react-native';
import { SymbolView } from 'expo-symbols';
import { Tabs, useRouter } from 'expo-router';
import { Text } from 'react-native-paper';

import { shadow } from '@/design/tokens';
import { useTokens } from '@/design/useTokens';

export default function TabLayout() {
  const c = useTokens();
  const router = useRouter();

  const tabs = (
    <Tabs
      tabBar={(props) => {
        const bottomInset = props.insets.bottom;

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
                tintColor={focused ? c.primary : c.inkMuted}
                size={24}
              />
              <Text
                variant="labelSmall"
                style={{
                  color: focused ? c.primary : c.inkMuted,
                  fontWeight: focused ? '700' : '500',
                }}
              >
                {label}
              </Text>
            </Pressable>
          );
        }

        return (
          <View style={[styles.tabBarShell, { backgroundColor: c.background }]}>
          <View
            style={[
              styles.tabBar,
              {
                backgroundColor: c.surface,
                borderTopColor: c.border,
                height: 64 + bottomInset,
                paddingBottom: bottomInset,
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
              <View style={[styles.publishIcon, shadow.floating, { backgroundColor: c.primary }]}>
                <SymbolView
                  name={{ ios: 'plus', android: 'add', web: 'add' }}
                  tintColor={c.onPrimary}
                  size={24}
                />
              </View>
              <Text variant="labelSmall" style={{ color: c.primary, fontWeight: '700' }}>
                Publicar
              </Text>
            </Pressable>
            {renderTab('two')}
          </View>
          </View>
        );
      }}
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: c.background },
        tabBarActiveTintColor: c.primary,
        tabBarInactiveTintColor: c.inkMuted,
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

  return tabs;
}

const styles = StyleSheet.create({
  tabBarShell: {
    alignItems: 'center',
    width: '100%',
  },
  tabBar: {
    alignItems: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    justifyContent: 'space-around',
    maxWidth: 1120,
    paddingHorizontal: 12,
    paddingTop: 6,
    width: '100%',
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
    borderRadius: 999,
    height: 58,
    justifyContent: 'center',
    marginTop: -18,
    width: 58,
  },
});
