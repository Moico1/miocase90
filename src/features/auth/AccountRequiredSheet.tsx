import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { Button, Text, useTheme } from 'react-native-paper';

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
  const theme = useTheme();

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
          style={styles.backdrop}
        />
        <View style={[styles.sheet, { backgroundColor: theme.colors.surface }]}>
          <View style={[styles.handle, { backgroundColor: theme.colors.outlineVariant }]} />
          <Text variant="headlineSmall">Crea tu cuenta gratis para continuar</Text>
          <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
            Regístrate para contactar, guardar favoritos, reportar o calificar publicaciones.
          </Text>
          <Button mode="contained" onPress={onRegister}>
            Registrarme
          </Button>
          <Button mode="outlined" onPress={onSignIn}>
            Ya tengo cuenta
          </Button>
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
    backgroundColor: '#00000066',
  },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    gap: 14,
    padding: 24,
    paddingBottom: 36,
  },
  handle: {
    alignSelf: 'center',
    borderRadius: 2,
    height: 4,
    marginBottom: 4,
    width: 40,
  },
});
