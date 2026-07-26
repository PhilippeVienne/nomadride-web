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
    // Parse request body safely
    let body: any = {};
    try {
      body = await request.json();
    } catch {
      body = {};
    }

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

    let user = userResult.docs[0];
    if (!user) {
      const sanitizedAuth0Id = auth0Id.replace(/[^a-zA-Z0-9]/g, '_');
      const userEmail = (geoRideEmail && typeof geoRideEmail === 'string' && geoRideEmail.includes('@')) 
        ? geoRideEmail.trim() 
        : `motard_${sanitizedAuth0Id}@example.com`;

      user = await payloadInstance.create({
        collection: 'users',
        data: {
          email: userEmail,
          password: 'admin_password_95',
          auth0Id,
          geoRideEmail: (geoRideEmail && typeof geoRideEmail === 'string') ? geoRideEmail.trim() : userEmail,
          geoRidePassword: (geoRidePassword && typeof geoRidePassword === 'string') ? geoRidePassword : 'motard_secret_password_95',
          trackingStartDate: (trackingStartDate && !isNaN(new Date(trackingStartDate).getTime()))
            ? new Date(trackingStartDate).toISOString()
            : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
        },
      });
    }

    // 3. Build update data object safely
    const updateData: any = {};

    if (typeof geoRideEmail === 'string' && geoRideEmail.trim().length > 0) {
      updateData.geoRideEmail = geoRideEmail.trim();
    }
    
    if (typeof geoRidePassword === 'string' && geoRidePassword.trim().length > 0) {
      updateData.geoRidePassword = geoRidePassword;
    }

    let parsedStartDate: string | undefined = undefined;
    if (trackingStartDate && typeof trackingStartDate === 'string' && trackingStartDate.trim() !== '') {
      const d = new Date(trackingStartDate);
      if (!isNaN(d.getTime())) {
        parsedStartDate = d.toISOString();
        updateData.trackingStartDate = parsedStartDate;
      }
    }

    if (Array.isArray(selectedTrackers)) {
      updateData.selectedTrackers = selectedTrackers.map((item: any) => {
        const idStr = typeof item === 'object' && item !== null ? String(item.trackerId || '') : String(item);
        return { trackerId: idStr };
      }).filter((t: any) => t.trackerId.length > 0);
    }

    // Reset sync date when critical params change to force full history reload
    const emailChanged = updateData.geoRideEmail && updateData.geoRideEmail !== user.geoRideEmail;
    const passwordChanged = !!updateData.geoRidePassword;
    const dateChanged = parsedStartDate && parsedStartDate !== user.trackingStartDate;
    if (emailChanged || passwordChanged || dateChanged) {
      updateData.lastSyncDate = null;
    }

    // 4. Update the user record if there are changes to save
    if (Object.keys(updateData).length > 0) {
      await payloadInstance.update({
        collection: 'users',
        id: user.id,
        data: updateData,
      });
    }

    return NextResponse.json({
      success: true,
      message: 'Réglages enregistrés avec succès.',
    });
  } catch (error: any) {
    console.error('[GeoRide Settings Update API Error]:', {
      name: error?.name,
      message: error?.message,
      code: error?.code,
      stack: error?.stack,
      raw: error,
    });
    return NextResponse.json(
      { error: error?.message || 'Une erreur interne est survenue lors de l\'enregistrement des réglages.' },
      { status: 500 }
    );
  }
}
