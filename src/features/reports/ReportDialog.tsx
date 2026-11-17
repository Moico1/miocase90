import { useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Dialog, HelperText, Portal, Text } from 'react-native-paper';
import { StyleSheet, View } from 'react-native';
import { z } from 'zod';

import { AppButton } from '@/design/AppButton';
import { TextField } from '@/design/TextField';
import { radius, space } from '@/design/tokens';
import { useTokens } from '@/design/useTokens';

import { getSupabaseClient } from '@/lib/supabase';

const reportSchema = z.object({
  reason: z
    .string()
    .trim()
    .min(1, 'Escribe el motivo del reporte.')
    .max(300, 'El motivo no puede superar los 300 caracteres.'),
});

type ReportFormInput = z.input<typeof reportSchema>;
type ReportFormValues = z.output<typeof reportSchema>;

type ReportDialogProps = {
  listingId: string;
  reporterId: string;
  visible: boolean;
  onDismiss: () => void;
  onReported: () => void;
};

export function ReportDialog({
  listingId,
  reporterId,
  visible,
  onDismiss,
  onReported,
}: ReportDialogProps) {
  const c = useTokens();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const {
    control,
    formState: { errors },
    handleSubmit,
    reset,
  } = useForm<ReportFormInput, undefined, ReportFormValues>({
    resolver: zodResolver(reportSchema),
    defaultValues: { reason: '' },
  });
  const reasonLength = useWatch({ control, name: 'reason', defaultValue: '' }).length;

  function dismiss() {
    setErrorMessage(null);
    reset({ reason: '' });
    onDismiss();
  }

  async function submit(values: ReportFormValues) {
    setErrorMessage(null);
    setIsSubmitting(true);

    try {
      const { error } = await getSupabaseClient().from('reports').insert({
        listing_id: listingId,
        reporter_id: reporterId,
        reason: values.reason,
      });

      if (error?.code === '23505') {
        throw new Error('Ya reportaste esta publicación.');
      }
      if (error) {
        throw new Error(
          'No se pudo enviar el reporte. Confirma tu conexión e inténtalo otra vez.'
        );
      }

      onReported();
      dismiss();
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : 'Ocurrió un error inesperado al reportar.'
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Portal>
      <Dialog
        visible={visible}
        onDismiss={dismiss}
        style={[styles.dialog, { backgroundColor: c.surface }]}
      >
        <Dialog.Title>Reportar publicación</Dialog.Title>
        <Dialog.Content>
          <Text variant="bodyMedium">
            Cuéntanos brevemente qué problema encontraste.
          </Text>
          <Controller
            control={control}
            name="reason"
            render={({ field: { onChange, onBlur, value } }) => (
              <TextField
                label="Motivo"
                multiline
                maxLength={300}
                style={styles.input}
                value={value}
                onChangeText={onChange}
                onBlur={onBlur}
                error={errors.reason?.message}
                disabled={isSubmitting}
              />
            )}
          />
          <Text variant="bodySmall">{`${300 - reasonLength} caracteres disponibles`}</Text>
          {errorMessage ? (
            <HelperText type="error" visible>
              {errorMessage}
            </HelperText>
          ) : null}
        </Dialog.Content>
        <View style={styles.actions}>
          <AppButton
            label="Cancelar"
            variant="secondary"
            disabled={isSubmitting}
            onPress={dismiss}
          />
          <AppButton
            label="Enviar reporte"
            onPress={() => {
              void handleSubmit(submit)();
            }}
            loading={isSubmitting}
            disabled={isSubmitting}
          />
        </View>
      </Dialog>
    </Portal>
  );
}

const styles = StyleSheet.create({
  dialog: {
    borderRadius: radius.xl,
    paddingBottom: space.sm,
  },
  input: {
    minHeight: 100,
    textAlignVertical: 'top',
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.sm,
    justifyContent: 'flex-end',
    paddingHorizontal: space.lg,
    paddingBottom: space.md,
  },
});
