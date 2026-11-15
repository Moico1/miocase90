import { useLocalSearchParams } from 'expo-router';

import { VerifiedMemberGate } from '@/features/auth/VerifiedMemberGate';
import { ListingDetailScreen } from '@/features/listings/ListingDetailScreen';

export default function ListingDetailRoute() {
  const { id } = useLocalSearchParams<{ id?: string | string[] }>();
  const listingId = Array.isArray(id) ? id[0] ?? '' : id ?? '';

  return (
    <VerifiedMemberGate>
      <ListingDetailScreen listingId={listingId} />
    </VerifiedMemberGate>
  );
}
