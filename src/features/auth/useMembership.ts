import { useQuery } from '@tanstack/react-query';

import { getSupabaseClient, isSupabaseConfigured } from '@/lib/supabase';

export type MembershipStatus = 'none' | 'pending' | 'verified' | 'rejected';

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
        .from('profiles')
        .select('seller_status')
        .eq('id', userId)
        .maybeSingle();

      if (error) throw error;
      if (!data) {
        throw new Error('No se encontró el perfil de esta cuenta.');
      }

      if (data.seller_status === null) return 'none';
      if (data.seller_status === 'approved') return 'verified';
      if (data.seller_status === 'pending' || data.seller_status === 'rejected') {
        return data.seller_status;
      }

      throw new Error('La base de datos devolvió un estado de vendedor desconocido.');
    },
  });
}
