import { Redirect, router } from 'expo-router';
import { Button } from 'react-native-paper';

import { AuthStatus } from '@/features/auth/AuthStatus';
import { useAuth } from '@/features/auth/AuthProvider';

export default function CheckEmailScreen() {
  const { session, isLoading } = useAuth();

  if (isLoading) return <AuthStatus title="Cargando MioCASE" loading />;
  if (session) return <Redirect href="/" />;

  return (
    <AuthStatus
      title="Confirma tu correo"
      body="Si Supabase tiene activa la confirmación por correo, revisa tu bandeja y luego inicia sesión. La confirmación del correo no reemplaza la aprobación de la comunidad. Si ya tenías cuenta, vuelve a iniciar sesión."
    >
      <Button mode="contained" onPress={() => router.replace('/sign-in')}>
        Ir a iniciar sesión
      </Button>
    </AuthStatus>
  );
}
