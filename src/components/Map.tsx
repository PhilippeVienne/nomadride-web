'use client';

import React, { useEffect } from 'react';
import { MapContainer, TileLayer, Polyline, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { FuelType, PitStopResponse } from '../lib/pitstop/types';

// Fix Leaflet default marker icons breaking in webpack/nextjs builds
if (typeof window !== 'undefined') {
  L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon-2x.png',
    iconUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon.png',
    shadowUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png',
  });
}

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
  stations?: PitStopResponse[];
  activeStationId?: string | null;
  selectedFuelType?: FuelType;
  searchCenter?: [number, number] | null;
  onStationSelect?: (id: string | null) => void;
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

// Custom component to fly-to and set center when searchCenter or activeStationId updates
function MapController({
  searchCenter,
  activeStationId,
  stations,
}: {
  searchCenter?: [number, number] | null;
  activeStationId?: string | null;
  stations?: PitStopResponse[];
}) {
  const map = useMap();

  // Handle fly to search center
  useEffect(() => {
    if (searchCenter) {
      map.setView(searchCenter, 13, { animate: true });
    }
  }, [searchCenter, map]);

  // Handle fly to selected station
  useEffect(() => {
    if (activeStationId && stations && stations.length > 0) {
      const station = stations.find((s) => s.id === activeStationId);
      if (station) {
        map.setView([station.latitude, station.longitude], 15, { animate: true });
      }
    }
  }, [activeStationId, stations, map]);

  return null;
}

/**
 * Creates a premium HTML-styled fuel pump marker.
 */
const createFuelIcon = (priceRank: 'cheap' | 'normal' | 'none', label: string, isActive: boolean) => {
  let bgColor = '#f97316'; // KTM orange
  let borderColor = 'rgba(255, 255, 255, 0.8)';
  let scale = isActive ? 'scale(1.15)' : 'scale(1.0)';
  let zIndex = isActive ? 999 : 100;

  if (priceRank === 'cheap') {
    bgColor = '#10b981'; // Emerald green
    borderColor = '#ffffff';
    if (!isActive) zIndex = 200;
  } else if (priceRank === 'none') {
    bgColor = '#64748b'; // Slate gray
    borderColor = 'rgba(255, 255, 255, 0.4)';
    zIndex = 50;
  }

  const shadow = isActive ? 'box-shadow: 0 6px 16px rgba(0, 0, 0, 0.5);' : 'box-shadow: 0 4px 10px rgba(0, 0, 0, 0.3);';

  return L.divIcon({
    className: 'custom-fuel-marker',
    html: `
      <div style="
        background: ${bgColor};
        color: #ffffff;
        border: 2px solid ${borderColor};
        border-radius: 20px;
        padding: 5px 9px;
        font-family: var(--font-sans), sans-serif;
        font-size: 11px;
        font-weight: 700;
        display: flex;
        align-items: center;
        gap: 5px;
        ${shadow}
        white-space: nowrap;
        transform: translate(-50%, -50%) ${scale};
        transform-origin: center center;
        transition: transform 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275);
      ">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M3 22h12M4 2h8M14 22V4a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v18M14 6h4a2 2 0 0 1 2 2v7a2 2 0 0 0 2 2h0M19 5V2"/>
        </svg>
        <span>${label}</span>
      </div>
    `,
    iconSize: [0, 0],
    iconAnchor: [0, 0],
  });
};

export default function Map({
  trips,
  activeTripId,
  stations = [],
  activeStationId = null,
  selectedFuelType = 'sp95',
  searchCenter = null,
  onStationSelect,
}: MapProps) {
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

  // Identify top 3 cheapest stations to color-code them green
  const cheapIds = stations
    .filter((s) => s.prices[selectedFuelType] !== undefined)
    .slice(0, 3)
    .map((s) => s.id);

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

        {/* Trips Polyline & Pins */}
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
                  color: isActive ? '#ef4444' : color,
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

        {/* Search Center Pin */}
        {searchCenter && (
          <Marker
            position={searchCenter}
            icon={L.divIcon({
              className: 'search-center-marker',
              html: `
                <div style="
                  background: rgba(249, 115, 22, 0.2);
                  border: 2px solid var(--accent-orange);
                  width: 32px;
                  height: 32px;
                  border-radius: 50%;
                  display: flex;
                  align-items: center;
                  justify-content: center;
                  animation: pulse-ring 2s infinite;
                  transform: translate(-50%, -50%);
                ">
                  <div style="width: 10px; height: 10px; background: var(--accent-orange); border-radius: 50%;"></div>
                </div>
              `,
              iconSize: [0, 0],
              iconAnchor: [0, 0],
            })}
          >
            <Popup>
              <div style={{ fontFamily: 'var(--font-sans)', fontSize: '13px', color: '#0f172a' }}>
                <strong>Centre de recherche</strong><br />
                Coordonnées : {searchCenter[0].toFixed(5)}, {searchCenter[1].toFixed(5)}
              </div>
            </Popup>
          </Marker>
        )}

        {/* Gas Stations Markers */}
        {stations.map((station) => {
          const price = station.prices[selectedFuelType];
          const hasPrice = price !== undefined;
          
          const label = hasPrice 
            ? `${price.toFixed(2)}${station.currency === 'CHF' ? ' CHF' : '€'}` 
            : 'N/A';

          const priceRank = cheapIds.includes(station.id)
            ? 'cheap'
            : hasPrice ? 'normal' : 'none';

          const isStationActive = activeStationId === station.id;

          return (
            <Marker
              key={`${station.country}_${station.id}`}
              position={[station.latitude, station.longitude]}
              icon={createFuelIcon(priceRank, label, isStationActive)}
              eventHandlers={{
                click: () => {
                  if (onStationSelect) {
                    onStationSelect(station.id);
                  }
                },
              }}
            >
              <Popup>
                <div style={{ color: '#0f172a', fontFamily: 'var(--font-sans)', minWidth: '220px' }}>
                  <h4 style={{ margin: '0 0 4px 0', fontSize: '14px', fontWeight: '600', color: '#1e293b' }}>
                    {station.brand || station.name}
                  </h4>
                  <div style={{ fontSize: '11px', color: '#64748b', marginBottom: '8px' }}>
                    {station.address}, {station.postCode} {station.city} ({station.country})
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '12px', background: '#f8fafc', padding: '10px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>Prix du litre ({selectedFuelType.toUpperCase()}) :</span>
                      <strong style={{ color: priceRank === 'cheap' ? '#10b981' : '#f97316' }}>
                        {hasPrice ? `${price.toFixed(3)} ${station.currency}` : 'Non disponible'}
                      </strong>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>Détour (aller-retour) :</span>
                      <span>{(station.distanceKm * 2).toFixed(1)} km</span>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px dashed #cbd5e1', paddingTop: '4px', marginTop: '2px' }}>
                      <span>Coût du détour :</span>
                      <strong>{hasPrice && station.detourCostEur !== null && station.detourCostEur !== undefined ? (station.currency === 'CHF' ? `${(station.detourCostEur * 1.05).toFixed(2)} CHF` : `${station.detourCostEur.toFixed(2)} €`) : '—'}</strong>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>Coût plein carburant :</span>
                      <span>{hasPrice && station.totalFuelCostEur !== null && station.totalFuelCostEur !== undefined ? (station.currency === 'CHF' ? `${(station.totalFuelCostEur * 1.05).toFixed(2)} CHF` : `${station.totalFuelCostEur.toFixed(2)} €`) : '—'}</span>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #cbd5e1', paddingTop: '4px', fontWeight: 'bold' }}>
                      <span>Coût effectif total :</span>
                      <strong style={{ color: priceRank === 'cheap' ? '#10b981' : '#0f172a' }}>
                        {hasPrice ? `${station.totalCostOriginalCurrency.toFixed(2)} ${station.currency}` : 'N/A'}
                      </strong>
                    </div>
                  </div>

                  {station.freshnessPenaltyEur > 0 && (
                    <div style={{ fontSize: '10px', color: '#b45309', background: '#fffbeb', padding: '6px 8px', borderRadius: '6px', border: '1px solid #fef3c7', marginTop: '6px', display: 'flex', gap: '4px' }}>
                      <span>⚠️ Pénalité fraîcheur de <strong>{station.freshnessPenaltyEur.toFixed(3)} €/L</strong> (+12h sans MAJ)</span>
                    </div>
                  )}

                  <div style={{ fontSize: '10px', color: '#64748b', textAlign: 'right', marginTop: '6px' }}>
                    Mis à jour : {new Date(station.updatedAt).toLocaleString('fr-FR')}
                  </div>
                </div>
              </Popup>
            </Marker>
          );
        })}

        <FitBounds trips={trips} activeTripId={activeTripId} />
        
        <MapController
          searchCenter={searchCenter}
          activeStationId={activeStationId}
          stations={stations}
        />
      </MapContainer>
    </div>
  );
}
