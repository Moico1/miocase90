import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Redirect, router } from 'expo-router';
import { Button, HelperText, TextInput } from 'react-native-paper';
import { zodResolver } from '@hookform/resolvers/zod';

import { AuthPage } from '@/features/auth/AuthPage';
import { useAuth } from '@/features/auth/AuthProvider';
import { getErrorMessage } from '@/features/auth/errorMessage';
import { signUpSchema, type SignUpValues } from '@/features/auth/authSchemas';
import { getSupabaseClient } from '@/lib/supabase';

export default function SignUpScreen() {
  const { session, isLoading } = useAuth();
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SignUpValues>({
    resolver: zodResolver(signUpSchema),
    defaultValues: {
      displayName: '',
      email: '',
      password: '',
      passwordConfirmation: '',
    },
  });

  if (isLoading) return null;
  if (session) return <Redirect href="/" />;

  const onSubmit = async (values: SignUpValues) => {
    setServerError(null);
    try {
      const { data, error } = await getSupabaseClient().auth.signUp({
        email: values.email.trim().toLowerCase(),
        password: values.password,
        options: {
          data: { display_name: values.displayName.trim() },
        },
      });
      if (error) throw error;
      router.replace(data.session ? '/' : '/check-email');
    } catch (error) {
      setServerError(getErrorMessage(error));
    }
  };

  return (
    <AuthPage
      title="Crear cuenta"
      subtitle="Usa tu correo personal. La pertenencia a la comunidad se verifica por invitación o revisión manual."
    >
      <Controller
        control={control}
        name="displayName"
        render={({ field: { onChange, onBlur, value } }) => (
          <TextInput
            label="Nombre para mostrar"
            mode="outlined"
            contentStyle={styles.inputContent}
            autoComplete="name"
            maxLength={60}
            error={Boolean(errors.displayName)}
            onBlur={onBlur}
            onChangeText={onChange}
            value={value}
          />
        )}
      />
      <HelperText type="error" visible={Boolean(errors.displayName)}>
        {errors.displayName?.message}
      </HelperText>

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
            label="Contraseña (mínimo 8 caracteres)"
            mode="outlined"
            contentStyle={styles.inputContent}
            secureTextEntry
            autoComplete="new-password"
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

      <Controller
        control={control}
        name="passwordConfirmation"
        render={({ field: { onChange, onBlur, value } }) => (
          <TextInput
            label="Repite tu contraseña"
            mode="outlined"
            contentStyle={styles.inputContent}
            secureTextEntry
            autoComplete="new-password"
            error={Boolean(errors.passwordConfirmation)}
            onBlur={onBlur}
            onChangeText={onChange}
            value={value}
          />
        )}
      />
      <HelperText type="error" visible={Boolean(errors.passwordConfirmation)}>
        {errors.passwordConfirmation?.message}
      </HelperText>

      {serverError ? <HelperText type="error">{serverError}</HelperText> : null}
      <Button
        mode="contained"
        contentStyle={styles.buttonContent}
        loading={isSubmitting}
        disabled={isSubmitting}
        onPress={() => void handleSubmit(onSubmit)()}
      >
        Registrarme
      </Button>
      <Button
        mode="text"
        contentStyle={styles.buttonContent}
        onPress={() => router.replace('/sign-in')}
      >
        Ya tengo cuenta
      </Button>
    </AuthPage>
  );
}

const styles = {
  inputContent: { minHeight: 50 },
  buttonContent: { minHeight: 48 },
};
