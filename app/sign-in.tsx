import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Redirect, router } from 'expo-router';
import { Button, HelperText, TextInput } from 'react-native-paper';
import { zodResolver } from '@hookform/resolvers/zod';

import { AuthPage } from '@/features/auth/AuthPage';
import { useAuth } from '@/features/auth/AuthProvider';
import { getErrorMessage } from '@/features/auth/errorMessage';
import { signInSchema, type SignInValues } from '@/features/auth/authSchemas';
import { getSupabaseClient } from '@/lib/supabase';

export default function SignInScreen() {
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
  if (session) return <Redirect href="/" />;

  const onSubmit = async (values: SignInValues) => {
    setServerError(null);
    try {
      const { error } = await getSupabaseClient().auth.signInWithPassword({
        email: values.email.trim().toLowerCase(),
        password: values.password,
      });
      if (error) throw error;
      router.replace('/');
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
          <TextInput
            label="Correo electrónico"
            mode="outlined"
            contentStyle={styles.inputContent}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            autoCorrect={false}
            error={Boolean(errors.email)}
            onBlur={onBlur}
            onChangeText={onChange}
            value={value}
          />
        )}
      />
      <HelperText type="error" visible={Boolean(errors.email)}>
        {errors.email?.message}
      </HelperText>

      <Controller
        control={control}
        name="password"
        render={({ field: { onChange, onBlur, value } }) => (
          <TextInput
            label="Contraseña"
            mode="outlined"
            contentStyle={styles.inputContent}
            secureTextEntry
            autoComplete="current-password"
            error={Boolean(errors.password)}
            onBlur={onBlur}
            onChangeText={onChange}
            value={value}
          />
        )}
      />
      <HelperText type="error" visible={Boolean(errors.password)}>
        {errors.password?.message}
      </HelperText>

      {serverError ? <HelperText type="error">{serverError}</HelperText> : null}
      <Button
        mode="contained"
        contentStyle={styles.buttonContent}
        loading={isSubmitting}
        disabled={isSubmitting}
        onPress={() => void handleSubmit(onSubmit)()}
      >
        Entrar
      </Button>
      <Button
        mode="text"
        contentStyle={styles.buttonContent}
        onPress={() => router.push('/sign-up')}
      >
        Crear una cuenta
      </Button>
    </AuthPage>
  );
}

const styles = {
  inputContent: { minHeight: 50 },
  buttonContent: { minHeight: 48 },
};
