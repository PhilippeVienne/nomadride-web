import { getPayload } from 'payload';
import { redirect } from 'next/navigation';
import config from '../../../payload.config';
import SettingsClient from '@/components/SettingsClient';
import { getOrCreateUser, resolveGoogleSession } from '@/lib/getSessionUser';

export const revalidate = 0; // Disable caching for user configuration updates

export default async function SettingsPage() {
  const { googleId, googleEmail, isAuthenticated } = await resolveGoogleSession();

  // Credentials GeoRide + trackers n'ont pas de sens pour un compte invité.
  // `from=settings` lets the Pit-Stop page explain why the guest landed here.
  if (!isAuthenticated) {
    redirect('/pitstop?from=settings');
  }

  let serializableUser = {
    id: '0',
    geoRideEmail: undefined as string | undefined,
    lastSyncDate: undefined as string | undefined,
    googleId,
    trackingStartDate: undefined as string | undefined,
    selectedTrackers: [] as string[],
    isAuthenticated,
  };

  try {
    const payload = await getPayload({ config });

    // Fetch or provision the user record from Payload database
    const user = await getOrCreateUser(payload, googleId, googleEmail);

    // Map to a clean serialized object for hydration
    serializableUser = {
      id: String(user.id),
      geoRideEmail: user.geoRideEmail || undefined,
      lastSyncDate: user.lastSyncDate || undefined,
      googleId: user.googleId || googleId,
      trackingStartDate: user.trackingStartDate || undefined,
      selectedTrackers: (user.selectedTrackers as { trackerId: string }[])?.map(st => st.trackerId) || [],
      isAuthenticated,
    };
  } catch (error) {
    console.error("Payload database initialization or fetch error in SettingsPage:", error);
  }

  return (
    <SettingsClient 
      user={serializableUser} 
    />
  );
}
