import { NextRequest, NextResponse } from 'next/server';
import { getPayload } from 'payload';
import config from '../../../../../payload.config';
import { findUserByGoogleId, resolveGoogleSession } from '../../../../lib/getSessionUser';
import { generateRandomPassword } from '../../../../utils/crypto';

export async function POST(request: NextRequest) {
  try {
    const payloadInstance = await getPayload({ config });

    // 1. Get user session (Google OIDC, with local-dev fallback)
    const { googleId } = await resolveGoogleSession(request);

    // Parse request body
    const body = await request.json();
    const { geoRideEmail, geoRidePassword } = body;

    // Validate inputs
    if (!geoRideEmail || !geoRidePassword) {
      return NextResponse.json({ error: 'Email et mot de passe requis' }, { status: 400 });
    }

    // 2. Fetch user record in Payload
    const userResult = await findUserByGoogleId(payloadInstance, googleId);

    let user = userResult.docs[0];
    if (!user) {
      const sanitizedGoogleId = googleId.replace(/[^a-zA-Z0-9]/g, '_');
      const userEmail = (geoRideEmail && typeof geoRideEmail === 'string' && geoRideEmail.includes('@'))
        ? geoRideEmail.trim()
        : `motard_${sanitizedGoogleId}@example.com`;

      user = await payloadInstance.create({
        collection: 'users',
        data: {
          email: userEmail,
          // Payload requires a password for this auth-enabled collection, but
          // it's never used to log in directly (Google OIDC handles authentication).
          password: generateRandomPassword(),
          googleId,
          geoRideEmail: geoRideEmail,
          geoRidePassword: geoRidePassword,
        },
      });
    } else {
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
    }

    return NextResponse.json({
      success: true,
      message: 'Identifiants GeoRide mis à jour avec succès.',
    });
  } catch (error: any) {
    console.error('[GeoRide Config API Error]:', error);
    return NextResponse.json({ error: 'Une erreur interne est survenue lors de la mise à jour.' }, { status: 500 });
  }
}
