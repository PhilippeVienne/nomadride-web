'use client';

import React, { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import {
  RefreshCw,
  Bike,
  Clock,
  Navigation,
  Compass,
  AlertCircle,
  Search,
  MapPin,
  Sliders,
  Sparkles,
} from 'lucide-react';
import '../app/dashboard.css';
import { FuelType, PitStopResponse } from '../lib/pitstop/types';

// Dynamically import the Map component with SSR disabled
const Map = dynamic(() => import('./Map'), {
  ssr: false,
  loading: () => (
    <div style={{
      height: '100%',
      width: '100%',
      minHeight: '450px',
      background: '#1e293b',
      borderRadius: '16px',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      color: '#94a3b8',
      gap: '12px',
      border: '1px solid rgba(255, 255, 255, 0.08)'
    }}>
      <Compass className="spinner" size={36} style={{ color: '#f97316' }} />
      <span>Chargement de la carte interactive...</span>
    </div>
  )
});

interface Trip {
  id: string;
  title?: string;
  startedAt: string;
  endedAt: string;
  distance?: number;
  duration?: number;
  path: [number, number][];
}

interface User {
  id: string;
  geoRideEmail?: string;
  lastSyncDate?: string;
  auth0Id?: string;
  isAuthenticated?: boolean;
}

interface DashboardClientProps {
  initialTrips: Trip[];
  user: User;
}

export default function DashboardClient({ initialTrips, user }: DashboardClientProps) {
  const router = useRouter();
  
  // Existing Trips States
  const [activeTripId, setActiveTripId] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [syncProgress, setSyncProgress] = useState<{ current: number; total: number } | null>(null);

  // Tab Navigation State
  const [activeTab, setActiveTab] = useState<'trips' | 'pitstop'>('trips');

  // Pit-Stop Module States
  const [searchQuery, setSearchQuery] = useState('');
  const [autocompleteResults, setAutocompleteResults] = useState<{ name: string; lat: number; lon: number }[]>([]);
  const [showAutocomplete, setShowAutocomplete] = useState(false);
  const [searchCenter, setSearchCenter] = useState<[number, number] | null>(null);
  
  // Trip Settings
  const [selectedFuel, setSelectedFuel] = useState<FuelType>('sp95');
  const [radius, setRadius] = useState<number>(20);
  const [fillSize, setFillSize] = useState<number>(15);
  const [consumption, setConsumption] = useState<number>(5.0);
  const [excludeDistance, setExcludeDistance] = useState<boolean>(false);

  // Station Fetch Results
  const [stations, setStations] = useState<PitStopResponse[]>([]);
  const [activeStationId, setActiveStationId] = useState<string | null>(null);
  const [isSearchingStations, setIsSearchingStations] = useState(false);
  const [stationsError, setStationsError] = useState<string | null>(null);
  const [isLocating, setIsLocating] = useState(false);
  const [fitAllTripsTrigger, setFitAllTripsTrigger] = useState(0);

  // Filter out doubtful/fallback trips (path length <= 2)
  const trips = initialTrips.filter(t => t.path && t.path.length > 2);
  const activeTrip = trips.find(t => t.id === activeTripId);

  const isDefaultLocalEmail = !user.geoRideEmail || user.geoRideEmail.startsWith('motard_auth0_') || user.geoRideEmail === 'motard@example.com';

  // Compute overall stats
  const totalKm = trips.reduce((acc, t) => acc + (t.distance || 0), 0);
  const totalMinutes = trips.reduce((acc, t) => acc + (t.duration || 0), 0);
  
  // Format total duration (hours & minutes)
  const totalHours = Math.floor(totalMinutes / 60);
  const remainingMinutes = totalMinutes % 60;
  const formattedDuration = totalHours > 0 
    ? `${totalHours}h ${remainingMinutes}m`
    : `${remainingMinutes} min`;

  // Fetch autocompletion queries from Nominatim endpoint
  useEffect(() => {
    if (
      !searchQuery ||
      searchQuery.trim().length < 3 ||
      searchQuery.startsWith('Trajet :') ||
      searchQuery === 'Ma Position'
    ) {
      setAutocompleteResults([]);
      setShowAutocomplete(false);
      return;
    }

    const delayDebounce = setTimeout(async () => {
      try {
        const res = await fetch(`/api/pit-stop/search?q=${encodeURIComponent(searchQuery)}`);
        if (res.ok) {
          const data = await res.json();
          setAutocompleteResults(data);
          setShowAutocomplete(data.length > 0);
        }
      } catch (error) {
        console.error('Error during autocompletion lookup:', error);
      }
    }, 450);

    return () => clearTimeout(delayDebounce);
  }, [searchQuery]);

  // Fetch gas stations whenever coordinates or settings modify
  const fetchStations = async (lat: number, lon: number) => {
    setIsSearchingStations(true);
    setStationsError(null);
    try {
      const params = new URLSearchParams({
        lat: String(lat),
        lng: String(lon),
        radius: String(radius),
        fuel: selectedFuel,
        fillSize: String(fillSize),
        consumption: String(consumption),
        excludeDistance: String(excludeDistance),
      });

      const res = await fetch(`/api/pit-stop/stations?${params.toString()}`);
      if (!res.ok) {
        const errPayload = await res.json();
        throw new Error(errPayload.error || 'Erreur lors de la recherche des stations.');
      }
      const data = (await res.json()) as PitStopResponse[];
      setStations(data);
    } catch (err: any) {
      console.error(err);
      setStationsError(err.message || 'Impossible de se connecter au service des carburants.');
    } finally {
      setIsSearchingStations(false);
    }
  };

  useEffect(() => {
    if (searchCenter) {
      fetchStations(searchCenter[0], searchCenter[1]);
    }
  }, [searchCenter, selectedFuel, radius, fillSize, consumption, excludeDistance]);

  const handleSelectAutocomplete = (item: { name: string; lat: number; lon: number }) => {
    setSearchQuery(item.name);
    setSearchCenter([item.lat, item.lon]);
    setShowAutocomplete(false);
  };

  const handleSearchOnActiveTrip = () => {
    if (activeTrip && activeTrip.path.length > 0) {
      const midIdx = Math.floor(activeTrip.path.length / 2);
      const midpoint = activeTrip.path[midIdx];
      setSearchCenter(midpoint);
      setSearchQuery(`Trajet : ${activeTrip.title || 'Ride Actif'}`);
      setShowAutocomplete(false);
    }
  };

  const handleGeolocate = () => {
    if (!navigator.geolocation) {
      alert("La géolocalisation n'est pas supportée par votre navigateur.");
      return;
    }
    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        setSearchCenter([latitude, longitude]);
        setSearchQuery("Ma Position");
        setShowAutocomplete(false);
        setIsLocating(false);
      },
      (error) => {
        console.error("Geolocation error:", error);
        alert("Impossible d'obtenir votre position. Assurez-vous d'avoir autorisé l'accès à la localisation dans votre navigateur.");
        setIsLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };

  // Trigger sync via API Route
  const handleSync = async () => {
    setIsSyncing(true);
    setSyncMessage(null);
    setSyncError(null);
    setSyncProgress(null);

    try {
      const userIdParam = user.auth0Id ? `?userId=${encodeURIComponent(user.auth0Id)}` : '';
      const res = await fetch(`/api/sync-georide${userIdParam}`, {
        method: 'POST',
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Erreur lors de la synchronisation');
      }

      const reader = res.body?.getReader();
      if (!reader) {
        throw new Error('Impossible de lire le flux de progression du serveur.');
      }

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const data = JSON.parse(line);
            if (data.error) {
              throw new Error(data.error);
            }
            if (data.message) {
              setSyncMessage(data.message);
            }
            if (data.current !== undefined && data.total !== undefined) {
              setSyncProgress({ current: data.current, total: data.total });
            }
            if (data.step === 'done') {
              router.refresh();
            }
          } catch (e: any) {
            if (e.message && !e.message.includes('JSON')) {
              throw e;
            }
          }
        }
      }
    } catch (err: any) {
      console.error(err);
      setSyncError(err.message || 'Impossible de se connecter à la synchronisation GeoRide.');
      setSyncMessage(null);
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <div className="dashboard-container">
      {/* Top Navbar */}
      <header className="navbar">
        <div className="navbar-brand">
          <Bike size={24} style={{ fill: 'currentColor' }} />
          <span>GeoRide Rider Map</span>
        </div>
        
        <div className="navbar-actions">
          <div className="auth-status-container">
            {user.isAuthenticated ? (
              <>
                <span className="auth-badge authenticated">Auth0 Connecté</span>
                <span style={{ color: 'var(--color-text-muted)' }}>|</span>
                <a href="/auth/logout" className="btn-auth btn-auth-logout">
                  Se déconnecter
                </a>
              </>
            ) : (
              <>
                <span className="auth-badge guest">Mode Invité (Dev)</span>
                <span style={{ color: 'var(--color-text-muted)' }}>|</span>
                <a href="/auth/login" className="btn-auth btn-auth-login">
                  Se connecter avec Auth0
                </a>
              </>
            )}
            <span style={{ color: 'var(--color-text-muted)' }}>|</span>
            <button className="btn-auth btn-auth-login" onClick={() => router.push('/settings')} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              Réglages
            </button>
          </div>
        </div>
      </header>

      {/* Main Layout */}
      <main className="dashboard-layout">
        
        {/* Left Sidebar Panel */}
        <section className="sidebar">
          
          {/* Navigation Tabs */}
          <div className="sidebar-tabs">
            <div
              className={`sidebar-tab ${activeTab === 'trips' ? 'active' : ''}`}
              onClick={() => setActiveTab('trips')}
            >
              🧭 Mon Historique
            </div>
            <div
              className={`sidebar-tab ${activeTab === 'pitstop' ? 'active' : ''}`}
              onClick={() => setActiveTab('pitstop')}
            >
              ⛽ Pit-Stop
            </div>
          </div>

          {/* Conditional sidebar rendering */}
          {activeTab === 'trips' ? (
            <>
              {/* Dashboard Stats */}
              <div className="stats-grid">
                <div className="stat-card">
                  <div className="stat-icon-wrapper" style={{ background: 'rgba(249, 115, 22, 0.1)', color: 'var(--accent-orange)' }}>
                    <Navigation size={18} />
                  </div>
                  <span className="stat-value">{totalKm.toFixed(1)}</span>
                  <span className="stat-label">KM Totaux</span>
                </div>
                
                <div className="stat-card">
                  <div className="stat-icon-wrapper" style={{ background: 'rgba(6, 182, 212, 0.1)', color: 'var(--accent-cyan)' }}>
                    <Clock size={18} />
                  </div>
                  <span className="stat-value" style={{ fontSize: '14px', paddingTop: '4px' }}>{formattedDuration}</span>
                  <span className="stat-label">Temps Route</span>
                </div>

                <div className="stat-card">
                  <div className="stat-icon-wrapper" style={{ background: 'rgba(139, 92, 246, 0.1)', color: 'var(--accent-purple)' }}>
                    <Bike size={18} />
                  </div>
                  <span className="stat-value">{trips.length}</span>
                  <span className="stat-label">Trajets</span>
                </div>
              </div>

              {/* Sync Trigger Section */}
              <button 
                className="btn-sync" 
                onClick={handleSync}
                disabled={isSyncing}
              >
                <RefreshCw size={16} className={isSyncing ? 'spinner' : ''} />
                {isSyncing ? 'Synchronisation...' : 'Synchroniser mes trajets'}
              </button>

              {user.lastSyncDate && (
                <div className="sync-status-indicator">
                  Dernière synchro: {new Date(user.lastSyncDate).toLocaleString('fr-FR')}
                </div>
              )}

              {/* Success / Error Feedbacks */}
              {syncMessage && (
                <div style={{ 
                  color: isSyncing ? 'var(--accent-orange)' : 'var(--accent-green)', 
                  fontSize: '13px', 
                  background: isSyncing ? 'rgba(249, 115, 22, 0.1)' : 'rgba(16, 185, 129, 0.1)', 
                  padding: '12px', 
                  borderRadius: '8px', 
                  display: 'flex', 
                  flexDirection: 'column',
                  gap: '8px'
                }}>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    {isSyncing ? (
                      <RefreshCw size={14} className="spinner" style={{ color: 'var(--accent-orange)' }} />
                    ) : (
                      <span>✓</span>
                    )}
                    <span>{syncMessage}</span>
                  </div>
                  
                  {isSyncing && syncProgress && syncProgress.total > 0 && (
                    <div style={{ width: '100%', marginTop: '4px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--color-text-secondary)', marginBottom: '4px' }}>
                        <span>Progression</span>
                        <span>{syncProgress.current} / {syncProgress.total} ({Math.round((syncProgress.current / syncProgress.total) * 100)}%)</span>
                      </div>
                      <div style={{ width: '100%', height: '6px', background: 'rgba(255, 255, 255, 0.1)', borderRadius: '3px', overflow: 'hidden' }}>
                        <div style={{ 
                          width: `${(syncProgress.current / syncProgress.total) * 100}%`, 
                          height: '100%', 
                          background: 'linear-gradient(90deg, #f97316, #fb923c)', 
                          borderRadius: '3px',
                          transition: 'width 0.4s cubic-bezier(0.4, 0, 0.2, 1)' 
                        }} />
                      </div>
                    </div>
                  )}
                </div>
              )}

              {syncError && (
                <div style={{ color: '#ef4444', fontSize: '13px', background: 'rgba(239, 68, 68, 0.1)', padding: '12px', borderRadius: '8px', display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <AlertCircle size={16} />
                  <span>{syncError}</span>
                </div>
              )}

              {/* Credentials Summary */}
              <div className="creds-container">
                <div className="creds-status-card" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '10px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <span className="creds-label">Compte GeoRide connecté :</span>
                    <span className="creds-email">{isDefaultLocalEmail ? 'Non configuré' : user.geoRideEmail}</span>
                  </div>
                  <button 
                    className="btn-creds-edit" 
                    onClick={() => router.push('/settings')}
                    style={{ width: '100%', textAlign: 'center' }}
                  >
                    Gérer mes réglages
                  </button>
                </div>
              </div>

              <hr style={{ border: 'none', borderTop: '1px solid var(--color-border)' }} />

              {/* Trips List */}
              <div>
                <h3 className="trips-section-title">Historique des Trajets</h3>
                <div className="trips-list-container">
                  {trips.length === 0 ? (
                    <div className="empty-trips-placeholder">
                      <Compass size={32} />
                      <span>Aucun trajet synchronisé. Cliquez sur "Synchroniser" ci-dessus pour charger l'historique GeoRide.</span>
                    </div>
                  ) : (
                    trips.map(trip => {
                      const isActive = activeTripId === trip.id;
                      const tripDate = new Date(trip.startedAt).toLocaleDateString('fr-FR');
                      
                      return (
                        <div 
                          key={trip.id} 
                          className={`trip-item-card ${isActive ? 'active' : ''}`}
                          onClick={() => setActiveTripId(isActive ? null : trip.id)}
                        >
                          <div className="trip-item-header">
                            <span className="trip-item-title">{trip.title || 'Trajet Moto'}</span>
                            <span className="trip-item-date">{tripDate}</span>
                          </div>
                          <div className="trip-item-stats">
                            <span className="trip-stat-pill">🏁 {trip.distance || 0} km</span>
                            <span className="trip-stat-pill">⏱️ {trip.duration || 0} min</span>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </>
          ) : (
            /* Tab 2: Pit-Stop Module */
            <>
              {/* Search Container */}
              <div className="input-group">
                <label htmlFor="station-search">Localisation de recherche</label>
                <div className="autocomplete-container">
                  <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                    <input
                      id="station-search"
                      type="text"
                      placeholder="Rechercher une ville, adresse..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      style={{ width: '100%', paddingLeft: '36px', paddingRight: '36px' }}
                    />
                    <Search size={16} style={{ position: 'absolute', left: '12px', color: 'var(--color-text-muted)' }} />
                    <button
                      type="button"
                      onClick={handleGeolocate}
                      disabled={isLocating}
                      style={{
                        position: 'absolute',
                        right: '12px',
                        background: 'none',
                        border: 'none',
                        color: isLocating ? 'var(--accent-orange)' : 'var(--color-text-secondary)',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: 0
                      }}
                      title="Utiliser ma position actuelle"
                    >
                      <Navigation 
                        size={16} 
                        className={isLocating ? 'spinner' : ''} 
                        style={{ transform: isLocating ? 'none' : 'rotate(45deg)', transition: 'color 0.2s' }} 
                      />
                    </button>
                  </div>

                  {showAutocomplete && (
                    <div className="autocomplete-dropdown">
                      {autocompleteResults.map((item, idx) => (
                        <div
                          key={idx}
                          className="autocomplete-item"
                          onClick={() => handleSelectAutocomplete(item)}
                        >
                          <strong>{item.name.split(',')[0]}</strong>
                          <span style={{ fontSize: '10px', color: 'var(--color-text-muted)' }}>
                            {item.name.split(',').slice(1).join(',')}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Shortcut: Search on active trip midpoint */}
              {activeTrip && (
                <button
                  type="button"
                  className="btn-shortcut-search"
                  onClick={handleSearchOnActiveTrip}
                >
                  <MapPin size={13} />
                  <span>Chercher sur le trajet actif : {activeTrip.title || 'Trajet'}</span>
                </button>
              )}

              {/* Pit-stop settings grid */}
              <div className="pitstop-settings-grid">
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <span style={{ fontSize: '11px', color: 'var(--color-text-secondary)', fontWeight: '500' }}>
                    Type de Carburant
                  </span>
                  <div className="fuel-selector-pills">
                    {(['sp95', 'sp98', 'e10', 'gazole'] as FuelType[]).map((f) => (
                      <div
                        key={f}
                        className={`fuel-pill ${selectedFuel === f ? 'active' : ''}`}
                        onClick={() => setSelectedFuel(f)}
                      >
                        {f.toUpperCase()}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Radius Slider */}
                <div className="range-slider-group">
                  <div className="range-slider-header">
                    <span>Rayon de recherche</span>
                    <strong>{radius} km</strong>
                  </div>
                  <input
                    type="range"
                    min="2"
                    max="50"
                    step="1"
                    className="range-slider-input"
                    value={radius}
                    onChange={(e) => setRadius(parseInt(e.target.value))}
                  />
                </div>

                {/* Fill Size Slider */}
                <div className="range-slider-group">
                  <div className="range-slider-header">
                    <span>Volume à remplir</span>
                    <strong>{fillSize} L</strong>
                  </div>
                  <input
                    type="range"
                    min="5"
                    max="40"
                    step="1"
                    className="range-slider-input"
                    value={fillSize}
                    onChange={(e) => setFillSize(parseInt(e.target.value))}
                  />
                </div>

                {/* Consumption Slider */}
                <div className="range-slider-group">
                  <div className="range-slider-header">
                    <span>Consommation moto</span>
                    <strong>{consumption.toFixed(1)} L/100km</strong>
                  </div>
                  <input
                    type="range"
                    min="3.0"
                    max="10.0"
                    step="0.1"
                    className="range-slider-input"
                    value={consumption}
                    onChange={(e) => setConsumption(parseFloat(e.target.value))}
                  />
                </div>

                {/* Detour Omission Checkbox */}
                <div className="checkbox-group" onClick={() => setExcludeDistance(!excludeDistance)}>
                  <input
                    type="checkbox"
                    checked={excludeDistance}
                    readOnly
                  />
                  <span>Exclure le coût du détour</span>
                </div>
              </div>

              {/* Station results list */}
              <div>
                <h3 className="trips-section-title" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                  <span>Stations à proximité ({stations.length})</span>
                  {isSearchingStations && (
                    <RefreshCw size={12} className="spinner" style={{ color: 'var(--accent-orange)', marginLeft: 'auto' }} />
                  )}
                </h3>

                <div className="station-list">
                  {isSearchingStations && stations.length === 0 ? (
                    <div className="empty-trips-placeholder">
                      <RefreshCw size={24} className="spinner" style={{ color: 'var(--accent-orange)' }} />
                      <span>Recherche des meilleurs prix...</span>
                    </div>
                  ) : stationsError ? (
                    <div style={{ color: '#ef4444', fontSize: '13px', background: 'rgba(239, 68, 68, 0.1)', padding: '12px', borderRadius: '8px', display: 'flex', gap: '8px', alignItems: 'center' }}>
                      <AlertCircle size={16} />
                      <span>{stationsError}</span>
                    </div>
                  ) : stations.length === 0 ? (
                    <div className="empty-trips-placeholder">
                      <MapPin size={32} />
                      <span>Aucune station localisée. Recherchez un lieu ci-dessus pour lancer l'optimiseur.</span>
                    </div>
                  ) : (
                    stations.map((station, idx) => {
                      const isActive = activeStationId === station.id;
                      const isCheapest = idx < 3 && station.prices[selectedFuel] !== undefined;
                      const price = station.prices[selectedFuel];

                      return (
                        <div
                          key={`${station.country}_${station.id}`}
                          className={`station-item-card ${isActive ? 'active' : ''} ${isCheapest ? 'cheap-highlight' : ''}`}
                          onClick={() => {
                            setActiveStationId(isActive ? null : station.id);
                          }}
                        >
                          <div className="station-item-header">
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                              {isCheapest && (
                                <span className="station-badge-cheapest">
                                  ★ Offre N°{idx + 1}
                                </span>
                              )}
                              <span className="station-item-title">{station.brand || station.name}</span>
                            </div>
                            <span style={{ fontSize: '11px', fontWeight: 'bold', color: 'var(--color-text-secondary)' }}>
                              {(station.distanceKm).toFixed(1)} km
                            </span>
                          </div>

                          <div className="station-item-meta">
                            {station.address}, {station.postCode} {station.city}
                          </div>

                          <div className="station-price-box">
                            <div>
                              <span className="station-price-liter">
                                {price !== undefined ? `${price.toFixed(3)} ` : '— '}
                              </span>
                              <span style={{ fontSize: '10px', color: 'var(--color-text-muted)' }}>
                                {station.currency}/L
                              </span>
                            </div>
                            <div className="station-price-total">
                              Total : <strong>{price !== undefined && station.totalCostOriginalCurrency !== null ? `${station.totalCostOriginalCurrency.toFixed(2)} ${station.currency}` : '—'}</strong>
                            </div>
                          </div>

                          {station.freshnessPenaltyEur > 0 && (
                            <div style={{ fontSize: '10px', color: '#b45309', marginTop: '2px' }}>
                              ⚠️ Prix obsolète (+{station.freshnessPenaltyEur.toFixed(3)}€/L pénalité)
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </>
          )}
        </section>

        {/* Right Map Panel Section */}
        <section className="map-view-panel">
          <div className="map-view-header">
            <h2 className="map-title">Carte interactive des rides</h2>
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
              {activeTripId && (
                <span style={{ fontSize: '13px', background: 'rgba(249, 115, 22, 0.15)', color: 'var(--accent-orange)', padding: '4px 10px', borderRadius: '12px', fontWeight: '500' }}>
                  Tracé actif zoomé
                </span>
              )}
              {trips.length > 0 && (
                <button
                  type="button"
                  onClick={() => setFitAllTripsTrigger((prev) => prev + 1)}
                  className="btn-creds-edit"
                  style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '4px 10px', fontSize: '12px' }}
                  title="Ajuster la carte pour afficher tous vos trajets"
                >
                  <Compass size={14} />
                  <span>Ajuster la vue</span>
                </button>
              )}
            </div>
          </div>
          
          <div className="map-container-wrapper">
            <Map 
              trips={trips} 
              activeTripId={activeTripId} 
              stations={stations}
              activeStationId={activeStationId}
              selectedFuelType={selectedFuel}
              searchCenter={searchCenter}
              onStationSelect={setActiveStationId}
              fitAllTripsTrigger={fitAllTripsTrigger}
            />
          </div>
        </section>
        
      </main>
    </div>
  );
}
