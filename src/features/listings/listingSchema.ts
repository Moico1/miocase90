import { z } from 'zod';

export const listingFormSchema = z.object({
  title: z
    .string()
    .trim()
    .min(3, 'El título debe tener al menos 3 caracteres.')
    .max(100, 'El título no puede superar los 100 caracteres.'),
  price: z
    .string()
    .trim()
    .min(1, 'Ingresa un precio.')
    .regex(
      /^\d+(?:[.,]\d{1,2})?$/,
      'Ingresa un precio como 50, 50.5 o 50,5 (hasta 2 decimales).'
    )
    .transform((value) => Number(value.replace(',', '.')))
    .refine(
      (value) => Number.isFinite(value) && value <= 99_999_999.99,
      'El precio supera el máximo permitido.'
    ),
  previousPrice: z
    .string()
    .trim()
    .refine(
      (value) => value === '' || /^\d+(?:[.,]\d{1,2})?$/.test(value),
      'Ingresa un precio anterior válido, por ejemplo 60 o 60,50.'
    )
    .transform((value) => (value === '' ? null : Number(value.replace(',', '.'))))
    .refine(
      (value) => value === null || (Number.isFinite(value) && value <= 99_999_999.99),
      'El precio anterior supera el máximo permitido.'
    ),
  currency: z.enum(['BOB', 'USD', 'ARS']),
  description: z
    .string()
    .trim()
    .max(1000, 'La descripción no puede superar los 1.000 caracteres.')
    .transform((value) => value || null),
  categoryId: z.number().int().positive('Selecciona una categoría.'),
  photoCount: z
    .number()
    .int()
    .min(1, 'Agrega al menos una foto')
    .max(5, 'Puedes agregar como máximo 5 fotos.'),
}).superRefine(({ price, previousPrice }, context) => {
  if (previousPrice !== null && previousPrice <= price) {
    context.addIssue({
      code: 'custom',
      path: ['previousPrice'],
      message: 'El precio anterior debe ser mayor que el precio actual.',
    });
  }
});

export type ListingFormInput = z.input<typeof listingFormSchema>;
export type ListingFormValues = z.output<typeof listingFormSchema>;
