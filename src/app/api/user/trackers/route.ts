import { NextRequest, NextResponse } from 'next/server';
import { getPayload } from 'payload';
import config from '../../../../../payload.config';
import { auth0 } from '../../../../lib/auth0';
import { decrypt } from '../../../../utils/crypto';

export async function GET(request: NextRequest) {
  try {
    const payloadInstance = await getPayload({ config });

    // 1. Get user session (Auth0 v4)
    let auth0Id: string | undefined;
    try {
      const session = await auth0.getSession(request);
      auth0Id = session?.user?.sub;
    } catch (e) {
      console.warn("Auth0 not fully configured or no active session in trackers endpoint.");
    }

    // Fallback for local testing/development
    if (!auth0Id) {
      const url = new URL(request.url);
      auth0Id = url.searchParams.get('userId') || 'auth0|default_local_user_95';
    }

    if (!auth0Id) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    }

    // 2. Fetch user record from Payload database
    const userResult = await payloadInstance.find({
      collection: 'users',
      where: {
        auth0Id: {
          equals: auth0Id,
        },
      },
      limit: 1,
    });

    const user = userResult.docs[0];
    if (!user) {
      return NextResponse.json({ error: 'Utilisateur non trouvé' }, { status: 404 });
    }

    // 3. Mock Check
    const isMock = process.env.MOCK_GEORIDE === 'true';
    if (isMock) {
      // Return a set of mock trackers for testing offline configuration
      return NextResponse.json([
        { id: 'mock_tracker_ktm', name: 'KTM Duke 790' },
        { id: 'mock_tracker_honda', name: 'Honda CRF300L' },
      ]);
    }

    // Real Mode - credentials check
    if (!user.geoRideEmail || !user.geoRidePassword) {
      return NextResponse.json([]); // Return empty list if not connected to GeoRide yet
    }

    // Decrypt password
    const secret = process.env.PAYLOAD_SECRET || 'a_very_secure_local_secret_key_for_payload_development_95';
    const decryptedPassword = decrypt(user.geoRidePassword, secret);

    // 4. Authenticate with GeoRide API
    const loginRes = await fetch('https://api.georide.fr/user/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: user.geoRideEmail,
        password: decryptedPassword,
      }),
    });

    if (!loginRes.ok) {
      return NextResponse.json({ error: 'Erreur d\'authentification GeoRide' }, { status: 401 });
    }

    const loginData = await loginRes.json();
    const token = loginData.authToken || loginData.token;

    if (!token) {
      return NextResponse.json({ error: 'Jeton de connexion GeoRide introuvable' }, { status: 500 });
    }

    // 5. Fetch Trackers
    const trackersRes = await fetch('https://api.georide.fr/user/trackers', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    if (!trackersRes.ok) {
      return NextResponse.json({ error: 'Impossible de récupérer la liste des motos de GeoRide' }, { status: 500 });
    }

    const trackers = await trackersRes.json();

    // Standardize the trackers list
    const formattedTrackers = trackers.map((t: any) => {
      const idVal = t.trackerId !== undefined ? t.trackerId : t.id;
      const nameVal = t.trackerName || t.name || t.vehicle?.name || `Moto #${idVal}`;
      return {
        id: String(idVal),
        name: nameVal,
      };
    });

    return NextResponse.json(formattedTrackers);
  } catch (error: any) {
    console.error('[GeoRide Get Trackers API Error]:', error);
    return NextResponse.json({ error: 'Erreur interne du serveur lors de la récupération des motos.' }, { status: 500 });
  }
}
