import { useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button, Dialog, HelperText, Portal, Text, TextInput } from 'react-native-paper';
import { z } from 'zod';

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
      <Dialog visible={visible} onDismiss={dismiss}>
        <Dialog.Title>Reportar publicación</Dialog.Title>
        <Dialog.Content>
          <Text variant="bodyMedium">
            Cuéntanos brevemente qué problema encontraste.
          </Text>
          <Controller
            control={control}
            name="reason"
            render={({ field: { onChange, onBlur, value } }) => (
              <TextInput
                label="Motivo"
                mode="outlined"
                multiline
                maxLength={300}
                value={value}
                onChangeText={onChange}
                onBlur={onBlur}
                error={Boolean(errors.reason)}
                disabled={isSubmitting}
              />
            )}
          />
          <HelperText type="error" visible={Boolean(errors.reason)}>
            {errors.reason?.message}
          </HelperText>
          <Text variant="bodySmall">{`${300 - reasonLength} caracteres disponibles`}</Text>
          {errorMessage ? (
            <HelperText type="error" visible>
              {errorMessage}
            </HelperText>
          ) : null}
        </Dialog.Content>
        <Dialog.Actions>
          <Button onPress={dismiss} disabled={isSubmitting}>
            Cancelar
          </Button>
          <Button
            onPress={() => {
              void handleSubmit(submit)();
            }}
            loading={isSubmitting}
            disabled={isSubmitting}
          >
            Enviar reporte
          </Button>
        </Dialog.Actions>
      </Dialog>
    </Portal>
  );
}
