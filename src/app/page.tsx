import { getPayload } from 'payload';
import { redirect } from 'next/navigation';
import config from '../../payload.config';
import DashboardClient from '@/components/DashboardClient';
import { getOrCreateUser, resolveAuth0Session } from '@/lib/getSessionUser';

export const revalidate = 0; // Disable server caching to ensure page updates when data is synced

export default async function Page() {
  const { auth0Id, auth0Email, isAuthenticated } = await resolveAuth0Session();

  // Guests only get the Pit-Stop demo; trip history requires a GeoRide account.
  // `from=home` lets the Pit-Stop page explain *why* the URL changed instead
  // of silently landing the guest somewhere they didn't ask for.
  if (!isAuthenticated) {
    redirect('/pitstop?from=home');
  }

  let trips: any[] = [];
  let serializableUser = {
    id: '0',
    geoRideEmail: undefined as string | undefined,
    lastSyncDate: undefined as string | undefined,
    auth0Id,
    isAuthenticated,
    selectedFuel: 'sp95' as const,
    searchRadius: 20,
    fillSize: 15,
    consumption: 5.0,
    excludeDistance: false,
    lastSearchQuery: '',
    lastSearchLat: null as number | null,
    lastSearchLng: null as number | null,
  };

  try {
    const payload = await getPayload({ config });

    // 1. Fetch or provision the user record from Payload database (auto-heals schema if missing)
    const user = await getOrCreateUser(payload, auth0Id, auth0Email);

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
    trips = tripsResult.docs.map(doc => ({
      id: String(doc.id),
      title: doc.title || undefined,
      startedAt: doc.startedAt,
      endedAt: doc.endedAt,
      distance: doc.distance || undefined,
      duration: doc.duration || undefined,
      path: (doc.path as [number, number][]) || [],
    }));

    serializableUser = {
      id: String(user.id),
      geoRideEmail: user.geoRideEmail || undefined,
      lastSyncDate: user.lastSyncDate || undefined,
      auth0Id: user.auth0Id || auth0Id,
      isAuthenticated,
      selectedFuel: (user.selectedFuel || 'sp95') as any,
      searchRadius: user.searchRadius || 20,
      fillSize: user.fillSize || 15,
      consumption: user.consumption || 5.0,
      excludeDistance: !!user.excludeDistance,
      lastSearchQuery: user.lastSearchQuery || '',
      lastSearchLat: typeof user.lastSearchLat === 'number' ? user.lastSearchLat : null,
      lastSearchLng: typeof user.lastSearchLng === 'number' ? user.lastSearchLng : null,
    };
  } catch (error: any) {
    console.error("Payload database initialization or fetch error in DashboardPage:", {
      message: error?.message,
      name: error?.name,
      code: error?.code,
      stack: error?.stack,
      raw: error,
    });
  }

  return (
    <DashboardClient 
      initialTrips={trips} 
      user={serializableUser} 
    />
  );
}
