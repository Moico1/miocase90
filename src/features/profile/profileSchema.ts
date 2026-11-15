import { z } from 'zod';

export const profileFormSchema = z
  .object({
    displayName: z
      .string()
      .trim()
      .min(2, 'El nombre debe tener al menos 2 caracteres.')
      .max(60, 'El nombre no puede superar los 60 caracteres.'),
    whatsapp: z
      .string()
      .trim()
      .transform((value) => value.replace(/[\s()-]/g, ''))
      .refine(
        (value) => value === '' || /^\+[1-9][0-9]{7,14}$/.test(value),
        'Usa un número internacional, por ejemplo +591 7XXXXXXX.'
      ),
    showWhatsapp: z.boolean(),
  })
  .superRefine((values, context) => {
    if (values.showWhatsapp && values.whatsapp.length === 0) {
      context.addIssue({
        code: 'custom',
        path: ['whatsapp'],
        message: 'Agrega tu número antes de mostrarlo en tus publicaciones.',
      });
    }
  });

export type ProfileFormInput = z.input<typeof profileFormSchema>;
export type ProfileFormValues = z.output<typeof profileFormSchema>;
