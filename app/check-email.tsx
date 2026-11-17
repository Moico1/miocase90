import { Redirect, router, useLocalSearchParams, type Href } from 'expo-router';
import { Button } from 'react-native-paper';

import { AuthStatus } from '@/features/auth/AuthStatus';
import { useAuth } from '@/features/auth/AuthProvider';
import { getSafeReturnTo } from '@/features/auth/returnTo';

export default function CheckEmailScreen() {
  const { returnTo: requestedReturnTo } = useLocalSearchParams<{ returnTo?: string }>();
  const returnTo = getSafeReturnTo(requestedReturnTo);
  const { session, isLoading } = useAuth();

  if (isLoading) return <AuthStatus title="Cargando MioCASE" loading />;
  if (session) return <Redirect href={returnTo as Href} />;

  return (
    <AuthStatus
      title="Confirma tu correo"
      body="Si Supabase pide confirmar tu correo, revisa tu bandeja y luego inicia sesión. Para vender, además necesitas la aprobación de un administrador."
    >
      <Button
        mode="contained"
        onPress={() =>
          router.replace({ pathname: '/sign-in', params: { returnTo } })
        }
      >
        Ir a iniciar sesión
      </Button>
    </AuthStatus>
  );
}
