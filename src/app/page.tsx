import { getPayload } from 'payload';
import config from '../../payload.config';
import DashboardClient from '@/components/DashboardClient';

export const revalidate = 0; // Disable server caching to ensure page updates when data is synced

export default async function Page() {
  const payload = await getPayload({ config });

  // Fallback default user for local development and testing
  const auth0Id = 'auth0|default_local_user_95';

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
  if (!user) {
    // Automatically provision the user record on first visit for plug-and-play testing
    user = await payload.create({
      collection: 'users',
      data: {
        auth0Id,
        geoRideEmail: 'motard@example.com',
        geoRidePassword: 'motard_secret_password_95', // Encrypted via hook
        trackingStartDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
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
  };

  return (
    <DashboardClient 
      initialTrips={trips} 
      user={serializableUser} 
    />
  );
}
