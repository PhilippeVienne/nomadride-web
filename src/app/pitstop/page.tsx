import { getPayload } from 'payload';
import config from '../../../payload.config';
import PitstopClient from '@/components/PitstopClient';
import { getOrCreateUser, resolveAuth0Session } from '@/lib/getSessionUser';
import type { FuelType } from '@/lib/pitstop/types';

export const revalidate = 0;

export default async function PitstopPage() {
  const { auth0Id, auth0Email, isAuthenticated } = await resolveAuth0Session();

  let trips: any[] = [];
  let serializableUser = {
    id: '0',
    geoRideEmail: undefined as string | undefined,
    lastSyncDate: undefined as string | undefined,
    auth0Id,
    isAuthenticated,
    selectedFuel: undefined as FuelType | undefined,
    searchRadius: undefined as number | undefined,
    fillSize: 15,
    consumption: 5.0,
    excludeDistance: false,
    lastSearchQuery: '',
    lastSearchLat: null as number | null,
    lastSearchLng: null as number | null,
  };

  try {
    const payload = await getPayload({ config });

    // Fetch or provision the user record
    const user = await getOrCreateUser(payload, auth0Id, auth0Email);

    // Fetch trips for trip shortcut feature
    const tripsResult = await payload.find({
      collection: 'trips',
      where: {
        user: {
          equals: user.id,
        },
      },
      limit: 1000,
      sort: '-startedAt',
    });

    trips = tripsResult.docs
      .filter(doc => doc.path && (doc.path as [number, number][]).length > 2)
      .map(doc => ({
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
      selectedFuel: (user.selectedFuel ?? undefined) as FuelType | undefined,
      searchRadius: user.searchRadius ?? undefined,
      fillSize: user.fillSize || 15,
      consumption: user.consumption || 5.0,
      excludeDistance: !!user.excludeDistance,
      lastSearchQuery: user.lastSearchQuery || '',
      lastSearchLat: typeof user.lastSearchLat === 'number' ? user.lastSearchLat : null,
      lastSearchLng: typeof user.lastSearchLng === 'number' ? user.lastSearchLng : null,
    };
  } catch (error) {
    console.error('Payload database initialization or fetch error in PitstopPage:', error);
  }

  return (
    <PitstopClient
      trips={trips}
      user={serializableUser}
    />
  );
}
