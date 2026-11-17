import type { PropsWithChildren } from 'react';
import { useRouter } from 'expo-router';
import { Button, Text } from 'react-native-paper';

import { AuthStatus } from '@/features/auth/AuthStatus';
import { useAuth } from '@/features/auth/AuthProvider';
import { getErrorMessage } from '@/features/auth/errorMessage';
import { useMembership } from '@/features/auth/useMembership';

export function VerifiedMemberGate({ children }: PropsWithChildren) {
  const router = useRouter();
  const { session, isLoading } = useAuth();
  const membership = useMembership(session?.user.id);

  if (isLoading || (session && membership.isLoading)) {
    return <AuthStatus title="Cargando tu cuenta" loading />;
  }

  if (membership.error) {
    return (
      <AuthStatus
        title="No se pudo consultar tu membresía"
        body={getErrorMessage(membership.error)}
      >
        <Button mode="contained" onPress={() => void membership.refetch()}>
          Reintentar
        </Button>
      </AuthStatus>
    );
  }

  if (membership.data !== 'verified') {
    if (!session) {
      return (
        <AuthStatus
          title="Publicar en Mío CASE"
          body="Crea una cuenta gratis y solicita la aprobación como vendedor desde Perfil."
        >
          <Button mode="contained" onPress={() => router.push('/sign-up')}>
            Registrarme
          </Button>
          <Button mode="outlined" onPress={() => router.push('/sign-in')}>
            Ya tengo cuenta
          </Button>
        </AuthStatus>
      );
    }

    return (
      <AuthStatus
        title={membership.data === 'pending' ? 'Solicitud de vendedor pendiente' : 'Publicar en Mío CASE'}
        body={
          membership.data === 'pending'
            ? 'Tu solicitud está pendiente de revisión. Puedes seguir comprando mientras esperas.'
            : 'Para publicar productos, crea una cuenta gratis y solicita la aprobación como vendedor desde Perfil.'
        }
      >
        {membership.data === 'rejected' ? (
          <Text variant="bodyMedium">
            Puedes volver a solicitar la aprobación desde tu perfil.
          </Text>
        ) : null}
        <Button mode="contained" onPress={() => router.replace('/(tabs)/two')}>
          Ir a Perfil
        </Button>
      </AuthStatus>
    );
  }

  return children;
}
