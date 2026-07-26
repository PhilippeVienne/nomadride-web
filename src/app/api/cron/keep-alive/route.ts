import { NextResponse } from 'next/server';
import { getPayload } from 'payload';
import config from '../../../../../payload.config';

export async function GET() {
  try {
    const payload = await getPayload({ config });
    
    // Execute a minimal query on users collection to keep Supabase Postgres database active
    await payload.find({
      collection: 'users',
      limit: 1,
    });

    return NextResponse.json({
      status: 'ok',
      message: 'Supabase keep-alive ping succeeded.',
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('[Keep-Alive Cron Error]:', error);
    return NextResponse.json(
      { status: 'error', message: error?.message || 'Keep-alive query failed' },
      { status: 500 }
    );
  }
}
