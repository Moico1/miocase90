import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { Stack } from 'expo-router';
import { PaperProvider } from 'react-native-paper';
import { Platform, useColorScheme } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import 'react-native-reanimated';

import { AuthProvider } from '@/features/auth/AuthProvider';
import { miocaseDarkTheme, miocaseLightTheme } from '@/theme';

if (Platform.OS !== 'web') {
  void SplashScreen.preventAutoHideAsync();
}

export { ErrorBoundary } from 'expo-router';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
    },
  },
});

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    PlayfairDisplay_900Black_Italic: require('@expo-google-fonts/playfair-display/900Black_Italic/PlayfairDisplay_900Black_Italic.ttf'),
  });
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? miocaseDarkTheme : miocaseLightTheme;

  useEffect(() => {
    if ((fontsLoaded || fontError) && Platform.OS !== 'web') {
      void SplashScreen.hideAsync();
    }
  }, [fontError, fontsLoaded]);

  if (fontError) throw fontError;
  if (!fontsLoaded) return null;

  return (
    <SafeAreaProvider>
      <PaperProvider theme={theme}>
        <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <RootNavigator theme={theme} />
          </AuthProvider>
        </QueryClientProvider>
      </PaperProvider>
    </SafeAreaProvider>
  );
}

function RootNavigator({ theme }: { theme: typeof miocaseLightTheme }) {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: theme.colors.background },
      }}
    >
      <Stack.Screen name="index" />
      <Stack.Screen name="sign-in" />
      <Stack.Screen name="sign-up" />
      <Stack.Screen name="check-email" />
      <Stack.Screen name="pending" />
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="publish" />
      <Stack.Screen name="listing/[id]" />
    </Stack>
  );
}
