import { getPayload } from 'payload';
import config from '../../payload.config';
import DashboardClient from '@/components/DashboardClient';
import { auth0 } from '@/lib/auth0';

export const revalidate = 0; // Disable server caching to ensure page updates when data is synced

export default async function Page() {
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

  // 1. Fetch user record from Payload database
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
    const sanitizedAuth0Id = auth0Id.replace(/[^a-zA-Z0-9]/g, '_');
    const userEmail = auth0Email || `motard_${sanitizedAuth0Id}@example.com`;

    // Automatically provision the user record on first visit for plug-and-play testing
    user = await payload.create({
      collection: 'users',
      data: {
        email: userEmail,
        password: 'admin_password_95', // Admin login password
        auth0Id,
        geoRideEmail: envEmail || userEmail,
        geoRidePassword: envPassword || 'motard_secret_password_95', // Encrypted via hook
        trackingStartDate: process.env.GEORIDE_START_DATE
          ? new Date(process.env.GEORIDE_START_DATE).toISOString()
          : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
      },
    });
  } else if (envEmail && envPassword && user.geoRideEmail !== envEmail) {
    // Dynamically update credentials if modified in env files
    user = await payload.update({
      collection: 'users',
      id: user.id,
      data: {
        geoRideEmail: envEmail,
        geoRidePassword: envPassword,
        lastSyncDate: null, // Reset sync date to pull new history
      },
    });
  }

  // 2. Fetch trips cached for this user
  const tripsResult = await payload.find({
    collection: 'trips',
    where: {
      user: {
        equals: user.id,
      },
    },
    limit: 1000,
    sort: '-startedAt', // Display latest rides first in list
  });

  // Map results to clean types suitable for client-side hydration, casting IDs explicitly to string
  const trips = tripsResult.docs.map(doc => ({
    id: String(doc.id),
    title: doc.title || undefined,
    startedAt: doc.startedAt,
    endedAt: doc.endedAt,
    distance: doc.distance || undefined,
    duration: doc.duration || undefined,
    path: (doc.path as [number, number][]) || [],
  }));
  const serializableUser = {
    id: String(user.id),
    geoRideEmail: user.geoRideEmail || undefined,
    lastSyncDate: user.lastSyncDate || undefined,
    auth0Id: user.auth0Id || auth0Id,
    isAuthenticated: auth0Id !== 'auth0|default_local_user_95',
    selectedFuel: user.selectedFuel || 'sp95',
    searchRadius: user.searchRadius || 20,
    fillSize: user.fillSize || 15,
    consumption: user.consumption || 5.0,
    excludeDistance: !!user.excludeDistance,
    lastSearchQuery: user.lastSearchQuery || '',
    lastSearchLat: typeof user.lastSearchLat === 'number' ? user.lastSearchLat : null,
    lastSearchLng: typeof user.lastSearchLng === 'number' ? user.lastSearchLng : null,
  };

  return (
    <DashboardClient 
      initialTrips={trips} 
      user={serializableUser} 
    />
  );
}
