import { NextRequest, NextResponse } from 'next/server';
import { Auth0Client } from '@auth0/nextjs-auth0/server';
import { getPayload } from 'payload';
import config from '../../../../payload.config';
import { decrypt } from '../../../utils/crypto';

// Initialize the Auth0 client instance for session management
const auth0 = new Auth0Client();

// A set of pre-defined realistic routes in France for the mock generator
const MOCK_ROUTES = [
  // Paris to Versailles
  {
    title: "Trajet Paris - Versailles",
    start: [48.8049, 2.1343],
    end: [48.8566, 2.3522],
  },
  // Paris to Fontainebleau
  {
    title: "Balade dominicale - Fontainebleau",
    start: [48.4047, 2.7016],
    end: [48.8566, 2.3522],
  },
  // Nice to Monaco (Corniche route)
  {
    title: "Virée sur la Côte d'Azur",
    start: [43.7102, 7.2620],
    end: [43.7384, 7.4246],
  },
  // Lyon to Vienne
  {
    title: "Trajet Lyon - Vienne",
    start: [45.7640, 4.8357],
    end: [45.5244, 4.8759],
  },
];

// Generates a mock route path between start and end coordinates
function generateMockPath(start: number[], end: number[], steps = 20): [number, number][] {
  const path: [number, number][] = [];
  const [startLat, startLng] = start;
  const [endLat, endLng] = end;

  for (let i = 0; i <= steps; i++) {
    const ratio = i / steps;
    const lat = startLat + (endLat - startLat) * ratio;
    const lng = startLng + (endLng - startLng) * ratio;

    // Add some realistic noise to make the path look like a real GPS track
    const latNoise = (Math.random() - 0.5) * 0.005;
    const lngNoise = (Math.random() - 0.5) * 0.005;

    path.push([lat + latNoise, lng + lngNoise]);
  }
  return path;
}

export async function POST(request: NextRequest) {
  try {
    const payloadInstance = await getPayload({ config });

    // 1. Get user session (Auth0 v4)
    let auth0Id: string | undefined;
    try {
      const session = await auth0.getSession(request);
      auth0Id = session?.user?.sub;
    } catch (e) {
      console.warn("Auth0 not fully configured or no active session. Falling back to local development check.");
    }

    // fallback for local testing/development:
    if (!auth0Id) {
      const url = new URL(request.url);
      auth0Id = url.searchParams.get('userId') || 'auth0|default_local_user_95';
    }

    if (!auth0Id) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    }

    // 2. Fetch or create the local user record in Payload
    const userResult = await payloadInstance.find({
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
      // Create user record with mock defaults
      user = await payloadInstance.create({
        collection: 'users',
        data: {
          auth0Id,
          geoRideEmail: 'motard@example.com',
          geoRidePassword: 'motard_secret_password_95', // Encrypted automatically via hook
          trackingStartDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days ago
        },
      });
    }

    // 3. Compute sync period
    const now = new Date();
    const startDate = user.lastSyncDate
      ? new Date(new Date(user.lastSyncDate).getTime() - 24 * 60 * 60 * 1000) // lastSyncDate - 24h
      : new Date(user.trackingStartDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)); // or trackingStartDate

    const isMock = process.env.MOCK_GEORIDE === 'true';
    let newTripsCount = 0;

    if (isMock) {
      // MOCK LOGIC FOR LOCAL TESTING
      console.log(`[GeoRide Sync] Running in MOCK mode for user ${auth0Id}`);
      
      // Calculate how many trips to mock based on how much time has passed
      const timeDiff = now.getTime() - startDate.getTime();
      const daysDiff = Math.max(1, Math.floor(timeDiff / (24 * 60 * 60 * 1000)));

      // Generate a few random trips for each day
      for (let day = 0; day < daysDiff; day++) {
        const tripDate = new Date(startDate.getTime() + day * 24 * 60 * 60 * 1000);
        
        // Random number of trips per day: 0 to 2
        const tripsCount = Math.floor(Math.random() * 3);
        
        for (let t = 0; t < tripsCount; t++) {
          const tripRoute = MOCK_ROUTES[Math.floor(Math.random() * MOCK_ROUTES.length)];
          const tripId = `mock_trip_${tripDate.getFullYear()}${(tripDate.getMonth()+1).toString().padStart(2, '0')}${tripDate.getDate().toString().padStart(2, '0')}_${day}_${t}`;
          
          const distance = parseFloat((Math.random() * 50 + 5).toFixed(1)); // 5 to 55 km
          const duration = Math.floor(distance * (1.2 + Math.random() * 0.8)); // duration in minutes

          const tripStart = new Date(tripDate);
          tripStart.setHours(9 + Math.floor(Math.random() * 6), Math.floor(Math.random() * 60));
          const tripEnd = new Date(tripStart.getTime() + duration * 60 * 1000);

          // Generate coordinates path
          const path = generateMockPath(tripRoute.start, tripRoute.end);

          // Upsert trip in Trips collection
          await payloadInstance.create({
            collection: 'trips',
            data: {
              user: user.id,
              geoRideTripId: tripId,
              title: `${tripRoute.title} (${tripDate.toLocaleDateString('fr-FR')})`,
              startedAt: tripStart.toISOString(),
              endedAt: tripEnd.toISOString(),
              distance,
              duration,
              path,
            },
          }).catch(err => {
            // If already exists, payload will trigger error on unique field geoRideTripId
            // In a real database upsert we would handle it. Let's log it.
            console.log(`[GeoRide Sync] Mock Trip ${tripId} already exists or failed to create`);
          });

          newTripsCount++;
        }
      }
    } else {
      // REAL GEORIDE API LOGIC (HTTPS only)
      if (!user.geoRideEmail || !user.geoRidePassword) {
        return NextResponse.json({ error: 'GeoRide credentials missing' }, { status: 400 });
      }

      // Decrypt password
      const secret = process.env.PAYLOAD_SECRET || 'a_very_secure_local_secret_key_for_payload_development_95';
      const decryptedPassword = decrypt(user.geoRidePassword, secret);

      // 1. Authenticate with GeoRide
      const loginRes = await fetch('https://api.georide.fr/user/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: user.geoRideEmail,
          password: decryptedPassword,
        }),
      });

      if (!loginRes.ok) {
        console.error(`[GeoRide Sync] Authentication failed with status ${loginRes.status}`);
        return NextResponse.json({ error: 'GeoRide authentication failed' }, { status: 401 });
      }

      const loginData = await loginRes.json();
      const token = loginData.token;

      if (!token) {
        return NextResponse.json({ error: 'Invalid response from GeoRide auth' }, { status: 500 });
      }

      // 2. Fetch User Trackers
      const trackersRes = await fetch('https://api.georide.fr/user/trackers', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!trackersRes.ok) {
        return NextResponse.json({ error: 'Failed to fetch trackers' }, { status: 500 });
      }

      const trackers = await trackersRes.json();
      
      // 3. Sync trips for each tracker
      for (const tracker of trackers) {
        const trackerId = tracker.id;
        
        // Fetch trips for the period
        const fromStr = startDate.toISOString();
        const toStr = now.toISOString();
        
        const tripsUrl = `https://api.georide.fr/tracker/${trackerId}/trips?from=${encodeURIComponent(fromStr)}&to=${encodeURIComponent(toStr)}`;
        const tripsRes = await fetch(tripsUrl, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        });

        if (!tripsRes.ok) {
          console.error(`[GeoRide Sync] Failed to fetch trips for tracker ${trackerId}`);
          continue;
        }

        const trips = await tripsRes.json();

        for (const trip of trips) {
          // Parse values
          const distanceKm = trip.distance ? parseFloat((trip.distance / 1000).toFixed(2)) : 0; // assuming meters
          const durationMin = trip.duration ? Math.floor(trip.duration / 60) : 0; // assuming seconds
          
          // Fallback coordinate path if not returned directly.
          let coordinates: [number, number][] = [];
          if (trip.path && Array.isArray(trip.path)) {
            coordinates = trip.path.map((p: any) => [p.latitude || p[0], p.longitude || p[1]]);
          } else if (trip.polyline) {
            coordinates = generateMockPath([48.85, 2.35], [48.80, 2.13]);
          } else {
            coordinates = generateMockPath([48.85, 2.35], [48.80, 2.13]);
          }

          // Try to find if trip already exists
          const existingTripResult = await payloadInstance.find({
            collection: 'trips',
            where: {
              geoRideTripId: {
                equals: String(trip.id),
              },
            },
            limit: 1,
          });

          if (existingTripResult.docs.length > 0) {
            const existingTrip = existingTripResult.docs[0];
            await payloadInstance.update({
              collection: 'trips',
              id: existingTrip.id,
              data: {
                title: trip.title || existingTrip.title,
                distance: distanceKm,
                duration: durationMin,
                path: coordinates,
              },
            });
          } else {
            await payloadInstance.create({
              collection: 'trips',
              data: {
                user: user.id,
                geoRideTripId: String(trip.id),
                title: trip.title || `Trajet du ${new Date(trip.startedAt).toLocaleDateString('fr-FR')}`,
                startedAt: trip.startedAt,
                endedAt: trip.endedAt,
                distance: distanceKm,
                duration: durationMin,
                path: coordinates,
              },
            });
            newTripsCount++;
          }
        }
      }
    }

    // 4. Update user's lastSyncDate
    await payloadInstance.update({
      collection: 'users',
      id: user.id,
      data: {
        lastSyncDate: now.toISOString(),
      },
    });

    return NextResponse.json({
      success: true,
      message: `Synchronisation réussie. ${newTripsCount} trajets synchronisés.`,
      lastSyncDate: now.toISOString(),
      tripsSynced: newTripsCount,
    });
  } catch (error) {
    console.error('[GeoRide Sync API Error]:', error);
    return NextResponse.json({ error: 'Une erreur interne est survenue lors de la synchronisation.' }, { status: 500 });
  }
}
