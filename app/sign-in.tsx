import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Redirect, router, useLocalSearchParams, type Href } from 'expo-router';
import { HelperText } from 'react-native-paper';
import { zodResolver } from '@hookform/resolvers/zod';

import { AppButton } from '@/design/AppButton';
import { TextField } from '@/design/TextField';
import { AuthPage } from '@/features/auth/AuthPage';
import { useAuth } from '@/features/auth/AuthProvider';
import { getErrorMessage } from '@/features/auth/errorMessage';
import { getSafeReturnTo } from '@/features/auth/returnTo';
import { signInSchema, type SignInValues } from '@/features/auth/authSchemas';
import { getSupabaseClient } from '@/lib/supabase';

export default function SignInScreen() {
  const { returnTo: requestedReturnTo } = useLocalSearchParams<{ returnTo?: string }>();
  const returnTo = getSafeReturnTo(requestedReturnTo);
  const { session, isLoading } = useAuth();
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SignInValues>({
    resolver: zodResolver(signInSchema),
    defaultValues: { email: '', password: '' },
  });

  if (isLoading) return null;
  if (session) return <Redirect href={returnTo as Href} />;

  const onSubmit = async (values: SignInValues) => {
    setServerError(null);
    try {
      const { error } = await getSupabaseClient().auth.signInWithPassword({
        email: values.email.trim().toLowerCase(),
        password: values.password,
      });
      if (error) throw error;
      router.replace(returnTo as Href);
    } catch (error) {
      setServerError(getErrorMessage(error));
    }
  };

  return (
    <AuthPage
      title="Iniciar sesión"
      subtitle="Ingresa con el correo que usaste al crear tu cuenta."
    >
      <Controller
        control={control}
        name="email"
        render={({ field: { onChange, onBlur, value } }) => (
          <TextField
            label="Correo electrónico"
            style={styles.input}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            autoCorrect={false}
            error={errors.email?.message}
            onBlur={onBlur}
            onChangeText={onChange}
            value={value}
          />
        )}
      />
      <Controller
        control={control}
        name="password"
        render={({ field: { onChange, onBlur, value } }) => (
          <TextField
            label="Contraseña"
            style={styles.input}
            secureTextEntry
            autoComplete="current-password"
            error={errors.password?.message}
            onBlur={onBlur}
            onChangeText={onChange}
            value={value}
          />
        )}
      />
      {serverError ? <HelperText type="error">{serverError}</HelperText> : null}
      <AppButton
        label="Entrar"
        loading={isSubmitting}
        disabled={isSubmitting}
        onPress={() => void handleSubmit(onSubmit)()}
      />
      <AppButton
        label="Crear una cuenta"
        variant="secondary"
        onPress={() => router.push({ pathname: '/sign-up', params: { returnTo } })}
      />
    </AuthPage>
  );
}

const styles = {
  input: { minHeight: 52 },
};
