import { PublishListingScreen } from '@/features/listings/PublishListingScreen';
import { VerifiedMemberGate } from '@/features/auth/VerifiedMemberGate';

export default function PublishRoute() {
  return (
    <VerifiedMemberGate>
      <PublishListingScreen />
    </VerifiedMemberGate>
  );
}
