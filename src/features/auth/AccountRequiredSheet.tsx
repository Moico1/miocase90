import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';

import { AppButton } from '@/design/AppButton';
import { radius, space } from '@/design/tokens';
import { useTokens } from '@/design/useTokens';

type AccountRequiredSheetProps = {
  visible: boolean;
  onDismiss: () => void;
  onRegister: () => void;
  onSignIn: () => void;
};

export function AccountRequiredSheet({
  visible,
  onDismiss,
  onRegister,
  onSignIn,
}: AccountRequiredSheetProps) {
  const c = useTokens();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onDismiss}
    >
      <View style={styles.overlay}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Cerrar"
          onPress={onDismiss}
          style={[styles.backdrop, { backgroundColor: c.ink, opacity: 0.35 }]}
        />
        <View style={[styles.sheet, { backgroundColor: c.surface }]}>
          <View style={[styles.handle, { backgroundColor: c.border }]} />
          <Text variant="headlineSmall">Crea tu cuenta gratis para continuar</Text>
          <Text variant="bodyMedium" style={{ color: c.inkMuted }}>
            Regístrate para contactar, guardar favoritos, reportar o calificar publicaciones.
          </Text>
          <AppButton label="Registrarme" onPress={onRegister} />
          <AppButton label="Ya tengo cuenta" variant="secondary" onPress={onSignIn} />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
  },
  sheet: {
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    gap: space.md,
    padding: space.xl,
    paddingBottom: space.xxl,
  },
  handle: {
    alignSelf: 'center',
    borderRadius: radius.pill,
    height: 4,
    marginBottom: space.xs,
    width: 40,
  },
});
