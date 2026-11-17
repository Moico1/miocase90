import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text } from 'react-native-paper';

import { BrandLogo } from '@/components/BrandLogo';
import { ScreenHeader } from '@/design/ScreenHeader';
import { font, palette, space } from '@/design/tokens';
import { useTokens } from '@/design/useTokens';

type AuthPageProps = {
  title: string;
  subtitle: string;
  children: ReactNode;
};

export function AuthPage({ title, subtitle, children }: AuthPageProps) {
  const c = useTokens();

  return (
    <SafeAreaView
      edges={['top', 'left', 'right']}
      style={[styles.safeArea, { backgroundColor: c.background }]}
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
            <View style={styles.brandStripe}>
              <View style={[styles.stripeSegment, { backgroundColor: palette.red }]} />
              <View style={[styles.stripeSegment, { backgroundColor: palette.yellow }]} />
              <View style={[styles.stripeSegment, { backgroundColor: palette.green }]} />
            </View>
            <Text style={[styles.tagline, { color: c.inkMuted }]}>
              Bueno, bonito, barato · Yacuiba
            </Text>
          </View>
          <View style={styles.form}>
            <ScreenHeader title={title} />
            <Text
              variant="bodyMedium"
              style={[styles.subtitle, { color: c.inkMuted }]}
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
    gap: space.sm,
    marginBottom: space.xl,
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
  tagline: {
    fontFamily: font.regular,
    fontSize: 12,
    lineHeight: 16,
  },
  form: {
    alignSelf: 'center',
    gap: space.md,
    maxWidth: 480,
    width: '100%',
  },
  subtitle: {
    marginBottom: 8,
    fontFamily: font.regular,
    fontSize: 15,
    lineHeight: 22,
  },
});
