import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Redirect, router, useLocalSearchParams, type Href } from 'expo-router';
import { Button, HelperText, RadioButton, Text, TextInput } from 'react-native-paper';
import { zodResolver } from '@hookform/resolvers/zod';

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
            <RadioButton.Item label="Comprar" value="buyer" />
            <RadioButton.Item label="Vender (requiere aprobación)" value="seller" />
          </RadioButton.Group>
        )}
      />
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
        onPress={() => router.replace({ pathname: '/sign-in', params: { returnTo } })}
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
