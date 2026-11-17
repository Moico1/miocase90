import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { ActivityIndicator, Button, Text, useTheme } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BrandLogo } from '@/components/BrandLogo';

type AuthStatusProps = {
  title: string;
  body?: string;
  loading?: boolean;
  actionLabel?: string;
  onAction?: () => void;
  children?: ReactNode;
};

export function AuthStatus({
  title,
  body,
  loading = false,
  actionLabel,
  onAction,
  children,
}: AuthStatusProps) {
  const theme = useTheme();

  return (
    <SafeAreaView
      style={[styles.safeArea, { backgroundColor: theme.colors.background }]}
    >
      <View style={styles.content}>
        <View style={styles.brand}>
          <BrandLogo variant="full" />
        </View>
        {loading ? <ActivityIndicator size="large" /> : null}
        <Text variant="headlineSmall" style={styles.title}>
          {title}
        </Text>
        {body ? (
          <Text variant="bodyLarge" style={{ color: theme.colors.onSurfaceVariant }}>
            {body}
          </Text>
        ) : null}
        {children}
        {actionLabel && onAction ? (
          <Button mode="contained" onPress={onAction}>
            {actionLabel}
          </Button>
        ) : null}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  content: {
    flex: 1,
    gap: 16,
    justifyContent: 'center',
    padding: 24,
  },
  brand: {
    alignSelf: 'center',
  },
  title: {
    textAlign: 'center',
  },
});
