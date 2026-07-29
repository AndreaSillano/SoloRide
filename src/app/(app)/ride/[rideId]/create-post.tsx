import { Redirect, useLocalSearchParams } from 'expo-router';

/** Legacy deep link / stack entry — Camera tab is now the posting surface. */
export default function CreatePostRedirect() {
  const { rideId } = useLocalSearchParams<{ rideId: string }>();
  return <Redirect href={{ pathname: '/camera', params: { rideId } }} />;
}
