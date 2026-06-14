'use client';

import React, { useEffect } from 'react';
import { MapContainer, TileLayer, Polyline, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Fix Leaflet default marker icons breaking in webpack/nextjs builds
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png',
});

interface Trip {
  id: string;
  title?: string;
  startedAt: string;
  distance?: number;
  duration?: number;
  path: [number, number][];
}

interface MapProps {
  trips: Trip[];
  activeTripId?: string | null;
}

// Custom component to dynamically fit bounds of the map based on paths loaded
function FitBounds({ trips, activeTripId }: { trips: Trip[]; activeTripId?: string | null }) {
  const map = useMap();

  useEffect(() => {
    if (trips.length === 0) return;

    let pathsToFit: [number, number][][] = [];

    if (activeTripId) {
      const activeTrip = trips.find(t => t.id === activeTripId);
      if (activeTrip && activeTrip.path.length > 0) {
        pathsToFit = [activeTrip.path];
      }
    } else {
      pathsToFit = trips.map(t => t.path).filter(p => p.length > 0);
    }

    if (pathsToFit.length > 0) {
      const bounds = L.latLngBounds(pathsToFit.flat());
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 14, animate: true });
    }
  }, [trips, activeTripId, map]);

  return null;
}

export default function Map({ trips, activeTripId }: MapProps) {
  // Center of France by default
  const defaultCenter: [number, number] = [46.2276, 2.2137];
  const defaultZoom = 6;

  // Curated premium color palette for lines
  const colors = [
    '#f97316', // KTM Orange
    '#3b82f6', // Premium Blue
    '#10b981', // Emerald
    '#ec4899', // Pink
    '#8b5cf6', // Violet
    '#06b6d4', // Cyan
  ];

  return (
    <div style={{ height: '100%', width: '100%', minHeight: '450px', borderRadius: '16px', overflow: 'hidden', border: '1px solid rgba(255, 255, 255, 0.1)' }}>
      <MapContainer
        center={defaultCenter}
        zoom={defaultZoom}
        style={{ height: '100%', width: '100%', background: '#1e293b' }}
        scrollWheelZoom={true}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
          url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
        />

        {trips.map((trip, idx) => {
          const isActive = activeTripId === trip.id;
          const color = colors[idx % colors.length];

          if (!trip.path || trip.path.length === 0) return null;

          return (
            <React.Fragment key={trip.id}>
              {/* Start Pin */}
              {isActive && (
                <Marker position={trip.path[0]}>
                  <Popup>
                    <div style={{ fontFamily: 'var(--font-sans)', fontSize: '13px' }}>
                      <strong style={{ color: '#f97316' }}>Départ</strong><br />
                      {trip.title || 'Trajet'}
                    </div>
                  </Popup>
                </Marker>
              )}

              {/* End Pin */}
              {isActive && (
                <Marker position={trip.path[trip.path.length - 1]}>
                  <Popup>
                    <div style={{ fontFamily: 'var(--font-sans)', fontSize: '13px' }}>
                      <strong style={{ color: '#06b6d4' }}>Arrivée</strong><br />
                      {trip.title || 'Trajet'}
                    </div>
                  </Popup>
                </Marker>
              )}

              {/* Polyline representing route */}
              <Polyline
                positions={trip.path}
                pathOptions={{
                  color: isActive ? '#ef4444' : color, // Highlight active in bright red/orange
                  weight: isActive ? 6 : 3.5,
                  opacity: isActive ? 1.0 : 0.5,
                  lineJoin: 'round',
                  lineCap: 'round',
                }}
              >
                <Popup>
                  <div style={{ color: '#0f172a', fontFamily: 'var(--font-sans)', minWidth: '150px' }}>
                    <h4 style={{ margin: '0 0 6px 0', fontSize: '14px', fontWeight: '600' }}>{trip.title || 'Trajet'}</h4>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px' }}>
                      <span>🏁 Distance: <strong>{trip.distance || 0} km</strong></span>
                      <span>⏱️ Durée: <strong>{trip.duration || 0} min</strong></span>
                      <span>📅 Date: <strong>{new Date(trip.startedAt).toLocaleDateString('fr-FR')}</strong></span>
                    </div>
                  </div>
                </Popup>
              </Polyline>
            </React.Fragment>
          );
        })}

        <FitBounds trips={trips} activeTripId={activeTripId} />
      </MapContainer>
    </div>
  );
}
