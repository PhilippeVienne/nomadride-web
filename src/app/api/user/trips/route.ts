import { NextRequest, NextResponse } from 'next/server';
import { getPayload } from 'payload';
import config from '../../../../../payload.config';
import { findUserByGoogleId, resolveGoogleSession } from '../../../../lib/getSessionUser';

export async function DELETE(request: NextRequest) {
  try {
    const payloadInstance = await getPayload({ config });

    // 1. Get user session (Google OIDC, with local-dev fallback)
    const { googleId } = await resolveGoogleSession(request);

    // 2. Fetch user record from Payload database
    const userResult = await findUserByGoogleId(payloadInstance, googleId);

    const user = userResult.docs[0];
    if (!user) {
      return NextResponse.json({ error: 'Utilisateur non trouvé' }, { status: 404 });
    }

    // 3. Delete all trips associated with this user
    await payloadInstance.delete({
      collection: 'trips',
      where: {
        user: {
          equals: user.id,
        },
      },
    });

    // 4. Reset user lastSyncDate to null so next sync will pull fresh history
    await payloadInstance.update({
      collection: 'users',
      id: user.id,
      data: {
        lastSyncDate: null,
      },
    });

    return NextResponse.json({
      success: true,
      message: 'Historique des trajets réinitialisé avec succès.',
    });
  } catch (error: any) {
    console.error('[Delete User Trips API Error]:', error);
    return NextResponse.json({ error: 'Une erreur interne est survenue lors de la réinitialisation des trajets.' }, { status: 500 });
  }
}
