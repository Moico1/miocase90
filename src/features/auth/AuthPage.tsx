import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text, useTheme } from 'react-native-paper';

import { BrandLogo } from '@/components/BrandLogo';

type AuthPageProps = {
  title: string;
  subtitle: string;
  children: ReactNode;
};

export function AuthPage({ title, subtitle, children }: AuthPageProps) {
  const theme = useTheme();

  return (
    <SafeAreaView
      edges={['top', 'left', 'right']}
      style={[styles.safeArea, { backgroundColor: theme.colors.background }]}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.header}>
            <BrandLogo variant="full" />
            <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
              Bueno, Bonito, Barato · Yacuiba
            </Text>
          </View>
          <View style={styles.form}>
            <Text variant="headlineSmall">{title}</Text>
            <Text
              variant="bodyMedium"
              style={[styles.subtitle, { color: theme.colors.onSurfaceVariant }]}
            >
              {subtitle}
            </Text>
            {children}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 32,
  },
  header: {
    alignItems: 'center',
    gap: 8,
    marginBottom: 28,
  },
  form: {
    alignSelf: 'center',
    gap: 14,
    maxWidth: 480,
    width: '100%',
  },
  subtitle: {
    marginBottom: 8,
  },
});
