import { z } from 'zod';

export const profileFormSchema = z.object({
  displayName: z
    .string()
    .trim()
    .min(2, 'El nombre debe tener al menos 2 caracteres.')
    .max(60, 'El nombre no puede superar los 60 caracteres.'),
  showWhatsapp: z.boolean(),
});

export type ProfileFormInput = z.input<typeof profileFormSchema>;
export type ProfileFormValues = z.output<typeof profileFormSchema>;
