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
      console.warn("Auth0 not fully configured or no active session in user settings endpoint.");
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
    const { geoRideEmail, geoRidePassword, trackingStartDate, selectedTrackers } = body;

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

    // 3. Build update data object
    const updateData: any = {};

    if (geoRideEmail) {
      updateData.geoRideEmail = geoRideEmail;
    }
    
    if (geoRidePassword) {
      updateData.geoRidePassword = geoRidePassword; // decrypted automatically encrypted on Users collection hook
    }

    if (trackingStartDate) {
      updateData.trackingStartDate = new Date(trackingStartDate).toISOString();
    }

    if (Array.isArray(selectedTrackers)) {
      // Map string array to selectedTrackers schema: [{ trackerId: string }]
      updateData.selectedTrackers = selectedTrackers.map((id: string) => ({ trackerId: id }));
    }

    // Reset sync date when critical params change to force full history reload from new settings
    if (
      (geoRideEmail && geoRideEmail !== user.geoRideEmail) ||
      geoRidePassword ||
      (trackingStartDate && new Date(trackingStartDate).toISOString() !== user.trackingStartDate)
    ) {
      updateData.lastSyncDate = null;
    }

    // 4. Update the user record
    await payloadInstance.update({
      collection: 'users',
      id: user.id,
      data: updateData,
    });

    return NextResponse.json({
      success: true,
      message: 'Réglages enregistrés avec succès.',
    });
  } catch (error: any) {
    console.error('[GeoRide Settings Update API Error]:', error);
    return NextResponse.json({ error: 'Une erreur interne est survenue lors de l\'enregistrement des réglages.' }, { status: 500 });
  }
}
