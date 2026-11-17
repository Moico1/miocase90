import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, HelperText, Text, TextInput, useTheme } from 'react-native-paper';
import { z } from 'zod';

import { getSupabaseClient } from '@/lib/supabase';

const verificationSchema = z.object({
  status: z.enum(['pending', 'code_issued', 'verified', 'expired', 'locked']),
  requested_number: z.string(),
  attempts_remaining: z.number().int(),
  expires_at: z.string(),
});

type VerificationState = z.infer<typeof verificationSchema> | null;

function parseVerification(data: unknown): VerificationState {
  const parsed = z.array(verificationSchema).safeParse(data);
  if (!parsed.success) {
    throw new Error('La respuesta de verificación de WhatsApp no tiene el formato esperado.');
  }
  return parsed.data[0] ?? null;
}

export function WhatsAppVerificationManager({
  userId,
  verifiedNumber,
}: {
  userId: string;
  verifiedNumber: string | null;
}) {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const [phone, setPhone] = useState(verifiedNumber ?? '');
  const [phoneEdited, setPhoneEdited] = useState(false);
  const [isChangingNumber, setIsChangingNumber] = useState(false);
  const [code, setCode] = useState('');
  const [isRequesting, setIsRequesting] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const verificationQuery = useQuery({
    queryKey: ['my-whatsapp-verification', userId],
    queryFn: async () => {
      const { data, error } = await getSupabaseClient().rpc('get_my_whatsapp_verification');
      if (error) throw error;
      return parseVerification(data);
    },
  });
  const verification = verificationQuery.data;
  const status = verification?.status ?? (verifiedNumber ? 'verified' : 'none');
  const displayedPhone = phoneEdited
    ? phone
    : verification?.requested_number ?? verifiedNumber ?? phone;
  const unchangedPendingRequest =
    status === 'pending' &&
    displayedPhone.trim().replace(/[\s()-]/g, '') === verification?.requested_number;

  async function refreshVerification() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['my-whatsapp-verification', userId] }),
      queryClient.invalidateQueries({ queryKey: ['own-profile', userId] }),
    ]);
  }

  async function requestVerification() {
    const normalizedPhone = displayedPhone.trim().replace(/[\s()-]/g, '');
    if (!/^\+[1-9][0-9]{7,14}$/.test(normalizedPhone)) {
      setErrorMessage('Escribe un número internacional válido, por ejemplo +591 7XXXXXXX.');
      return;
    }
    if (normalizedPhone === verifiedNumber) {
      setErrorMessage('Ese número ya está verificado en tu cuenta.');
      return;
    }

    setIsRequesting(true);
    setErrorMessage(null);
    setMessage(null);
    try {
      const { error } = await getSupabaseClient().rpc('request_whatsapp_verification', {
        requested_number: normalizedPhone,
      });
      if (error) throw error;
      setPhone(normalizedPhone);
      setPhoneEdited(true);
      setCode('');
      await refreshVerification();
      setMessage('Solicitud enviada. Espera a que administración genere tu código.');
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : 'No se pudo solicitar la verificación.'
      );
    } finally {
      setIsRequesting(false);
    }
  }

  async function verifyCode() {
    if (!/^[0-9]{4}$/.test(code)) {
      setErrorMessage('Ingresa el código de 4 dígitos.');
      return;
    }

    setIsVerifying(true);
    setErrorMessage(null);
    setMessage(null);
    try {
      const { data, error } = await getSupabaseClient().rpc('verify_whatsapp_code', {
        submitted_code: code,
      });
      if (error) throw error;
      const result = z.array(z.object({
        status: z.string(),
        attempts_remaining: z.number().int(),
        message: z.string(),
      })).safeParse(data);
      if (!result.success || !result.data[0]) {
        throw new Error('No se pudo confirmar la respuesta de verificación.');
      }

      const verificationResult = result.data[0];
      if (verificationResult.status === 'verified') {
        setCode('');
        setPhone('');
        setIsChangingNumber(false);
        setMessage(verificationResult.message);
        await refreshVerification();
      } else {
        setErrorMessage(verificationResult.message);
        setCode('');
        if (verificationResult.status === 'locked' || verificationResult.status === 'expired') {
          await refreshVerification();
        } else if (verificationResult.status === 'code_issued') {
          await queryClient.invalidateQueries({
            queryKey: ['my-whatsapp-verification', userId],
          });
        }
      }
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : 'No se pudo verificar el código.'
      );
    } finally {
      setIsVerifying(false);
    }
  }

  return (
    <View style={styles.container}>
      <Text variant="titleLarge">Verificación de WhatsApp</Text>
      {verifiedNumber ? (
        <Text variant="bodyMedium" style={{ color: theme.colors.primary }}>
          Número verificado: {verifiedNumber}
        </Text>
      ) : (
        <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
          Verifica que el número sea tuyo antes de mostrarlo en tus publicaciones.
        </Text>
      )}

      {verificationQuery.isPending ? (
        <Text variant="bodyMedium">Consultando el estado de verificación…</Text>
      ) : verificationQuery.isError ? (
        <View style={styles.state}>
          <Text variant="bodyMedium">No se pudo consultar la verificación.</Text>
          <Button onPress={() => void verificationQuery.refetch()}>Reintentar</Button>
        </View>
      ) : status === 'pending' ? (
        <Text variant="bodyMedium">
          Solicitud pendiente para {verification?.requested_number}. Espera a que administración te envíe un código.
        </Text>
      ) : status === 'code_issued' ? (
        <Text variant="bodyMedium">
          Código generado para {verification?.requested_number}. Ingresa los 4 dígitos que recibiste por WhatsApp.
        </Text>
      ) : status === 'expired' ? (
        <Text variant="bodyMedium">El código venció. Solicita otra verificación.</Text>
      ) : status === 'locked' ? (
        <Text variant="bodyMedium">Se agotaron los intentos. Solicita otra verificación.</Text>
      ) : null}
      {status === 'verified' && !isChangingNumber ? (
        <Button
          mode="outlined"
          onPress={() => {
            setPhone('');
            setPhoneEdited(true);
            setIsChangingNumber(true);
            setErrorMessage(null);
            setMessage(null);
          }}
        >
          Cambiar número
        </Button>
      ) : null}

      {status !== 'verified' || isChangingNumber ? (
        <>
          <TextInput
            mode="outlined"
            label="Número de WhatsApp"
            value={displayedPhone}
            onChangeText={(value) => {
              setPhone(value);
              setPhoneEdited(true);
            }}
            keyboardType="phone-pad"
            placeholder="+591 7XXXXXXX"
            maxLength={24}
            disabled={isRequesting || isVerifying}
          />
          <Button
            mode="outlined"
            onPress={() => void requestVerification()}
            loading={isRequesting}
            disabled={
              isRequesting ||
              isVerifying ||
              verificationQuery.isPending ||
              unchangedPendingRequest
            }
          >
            {unchangedPendingRequest
              ? 'Esperando código'
              : status === 'none' || isChangingNumber || status === 'pending'
                ? 'Solicitar verificación'
                : 'Solicitar otro código'}
          </Button>
        </>
      ) : null}

      {status === 'code_issued' ? (
        <View style={styles.codeForm}>
          <TextInput
            mode="outlined"
            label="Código de 4 dígitos"
            value={code}
            onChangeText={(value) => setCode(value.replace(/[^0-9]/g, '').slice(0, 4))}
            keyboardType="number-pad"
            maxLength={4}
            disabled={isVerifying}
          />
          <HelperText type="info" visible>
            Te quedan {verification?.attempts_remaining ?? 0} intentos. El código vence en 24 horas.
          </HelperText>
          <Button
            mode="contained"
            onPress={() => void verifyCode()}
            loading={isVerifying}
            disabled={isVerifying || code.length !== 4}
          >
            Verificar número
          </Button>
        </View>
      ) : null}

      {errorMessage ? (
        <Text accessibilityRole="alert" style={{ color: theme.colors.error }}>
          {errorMessage}
        </Text>
      ) : null}
      {message ? (
        <Text accessibilityRole="alert" style={{ color: theme.colors.primary }}>
          {message}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 12,
    paddingVertical: 16,
  },
  codeForm: {
    gap: 8,
  },
  state: {
    alignItems: 'center',
    gap: 8,
  },
});
