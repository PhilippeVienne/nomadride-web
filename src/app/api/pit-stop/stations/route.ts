import { NextRequest, NextResponse } from 'next/server';
import { getStationsAround } from '../../../../lib/pitstop/providers';
import { FuelType } from '../../../../lib/pitstop/types';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);

    const latStr = searchParams.get('lat');
    const lngStr = searchParams.get('lng');
    const radiusStr = searchParams.get('radius');
    const fuel = searchParams.get('fuel') as FuelType;
    
    const fillSizeStr = searchParams.get('fillSize');
    const consumptionStr = searchParams.get('consumption');
    const excludeDistance = searchParams.get('excludeDistance') === 'true';

    // 1. Validate required parameters
    if (!latStr || !lngStr || !radiusStr || !fuel) {
      return NextResponse.json(
        { error: 'Missing required parameters. lat, lng, radius, and fuel are required.' },
        { status: 400 }
      );
    }

    const lat = parseFloat(latStr);
    const lng = parseFloat(lngStr);
    const radius = parseFloat(radiusStr);
    const fillSize = fillSizeStr ? parseFloat(fillSizeStr) : 15;
    const consumption = consumptionStr ? parseFloat(consumptionStr) : 5.0;

    // 2. Validate input ranges to prevent bad input or code exploitation
    if (isNaN(lat) || lat < -90 || lat > 90) {
      return NextResponse.json({ error: 'Latitude must be a valid number between -90 and 90.' }, { status: 400 });
    }
    if (isNaN(lng) || lng < -180 || lng > 180) {
      return NextResponse.json({ error: 'Longitude must be a valid number between -180 and 180.' }, { status: 400 });
    }
    if (isNaN(radius) || radius <= 0 || radius > 100) {
      return NextResponse.json({ error: 'Radius must be a number between 0 and 100 km.' }, { status: 400 });
    }
    if (!['sp95', 'sp98', 'e10', 'gazole'].includes(fuel)) {
      return NextResponse.json({ error: 'Fuel type must be sp95, sp98, e10, or gazole.' }, { status: 400 });
    }
    if (isNaN(fillSize) || fillSize <= 0 || fillSize > 200) {
      return NextResponse.json({ error: 'Fill size must be a number between 0 and 200 liters.' }, { status: 400 });
    }
    if (isNaN(consumption) || consumption <= 0 || consumption > 30) {
      return NextResponse.json({ error: 'Consumption must be a number between 0 and 30 L/100km.' }, { status: 400 });
    }

    // 3. Fetch coordinated results
    const stations = await getStationsAround(lat, lng, radius, fuel, {
      fillSize,
      consumption,
      excludeDistance,
    });

    return NextResponse.json(stations);
  } catch (error: any) {
    console.error('Error in /api/pit-stop/stations:', error);
    return NextResponse.json({ error: 'Failed to process fuel stations search.' }, { status: 500 });
  }
}
