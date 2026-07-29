import { useLocalSearchParams } from 'expo-router';

import { RideOverview } from '@/components/ride-overview';
import { ScrollScreen } from '@/components/ui';

export default function RideScreen() {
  const { rideId } = useLocalSearchParams<{ rideId: string }>();

  return (
    <ScrollScreen>
      <RideOverview rideId={rideId} showHeading />
    </ScrollScreen>
  );
}
