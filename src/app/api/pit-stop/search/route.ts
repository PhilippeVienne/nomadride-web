import { NextRequest, NextResponse } from 'next/server';
import { searchNominatim } from '../../../../lib/pitstop/nominatim';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const query = searchParams.get('q');

    if (!query || !query.trim()) {
      return NextResponse.json([]);
    }

    const results = await searchNominatim(query);

    // Map to simplified data structure for the frontend
    const mappedResults = results.map((item) => ({
      name: item.display_name,
      lat: parseFloat(item.lat),
      lon: parseFloat(item.lon),
    }));

    return NextResponse.json(mappedResults);
  } catch (error) {
    console.error('Error in autocomplete search API:', error);
    return NextResponse.json({ error: 'Failed to process autocomplete search.' }, { status: 500 });
  }
}
