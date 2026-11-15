import type { PropsWithChildren } from 'react';
import { Redirect } from 'expo-router';
import { Button } from 'react-native-paper';

import { AuthStatus } from '@/features/auth/AuthStatus';
import { useAuth } from '@/features/auth/AuthProvider';
import { getErrorMessage } from '@/features/auth/errorMessage';
import { useMembership } from '@/features/auth/useMembership';

export function VerifiedMemberGate({ children }: PropsWithChildren) {
  const { session, isLoading } = useAuth();
  const membership = useMembership(session?.user.id);

  if (isLoading || (session && membership.isLoading)) {
    return <AuthStatus title="Cargando tu cuenta" loading />;
  }

  if (!session) {
    return <Redirect href="/sign-in" />;
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
    return <Redirect href="/pending" />;
  }

  return children;
}
