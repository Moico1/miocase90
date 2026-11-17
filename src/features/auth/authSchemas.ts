import { z } from 'zod';

const emailSchema = z.string().trim().email('Ingresa un correo válido.');

export const signInSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Ingresa tu contraseña.'),
});

export const signUpSchema = z
  .object({
    displayName: z
      .string()
      .trim()
      .min(2, 'Escribe al menos 2 caracteres.')
      .max(60, 'El nombre no puede superar 60 caracteres.'),
    email: emailSchema,
    password: z.string().min(8, 'Usa al menos 8 caracteres.'),
    passwordConfirmation: z.string().min(1, 'Confirma tu contraseña.'),
    accountType: z.enum(['buyer', 'seller']),
  })
  .refine((values) => values.password === values.passwordConfirmation, {
    path: ['passwordConfirmation'],
    message: 'Las contraseñas no coinciden.',
  });

export const inviteCodeSchema = z.object({
  code: z
    .string()
    .trim()
    .regex(/^[0-9a-f]{32}$/i, 'El código debe tener 32 caracteres hexadecimales.'),
});

export type SignInValues = z.infer<typeof signInSchema>;
export type SignUpValues = z.infer<typeof signUpSchema>;
export type InviteCodeValues = z.infer<typeof inviteCodeSchema>;
