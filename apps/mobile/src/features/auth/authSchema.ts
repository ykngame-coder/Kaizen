import { z } from 'zod';

/** Credentials validation for sign-in / sign-up (Master Prompt P15.2, P29.6). */
export const credentialsSchema = z.object({
  email: z.string().email('Adresse e-mail invalide'),
  password: z.string().min(8, 'Au moins 8 caractères'),
});

export type Credentials = z.infer<typeof credentialsSchema>;
