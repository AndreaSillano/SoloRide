import { useLocalSearchParams } from 'expo-router';

import { RideOverview } from '@/components/ride-overview';
import { ScrollScreen } from '@/components/ui';
import { useRideFeed } from '@/features/posts';

export default function RideScreen() {
  const { rideId } = useLocalSearchParams<{ rideId: string }>();
  const feed = useRideFeed(rideId);

  return (
    <ScrollScreen onScroll={rideId ? feed.loadMoreIfNearEnd : undefined}>
      <RideOverview rideId={rideId} />
    </ScrollScreen>
  );
}
