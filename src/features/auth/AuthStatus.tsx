import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { ActivityIndicator, Text } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BrandLogo } from '@/components/BrandLogo';
import { AppButton } from '@/design/AppButton';
import { ScreenHeader } from '@/design/ScreenHeader';
import { palette, space } from '@/design/tokens';
import { useTokens } from '@/design/useTokens';

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
  const c = useTokens();

  return (
    <SafeAreaView
      style={[styles.safeArea, { backgroundColor: c.background }]}
    >
      <View style={styles.content}>
        <View style={styles.brand}>
          <BrandLogo variant="full" />
          <View style={styles.brandStripe}>
            <View style={[styles.stripeSegment, { backgroundColor: palette.red }]} />
            <View style={[styles.stripeSegment, { backgroundColor: palette.yellow }]} />
            <View style={[styles.stripeSegment, { backgroundColor: palette.green }]} />
          </View>
        </View>
        {loading ? <ActivityIndicator size="large" /> : null}
        <ScreenHeader title={title} />
        {body ? (
          <Text variant="bodyLarge" style={{ color: c.inkMuted }}>
            {body}
          </Text>
        ) : null}
        {children}
        {actionLabel && onAction ? (
          <AppButton label={actionLabel} onPress={onAction} />
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
    gap: space.lg,
    justifyContent: 'center',
    padding: 24,
  },
  brand: {
    alignSelf: 'center',
    alignItems: 'center',
    gap: space.sm,
  },
  brandStripe: {
    borderRadius: 999,
    flexDirection: 'row',
    height: 3,
    overflow: 'hidden',
    width: 120,
  },
  stripeSegment: {
    flex: 1,
  },
});
