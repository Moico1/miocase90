import { useQuery } from '@tanstack/react-query';

import { getSupabaseClient, isSupabaseConfigured } from '@/lib/supabase';

export type MembershipStatus = 'pending' | 'verified' | 'rejected';

export function useMembership(userId: string | undefined) {
  return useQuery({
    queryKey: ['community-membership', userId],
    enabled: isSupabaseConfigured && Boolean(userId),
    staleTime: 0,
    queryFn: async (): Promise<MembershipStatus> => {
      if (!userId) {
        throw new Error('Se necesita una sesión para consultar la membresía.');
      }

      const { data, error } = await getSupabaseClient()
        .from('community_memberships')
        .select('status')
        .eq('user_id', userId)
        .maybeSingle();

      if (error) throw error;
      if (!data) {
        throw new Error('No se encontró la membresía de esta cuenta.');
      }
      if (
        data.status !== 'pending' &&
        data.status !== 'verified' &&
        data.status !== 'rejected'
      ) {
        throw new Error('La base de datos devolvió un estado de membresía desconocido.');
      }

      return data.status;
    },
  });
}
