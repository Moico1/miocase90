import { useState } from 'react';
import { Redirect } from 'expo-router';
import { Button, HelperText } from 'react-native-paper';

import { AuthStatus } from '@/features/auth/AuthStatus';
import { useAuth } from '@/features/auth/AuthProvider';
import { useMembership } from '@/features/auth/useMembership';
import { getErrorMessage } from '@/features/auth/errorMessage';
import { isSupabaseConfigured } from '@/lib/supabase';

export default function IndexScreen() {
  const {
    session,
    isLoading: isAuthLoading,
    error: authError,
    refreshSession,
    signOut,
  } = useAuth();
  const [signOutError, setSignOutError] = useState<string | null>(null);
  const membership = useMembership(session?.user.id);
  const handleSignOut = async () => {
    setSignOutError(null);
    try {
      await signOut();
    } catch (error) {
      setSignOutError(getErrorMessage(error));
    }
  };

  if (!isSupabaseConfigured) {
    return (
      <AuthStatus
        title="Configura Supabase"
        body="Completa la URL y la anon key en el archivo .env, guarda los cambios y reinicia Expo con npx expo start -c."
      />
    );
  }

  if (isAuthLoading) {
    return <AuthStatus title="Cargando MioCASE" loading />;
  }

  if (authError) {
    return (
      <AuthStatus
        title="No se pudo restaurar tu sesión"
        body={authError}
        actionLabel="Reintentar"
        onAction={() => void refreshSession()}
      >
        {signOutError ? <HelperText type="error">{signOutError}</HelperText> : null}
        <Button mode="outlined" onPress={() => void handleSignOut()}>
          Cerrar sesión
        </Button>
      </AuthStatus>
    );
  }

  if (!session) {
    return <Redirect href="/sign-in" />;
  }

  if (membership.isLoading) {
    return <AuthStatus title="Consultando tu membresía" loading />;
  }

  if (membership.error) {
    return (
      <AuthStatus
        title="No se pudo consultar tu membresía"
        body={getErrorMessage(membership.error)}
      >
        <HelperText type="info">
          Confirma que la migración de Supabase ya se haya aplicado y vuelve a intentar.
        </HelperText>
        <Button mode="contained" onPress={() => void membership.refetch()}>
          Reintentar
        </Button>
        {signOutError ? <HelperText type="error">{signOutError}</HelperText> : null}
        <Button mode="outlined" onPress={() => void handleSignOut()}>
          Cerrar sesión
        </Button>
      </AuthStatus>
    );
  }

  if (membership.data === 'verified') {
    return <Redirect href="/(tabs)" />;
  }

  return <Redirect href="/pending" />;
}
