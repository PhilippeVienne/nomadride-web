import { NextRequest, NextResponse } from 'next/server';
import { getPayload } from 'payload';
import config from '../../../../../payload.config';
import { getOrCreateUser, resolveGoogleSession } from '../../../../lib/getSessionUser';

export async function POST(request: NextRequest) {
  try {
    const payloadInstance = await getPayload({ config });

    // 1. Get user session (Google OIDC, with local-dev fallback)
    const { googleId, googleEmail } = await resolveGoogleSession(request);

    // Parse request body
    const body = await request.json();
    const {
      selectedFuel,
      searchRadius,
      fillSize,
      consumption,
      excludeDistance,
      lastSearchQuery,
      lastSearchLat,
      lastSearchLng,
    } = body;

    // 2. Fetch or create the user record in Payload
    const user = await getOrCreateUser(payloadInstance, googleId, googleEmail);

    // 3. Build update data object
    const updateData: any = {};
    if (selectedFuel !== undefined) updateData.selectedFuel = selectedFuel;
    if (searchRadius !== undefined) updateData.searchRadius = searchRadius;
    if (fillSize !== undefined) updateData.fillSize = fillSize;
    if (consumption !== undefined) updateData.consumption = consumption;
    if (excludeDistance !== undefined) updateData.excludeDistance = excludeDistance;
    if (lastSearchQuery !== undefined) updateData.lastSearchQuery = lastSearchQuery;
    
    // Explicitly allow updating search center coordinates
    if (lastSearchLat !== undefined) updateData.lastSearchLat = lastSearchLat;
    if (lastSearchLng !== undefined) updateData.lastSearchLng = lastSearchLng;

    // 4. Update the user record
    await payloadInstance.update({
      collection: 'users',
      id: user.id,
      data: updateData,
    });

    return NextResponse.json({
      success: true,
      message: 'Préférences de recherche enregistrées avec succès.',
    });
  } catch (error: any) {
    console.error('[GeoRide Preferences Update API Error]:', error);
    return NextResponse.json({ error: 'Une erreur interne est survenue lors de l\'enregistrement des préférences.' }, { status: 500 });
  }
}
