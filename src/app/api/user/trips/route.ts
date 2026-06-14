import { NextRequest, NextResponse } from 'next/server';
import { getPayload } from 'payload';
import config from '../../../../../payload.config';
import { auth0 } from '../../../../lib/auth0';

export async function DELETE(request: NextRequest) {
  try {
    const payloadInstance = await getPayload({ config });

    // 1. Get user session (Auth0 v4)
    let auth0Id: string | undefined;
    try {
      const session = await auth0.getSession(request);
      auth0Id = session?.user?.sub;
    } catch (e) {
      console.warn("Auth0 not fully configured or no active session in trips delete endpoint.");
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
