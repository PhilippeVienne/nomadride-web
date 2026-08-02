import { getPayload } from 'payload';
import config from '../../../payload.config';
import SettingsClient from '@/components/SettingsClient';
import { getOrCreateUser, resolveAuth0Session } from '@/lib/getSessionUser';

export const revalidate = 0; // Disable caching for user configuration updates

export default async function SettingsPage() {
  const { auth0Id, auth0Email, isAuthenticated } = await resolveAuth0Session();

  let serializableUser = {
    id: '0',
    geoRideEmail: undefined as string | undefined,
    lastSyncDate: undefined as string | undefined,
    auth0Id,
    trackingStartDate: undefined as string | undefined,
    selectedTrackers: [] as string[],
    isAuthenticated,
  };

  try {
    const payload = await getPayload({ config });

    // Fetch or provision the user record from Payload database
    const user = await getOrCreateUser(payload, auth0Id, auth0Email);

    // Map to a clean serialized object for hydration
    serializableUser = {
      id: String(user.id),
      geoRideEmail: user.geoRideEmail || undefined,
      lastSyncDate: user.lastSyncDate || undefined,
      auth0Id: user.auth0Id || auth0Id,
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
