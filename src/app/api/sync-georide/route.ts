import { NextRequest } from 'next/server';
import { getPayload } from 'payload';
import config from '../../../../payload.config';
import { decrypt } from '../../../utils/crypto';
import { auth0 } from '../../../lib/auth0';

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
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: any) => {
        controller.enqueue(encoder.encode(JSON.stringify(data) + '\n'));
      };

      try {
        send({ step: 'init', message: 'Initialisation de la synchronisation...' });
        const payloadInstance = await getPayload({ config });

        // 1. Get user session (Auth0 v4)
        let auth0Id: string | undefined;
        let auth0Email: string | undefined;
        try {
          const session = await auth0.getSession(request);
          auth0Id = session?.user?.sub;
          auth0Email = session?.user?.email;
        } catch (e) {
          console.warn("Auth0 not fully configured or no active session. Falling back to local development check.");
        }

        // fallback for local testing/development:
        if (!auth0Id) {
          const url = new URL(request.url);
          auth0Id = url.searchParams.get('userId') || 'auth0|default_local_user_95';
        }

        if (!auth0Id) {
          send({ error: 'Non autorisé' });
          controller.close();
          return;
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
        const envEmail = process.env.GEORIDE_EMAIL;
        const envPassword = process.env.GEORIDE_PASSWORD;

        if (!user) {
          const sanitizedAuth0Id = auth0Id.replace(/[^a-zA-Z0-9]/g, '_');
          const userEmail = auth0Email || `motard_${sanitizedAuth0Id}@example.com`;

          // Create user record with mock defaults
          user = await payloadInstance.create({
            collection: 'users',
            data: {
              email: userEmail,
              password: 'admin_password_95', // Admin login password
              auth0Id,
              geoRideEmail: envEmail || userEmail,
              geoRidePassword: envPassword || 'motard_secret_password_95', // Encrypted automatically via hook
              trackingStartDate: process.env.GEORIDE_START_DATE
                ? new Date(process.env.GEORIDE_START_DATE).toISOString()
                : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days ago
            },
          });
        } else if (envEmail && envPassword && user.geoRideEmail !== envEmail) {
          // Dynamically update credentials if modified in env files
          user = await payloadInstance.update({
            collection: 'users',
            id: user.id,
            data: {
              geoRideEmail: envEmail,
              geoRidePassword: envPassword,
              lastSyncDate: null, // Reset sync date to pull new history
            },
          });
        }

        // 3. Compute sync period
        const now = new Date();
        let startDate = user.lastSyncDate
          ? new Date(new Date(user.lastSyncDate).getTime() - 24 * 60 * 60 * 1000) // lastSyncDate - 24h
          : new Date(user.trackingStartDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)); // or trackingStartDate

        // Fetch all local trips to identify doubtful/fallback paths (length <= 2) and self-heal them
        const localTripsResult = await payloadInstance.find({
          collection: 'trips',
          where: {
            user: {
              equals: user.id,
            },
          },
          limit: 1000,
        });

        const doubtfulTrips = localTripsResult.docs.filter(
          (t: any) => !t.path || !Array.isArray(t.path) || t.path.length <= 2
        );

        if (doubtfulTrips.length > 0) {
          let oldestDoubtfulDate = new Date();
          for (const dt of doubtfulTrips) {
            if (dt.startedAt) {
              const dtDate = new Date(dt.startedAt);
              if (dtDate < oldestDoubtfulDate) {
                oldestDoubtfulDate = dtDate;
              }
            }
          }

          // Expand the synchronization timeframe to ensure GeoRide returns those fallback trips for re-fetching
          const adjustedOldestDate = new Date(oldestDoubtfulDate.getTime() - 2 * 60 * 60 * 1000); // 2 hours buffer
          if (adjustedOldestDate < startDate) {
            startDate = adjustedOldestDate;
            console.log(`[GeoRide Sync] Extending sync timeframe to ${startDate.toISOString()} to self-heal ${doubtfulTrips.length} doubtful trips.`);
          }
        }

        const isMock = process.env.MOCK_GEORIDE === 'true';
        let newTripsCount = 0;

        const selectedIds = user.selectedTrackers?.map((st: any) => String(st.trackerId)) || [];
        if (selectedIds.length === 0) {
          send({ error: "Aucune moto sélectionnée pour la synchronisation. Rendez-vous dans les Réglages." });
          controller.close();
          return;
        }

        if (isMock) {
          send({ step: 'mock', message: 'Génération de trajets simulés (mode Démo)...' });
          console.log(`[GeoRide Sync] Running in MOCK mode for user ${auth0Id}`);
          
          // Calculate how many trips to mock based on how much time has passed
          const timeDiff = now.getTime() - startDate.getTime();
          const daysDiff = Math.max(1, Math.floor(timeDiff / (24 * 60 * 60 * 1000)));

          // Pre-generate the structure of mock trips so we can report a precise total count
          interface MockTripToCreate {
            trackerId: string;
            bikeName: string;
            tripDate: Date;
            tripRoute: typeof MOCK_ROUTES[0];
            tripId: string;
            distance: number;
            duration: number;
            tripStart: Date;
            tripEnd: Date;
          }

          const mockTrips: MockTripToCreate[] = [];
          for (const trackerId of selectedIds) {
            const bikeName = trackerId === 'mock_tracker_ktm' ? 'KTM Duke 790' : 'Honda CRF300L';
            
            for (let day = 0; day < daysDiff; day++) {
              const tripDate = new Date(startDate.getTime() + day * 24 * 60 * 60 * 1000);
              const tripsCount = Math.floor(Math.random() * 2);
              
              for (let t = 0; t < tripsCount; t++) {
                const tripRoute = MOCK_ROUTES[Math.floor(Math.random() * MOCK_ROUTES.length)];
                const tripId = `mock_${trackerId}_${tripDate.getFullYear()}${(tripDate.getMonth()+1).toString().padStart(2, '0')}${tripDate.getDate().toString().padStart(2, '0')}_${day}_${t}`;
                
                const distance = parseFloat((Math.random() * 40 + 5).toFixed(1)); // 5 to 45 km
                const duration = Math.floor(distance * (1.1 + Math.random() * 0.7)); // duration in minutes

                const tripStart = new Date(tripDate);
                tripStart.setHours(9 + Math.floor(Math.random() * 6), Math.floor(Math.random() * 60));
                const tripEnd = new Date(tripStart.getTime() + duration * 60 * 1000);

                mockTrips.push({
                  trackerId,
                  bikeName,
                  tripDate,
                  tripRoute,
                  tripId,
                  distance,
                  duration,
                  tripStart,
                  tripEnd
                });
              }
            }
          }

          const totalMock = mockTrips.length;
          let currentMock = 0;

          for (const mt of mockTrips) {
            currentMock++;
            const path = generateMockPath(mt.tripRoute.start, mt.tripRoute.end);

            send({
              step: 'trip_sync',
              message: `Synchronisation du trajet (${currentMock}/${totalMock}) : ${mt.tripRoute.title} (${mt.bikeName})`,
              current: currentMock,
              total: totalMock
            });

            // Check if mock trip already exists
            const existingMockTrip = await payloadInstance.find({
              collection: 'trips',
              where: {
                geoRideTripId: {
                  equals: mt.tripId,
                },
              },
              limit: 1,
            });

            if (existingMockTrip.docs.length > 0) {
              await payloadInstance.update({
                collection: 'trips',
                id: existingMockTrip.docs[0].id,
                data: {
                  title: `${mt.bikeName} : ${mt.tripRoute.title}`,
                  distance: mt.distance,
                  duration: mt.duration,
                  path,
                },
              });
            } else {
              await payloadInstance.create({
                collection: 'trips',
                data: {
                  user: user.id,
                  geoRideTripId: mt.tripId,
                  title: `${mt.bikeName} : ${mt.tripRoute.title}`,
                  startedAt: mt.tripStart.toISOString(),
                  endedAt: mt.tripEnd.toISOString(),
                  distance: mt.distance,
                  duration: mt.duration,
                  path,
                },
              });
              newTripsCount++;
            }
          }
        } else {
          // REAL GEORIDE API LOGIC (HTTPS only)
          if (!user.geoRideEmail || !user.geoRidePassword) {
            send({ error: 'Identifiants GeoRide manquants. Veuillez lier votre compte dans les Réglages.' });
            controller.close();
            return;
          }

          // Decrypt password
          const secret = process.env.PAYLOAD_SECRET || 'a_very_secure_local_secret_key_for_payload_development_95';
          const decryptedPassword = decrypt(user.geoRidePassword, secret);

          // 1. Authenticate with GeoRide
          send({ step: 'auth', message: 'Connexion aux serveurs GeoRide...' });
          const loginRes = await fetch('https://api.georide.com/user/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              email: user.geoRideEmail,
              password: decryptedPassword,
            }),
          });

          if (!loginRes.ok) {
            console.error(`[GeoRide Sync] Authentication failed with status ${loginRes.status}`);
            send({ error: 'Échec de l\'authentification GeoRide. Veuillez vérifier vos identifiants.' });
            controller.close();
            return;
          }

          const loginData = await loginRes.json();
          const token = loginData.authToken || loginData.token;

          if (!token) {
            send({ error: 'Jeton de connexion GeoRide introuvable. Réponse API invalide.' });
            controller.close();
            return;
          }

          // 2. Fetch User Trackers
          send({ step: 'trackers', message: 'Récupération des motos configurées...' });
          const trackersRes = await fetch('https://api.georide.com/user/trackers', {
            method: 'GET',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
          });

          if (!trackersRes.ok) {
            send({ error: 'Impossible de récupérer la liste des motos de GeoRide.' });
            controller.close();
            return;
          }

          const trackers = await trackersRes.json();
          
          // Filter trackers list according to user preferences
          const selectedTrackers = trackers.filter((t: any) => {
            const idVal = t.trackerId !== undefined ? t.trackerId : t.id;
            return selectedIds.includes(String(idVal));
          });

          if (selectedTrackers.length === 0) {
            console.warn(`[GeoRide Sync] None of the user's selected trackers were returned by the GeoRide API.`);
            send({ error: 'Aucune de vos motos sélectionnées n\'a été trouvée sur votre compte GeoRide.' });
            controller.close();
            return;
          }

          send({ step: 'sync_start', message: 'Début de l\'importation des trajets...' });

          // First, fetch all trips across all selected trackers to know the global total count
          interface TrackerTripsInfo {
            trackerId: string;
            bikeName: string;
            trips: any[];
          }
          const allTrackerTrips: TrackerTripsInfo[] = [];
          let totalTripsToSync = 0;

          for (const tracker of selectedTrackers) {
            const trackerId = tracker.trackerId !== undefined ? tracker.trackerId : tracker.id;
            const bikeName = tracker.trackerName || tracker.name || tracker.vehicle?.name || `Moto #${trackerId}`;
            
            // Fetch trips for the period
            const fromStr = startDate.toISOString();
            const toStr = now.toISOString();
            
            send({ step: 'fetching_trips', message: `Récupération de la liste des trajets pour la moto ${bikeName}...` });

            const tripsUrl = `https://api.georide.com/tracker/${trackerId}/trips?from=${encodeURIComponent(fromStr)}&to=${encodeURIComponent(toStr)}`;
            const tripsRes = await fetch(tripsUrl, {
              method: 'GET',
              headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
              },
            });

            if (!tripsRes.ok) {
              console.error(`[GeoRide Sync] Failed to fetch trips for tracker ${trackerId}`);
              send({ step: 'error', message: `Impossible de récupérer les trajets pour la moto ${bikeName}.` });
              continue;
            }

            const trips = await tripsRes.json();
            allTrackerTrips.push({
              trackerId: String(trackerId),
              bikeName,
              trips
            });
            totalTripsToSync += trips.length;
          }

          send({ step: 'trips_found', message: `${totalTripsToSync} trajets à synchroniser au total.` });

          let globalTripIndex = 0;
          for (const info of allTrackerTrips) {
            for (const trip of info.trips) {
              globalTripIndex++;
              const tripStartStr = trip.startTime || trip.startedAt;
              const tripEndStr = trip.endTime || trip.endedAt;
              const tripTitle = trip.title || `Trajet du ${new Date(tripStartStr).toLocaleDateString('fr-FR')}`;

              send({
                step: 'trip_sync',
                message: `Synchronisation (${globalTripIndex}/${totalTripsToSync}) : ${tripTitle}`,
                current: globalTripIndex,
                total: totalTripsToSync
              });

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

              const hasExistingTrip = existingTripResult.docs.length > 0;
              const existingTrip = hasExistingTrip ? existingTripResult.docs[0] : null;

              // Extract coordinates
              let coordinates: [number, number][] = [];
              if (existingTrip && existingTrip.path && Array.isArray(existingTrip.path) && existingTrip.path.length > 2) {
                // If trip already exists with a real coordinate path (more than 2 points), skip positions fetch to optimize performance and prevent rate-limiting
                coordinates = existingTrip.path as [number, number][];
              } else {
                // Add a small delay (150ms) to respect GeoRide API rate limits
                const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
                await sleep(150);

                // Fetch coordinates/positions of the trip
                send({
                  step: 'trip_positions',
                  message: `Téléchargement du tracé GPS pour le trajet du ${new Date(tripStartStr).toLocaleDateString('fr-FR')}...`,
                });

                const positionsUrl = `https://api.georide.com/tracker/${info.trackerId}/trips/positions?from=${encodeURIComponent(tripStartStr)}&to=${encodeURIComponent(tripEndStr)}`;
                const positionsRes = await fetch(positionsUrl, {
                  method: 'GET',
                  headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                  },
                });

                if (positionsRes.ok) {
                  const positionsData = await positionsRes.json();
                  if (Array.isArray(positionsData)) {
                    coordinates = positionsData.map((p: any) => [Number(p.latitude), Number(p.longitude)]);
                  }
                } else {
                  console.error(`[GeoRide Sync] Positions fetch failed with status ${positionsRes.status}`);
                  // Handle 429 Too Many Requests rate-limiting with retry after pause
                  if (positionsRes.status === 429) {
                    send({
                      step: 'trip_positions',
                      message: `Débit GeoRide limité. Pause de sécurité de 2s...`,
                    });
                    await sleep(2000);
                    const retryRes = await fetch(positionsUrl, {
                      method: 'GET',
                      headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json',
                      },
                    });
                    if (retryRes.ok) {
                      const positionsData = await retryRes.json();
                      if (Array.isArray(positionsData)) {
                        coordinates = positionsData.map((p: any) => [Number(p.latitude), Number(p.longitude)]);
                      }
                    }
                  }
                }

                // Fallback start/end markers if positions fetch fails or returns empty
                if (coordinates.length === 0) {
                  if (trip.startLat && trip.startLon && trip.endLat && trip.endLon) {
                    coordinates = [
                      [Number(trip.startLat), Number(trip.startLon)],
                      [Number(trip.endLat), Number(trip.endLon)]
                    ];
                  } else {
                    // Paris center fallback
                    coordinates = [[48.8566, 2.3522]];
                  }
                }
              }

              // Parse distance & duration
              const distanceKm = trip.distance ? parseFloat((trip.distance / 1000).toFixed(2)) : 0; // assuming meters
              const durationMin = trip.duration ? Math.floor(trip.duration / 60000) : 0; // converting milliseconds to minutes

              if (existingTrip) {
                await payloadInstance.update({
                  collection: 'trips',
                  id: existingTrip.id,
                  data: {
                    title: `${info.bikeName} : ${tripTitle}`,
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
                    title: `${info.bikeName} : ${tripTitle}`,
                    startedAt: tripStartStr,
                    endedAt: tripEndStr,
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

        send({
          step: 'done',
          message: `Synchronisation terminée avec succès ! ${newTripsCount} trajets synchronisés.`,
          lastSyncDate: now.toISOString(),
          tripsSynced: newTripsCount,
        });

        controller.close();
      } catch (error: any) {
        console.error('[GeoRide Sync API Error]:', error);
        send({ error: 'Une erreur interne est survenue lors de la synchronisation.' });
        controller.close();
      }
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'application/x-ndjson',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
