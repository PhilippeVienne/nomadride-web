import { NextRequest, NextResponse } from 'next/server';
import { getPayload } from 'payload';
import config from '../../../../../payload.config';
import { auth0 } from '../../../../lib/auth0';

export async function POST(request: NextRequest) {
  try {
    const payloadInstance = await getPayload({ config });

    // 1. Get user session (Auth0 v4)
    let auth0Id: string | undefined;
    try {
      const session = await auth0.getSession(request);
      auth0Id = session?.user?.sub;
    } catch (e) {
      console.warn("Auth0 not fully configured or no active session in user config update.");
    }

    // Fallback for local testing/development
    if (!auth0Id) {
      const url = new URL(request.url);
      auth0Id = url.searchParams.get('userId') || 'auth0|default_local_user_95';
    }

    if (!auth0Id) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    }

    // Parse request body
    const body = await request.json();
    const { geoRideEmail, geoRidePassword } = body;

    // Validate inputs
    if (!geoRideEmail || !geoRidePassword) {
      return NextResponse.json({ error: 'Email et mot de passe requis' }, { status: 400 });
    }

    // 2. Fetch user record in Payload
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

    // 3. Update credentials (will trigger AES-256-GCM beforeChange hook on Users collection)
    await payloadInstance.update({
      collection: 'users',
      id: user.id,
      data: {
        geoRideEmail,
        geoRidePassword,
        lastSyncDate: null, // Reset lastSyncDate to trigger full historical tracking sync next time
      },
    });

    return NextResponse.json({
      success: true,
      message: 'Identifiants GeoRide mis à jour avec succès.',
    });
  } catch (error: any) {
    console.error('[GeoRide Config API Error]:', error);
    return NextResponse.json({ error: 'Une erreur interne est survenue lors de la mise à jour.' }, { status: 500 });
  }
}
