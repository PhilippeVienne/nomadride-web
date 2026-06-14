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
      console.warn("Auth0 not fully configured or no active session in user preferences endpoint.");
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
