import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Redirect, router } from 'expo-router';
import { zodResolver } from '@hookform/resolvers/zod';
import { HelperText } from 'react-native-paper';

import { AppButton } from '@/design/AppButton';
import { TextField } from '@/design/TextField';
import { AuthPage } from '@/features/auth/AuthPage';
import { AuthStatus } from '@/features/auth/AuthStatus';
import { useAuth } from '@/features/auth/AuthProvider';
import { getErrorMessage } from '@/features/auth/errorMessage';
import {
  inviteCodeSchema,
  type InviteCodeValues,
} from '@/features/auth/authSchemas';
import { useMembership } from '@/features/auth/useMembership';
import { getSupabaseClient } from '@/lib/supabase';

export default function PendingScreen() {
  const { session, signOut: authSignOut } = useAuth();
  const membership = useMembership(session?.user.id);
  const [actionError, setActionError] = useState<string | null>(null);
  const [signOutError, setSignOutError] = useState<string | null>(null);
  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset,
  } = useForm<InviteCodeValues>({
    resolver: zodResolver(inviteCodeSchema),
    defaultValues: { code: '' },
  });

  if (!session) return <Redirect href="/" />;

  if (membership.isLoading) {
    return <AuthStatus title="Consultando tu membresía" loading />;
  }

  if (membership.error) {
    return (
      <AuthStatus
        title="No se pudo consultar tu membresía"
        body={getErrorMessage(membership.error)}
      >
        <AppButton label="Reintentar" onPress={() => void membership.refetch()} />
        {signOutError ? <HelperText type="error">{signOutError}</HelperText> : null}
        <AppButton label="Cerrar sesión" variant="secondary" onPress={() => void handleSignOut()} />
      </AuthStatus>
    );
  }

  if (membership.data === 'verified' || membership.data === 'none') {
    return <Redirect href="/" />;
  }

  const isRejected = membership.data === 'rejected';

  const redeemInvite = async ({ code }: InviteCodeValues) => {
    setActionError(null);
    try {
      const { error } = await getSupabaseClient().rpc('redeem_membership_invite', {
        invite_code: code.trim(),
      });
      if (error) throw error;

      const result = await membership.refetch();
      if (result.error) throw result.error;
      if (result.data !== 'verified') {
        throw new Error('El código se procesó, pero la solicitud aún no está aprobada.');
      }

      reset();
      router.replace('/');
    } catch (error) {
      setActionError(getErrorMessage(error));
    }
  };

  const handleSignOut = async () => {
    setSignOutError(null);
    try {
      await authSignOut();
      router.replace('/');
    } catch (error) {
      setSignOutError(getErrorMessage(error));
    }
  };

  if (isRejected) {
    return (
      <AuthStatus
        title="No se pudo verificar tu cuenta"
        body="Contacta a un administrador de MioCASE por un canal oficial de la comunidad para solicitar una revisión."
      >
        <AppButton
          label="Actualizar estado"
          variant="secondary"
          loading={membership.isFetching}
          disabled={membership.isFetching}
          onPress={() => void membership.refetch()}
        />
        {signOutError ? <HelperText type="error">{signOutError}</HelperText> : null}
        <AppButton label="Cerrar sesión" variant="secondary" onPress={() => void handleSignOut()} />
      </AuthStatus>
    );
  }

  return (
    <AuthPage
      title="Tu cuenta está pendiente de aprobación"
      subtitle="Un administrador revisará tu solicitud. Si ya recibiste un código individual de invitación, puedes ingresarlo aquí."
    >
      <Controller
        control={control}
        name="code"
        render={({ field: { onChange, onBlur, value } }) => (
          <TextField
            label="Código de invitación"
            autoCapitalize="none"
            autoCorrect={false}
            maxLength={32}
            error={errors.code?.message}
            onBlur={onBlur}
            onChangeText={onChange}
            value={value}
          />
        )}
      />
      {actionError ? <HelperText type="error">{actionError}</HelperText> : null}
      <AppButton
        label="Verificar con código"
        loading={isSubmitting}
        disabled={isSubmitting}
        onPress={() => void handleSubmit(redeemInvite)()}
      />
      <AppButton
        label="Actualizar estado"
        variant="secondary"
        loading={membership.isFetching}
        disabled={membership.isFetching}
        onPress={() => void membership.refetch()}
      />
      {signOutError ? <HelperText type="error">{signOutError}</HelperText> : null}
      <AppButton label="Cerrar sesión" variant="secondary" onPress={() => void handleSignOut()} />
    </AuthPage>
  );
}
