import { getPayload } from 'payload';
import config from '../../../payload.config';
import SettingsClient from '@/components/SettingsClient';
import { auth0 } from '@/lib/auth0';

export const revalidate = 0; // Disable caching for user configuration updates

export default async function SettingsPage() {
  const payload = await getPayload({ config });

  // Try to get authenticated Auth0 session
  let auth0Id: string | undefined;
  let auth0Email: string | undefined;
  try {
    const session = await auth0.getSession();
    auth0Id = session?.user?.sub;
    auth0Email = session?.user?.email;
  } catch (e) {
    console.warn("Auth0 not fully configured or no active session. Using local development fallback.");
  }

  // Fallback default user for local development and testing
  if (!auth0Id) {
    auth0Id = 'auth0|default_local_user_95';
  }

  // Fetch user record from Payload database
  const userResult = await payload.find({
    collection: 'users',
    where: {
      auth0Id: {
        equals: auth0Id,
      },
    },
    limit: 1,
  });

  let user = userResult.docs[0];
  const envEmail = process.env.GEORIDE_EMAIL;
  const envPassword = process.env.GEORIDE_PASSWORD;

  if (!user) {
    // Provision the user on first visit if not yet present
    const sanitizedAuth0Id = auth0Id.replace(/[^a-zA-Z0-9]/g, '_');
    const userEmail = auth0Email || `motard_${sanitizedAuth0Id}@example.com`;

    user = await payload.create({
      collection: 'users',
      data: {
        email: userEmail,
        password: 'admin_password_95',
        auth0Id,
        geoRideEmail: envEmail || userEmail,
        geoRidePassword: envPassword || 'motard_secret_password_95',
        trackingStartDate: process.env.GEORIDE_START_DATE
          ? new Date(process.env.GEORIDE_START_DATE).toISOString()
          : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
      },
    });
  }

  // Map to a clean serialized object for hydration
  const serializableUser = {
    id: String(user.id),
    geoRideEmail: user.geoRideEmail || undefined,
    lastSyncDate: user.lastSyncDate || undefined,
    auth0Id: user.auth0Id || auth0Id,
    trackingStartDate: user.trackingStartDate || undefined,
    selectedTrackers: (user.selectedTrackers as { trackerId: string }[])?.map(st => st.trackerId) || [],
    isAuthenticated: auth0Id !== 'auth0|default_local_user_95',
  };

  return (
    <SettingsClient 
      user={serializableUser} 
    />
  );
}
