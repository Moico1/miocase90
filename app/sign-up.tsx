import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Redirect, router, useLocalSearchParams, type Href } from 'expo-router';
import { HelperText, RadioButton, Text } from 'react-native-paper';
import { zodResolver } from '@hookform/resolvers/zod';

import { AppButton } from '@/design/AppButton';
import { TextField } from '@/design/TextField';
import { AuthPage } from '@/features/auth/AuthPage';
import { useAuth } from '@/features/auth/AuthProvider';
import { getErrorMessage } from '@/features/auth/errorMessage';
import { getSafeReturnTo } from '@/features/auth/returnTo';
import { signUpSchema, type SignUpValues } from '@/features/auth/authSchemas';
import { getSupabaseClient } from '@/lib/supabase';

export default function SignUpScreen() {
  const { returnTo: requestedReturnTo } = useLocalSearchParams<{ returnTo?: string }>();
  const returnTo = getSafeReturnTo(requestedReturnTo);
  const { session, isLoading } = useAuth();
  const [isCreatingAccount, setIsCreatingAccount] = useState(false);
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
      accountType: 'buyer',
    },
  });

  if (isLoading) return null;
  if (session && !isCreatingAccount) return <Redirect href={returnTo as Href} />;

  const onSubmit = async (values: SignUpValues) => {
    setServerError(null);
    setIsCreatingAccount(true);
    try {
      const { data, error } = await getSupabaseClient().auth.signUp({
        email: values.email.trim().toLowerCase(),
        password: values.password,
        options: {
          data: {
            display_name: values.displayName.trim(),
            account_type: values.accountType,
          },
        },
      });
      if (error) throw error;
      const destination =
        values.accountType === 'seller' && returnTo === '/'
          ? '/pending'
          : returnTo;
      router.replace(data.session ? destination as Href : {
        pathname: '/check-email',
        params: { returnTo: destination },
      });
    } catch (error) {
      setIsCreatingAccount(false);
      setServerError(getErrorMessage(error));
    }
  };

  return (
    <AuthPage
      title="Crear cuenta"
      subtitle="Elige cómo quieres participar. Comprar es gratis; para vender, un administrador debe aprobar tu solicitud."
    >
      <Text variant="titleMedium">¿Quieres comprar o vender?</Text>
      <Controller
        control={control}
        name="accountType"
        render={({ field: { onChange, value } }) => (
          <RadioButton.Group value={value} onValueChange={onChange}>
            <RadioButton.Item label="Comprar" value="buyer" style={styles.radioItem} />
            <RadioButton.Item
              label="Vender (requiere aprobación)"
              value="seller"
              style={styles.radioItem}
            />
          </RadioButton.Group>
        )}
      />
      <Controller
        control={control}
        name="displayName"
        render={({ field: { onChange, onBlur, value } }) => (
          <TextField
            label="Nombre para mostrar"
            style={styles.input}
            autoComplete="name"
            maxLength={60}
            error={errors.displayName?.message}
            onBlur={onBlur}
            onChangeText={onChange}
            value={value}
          />
        )}
      />
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
            label="Contraseña (mínimo 8 caracteres)"
            style={styles.input}
            secureTextEntry
            autoComplete="new-password"
            error={errors.password?.message}
            onBlur={onBlur}
            onChangeText={onChange}
            value={value}
          />
        )}
      />
      <Controller
        control={control}
        name="passwordConfirmation"
        render={({ field: { onChange, onBlur, value } }) => (
          <TextField
            label="Repite tu contraseña"
            style={styles.input}
            secureTextEntry
            autoComplete="new-password"
            error={errors.passwordConfirmation?.message}
            onBlur={onBlur}
            onChangeText={onChange}
            value={value}
          />
        )}
      />
      {serverError ? <HelperText type="error">{serverError}</HelperText> : null}
      <AppButton
        label="Registrarme"
        loading={isSubmitting}
        disabled={isSubmitting}
        onPress={() => void handleSubmit(onSubmit)()}
      />
      <AppButton
        label="Ya tengo cuenta"
        variant="secondary"
        onPress={() => router.replace({ pathname: '/sign-in', params: { returnTo } })}
      />
    </AuthPage>
  );
}

const styles = {
  input: { minHeight: 52 },
  radioItem: { minHeight: 48 },
};
