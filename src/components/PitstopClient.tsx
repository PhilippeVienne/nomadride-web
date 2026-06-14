'use client';

import React, { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import {
  RefreshCw,
  Bike,
  Navigation,
  Compass,
  AlertCircle,
  Search,
  MapPin,
  Sliders,
  Menu,
  X,
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
  selectedFuel?: FuelType;
  searchRadius?: number;
  fillSize?: number;
  consumption?: number;
  excludeDistance?: boolean;
  lastSearchQuery?: string;
  lastSearchLat?: number | null;
  lastSearchLng?: number | null;
}

interface PitstopClientProps {
  trips: Trip[];
  user: User;
}

export default function PitstopClient({ trips, user }: PitstopClientProps) {
  const router = useRouter();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Active trip state (for shortcut)
  const [activeTripId, setActiveTripId] = useState<string | null>(null);
  const activeTrip = trips.find(t => t.id === activeTripId);

  // Pit-Stop Module States
  const [searchQuery, setSearchQuery] = useState(user.lastSearchQuery || '');
  const [autocompleteResults, setAutocompleteResults] = useState<{ name: string; lat: number; lon: number }[]>([]);
  const [showAutocomplete, setShowAutocomplete] = useState(false);
  const [searchCenter, setSearchCenter] = useState<[number, number] | null>(
    user.lastSearchLat && user.lastSearchLng ? [user.lastSearchLat, user.lastSearchLng] : null
  );

  // Settings
  const [selectedFuel, setSelectedFuel] = useState<FuelType>(user.selectedFuel || 'sp95');
  const [radius, setRadius] = useState<number>(user.searchRadius || 20);
  const [fillSize, setFillSize] = useState<number>(user.fillSize || 15);
  const [consumption, setConsumption] = useState<number>(user.consumption || 5.0);
  const [excludeDistance, setExcludeDistance] = useState<boolean>(!!user.excludeDistance);

  // Pitstop settings panel (mobile collapsible)
  const [showSettings, setShowSettings] = useState(false);

  // Station results
  const [stations, setStations] = useState<PitStopResponse[]>([]);
  const [activeStationId, setActiveStationId] = useState<string | null>(null);
  const [isSearchingStations, setIsSearchingStations] = useState(false);
  const [stationsError, setStationsError] = useState<string | null>(null);
  const [isLocating, setIsLocating] = useState(false);

  // Autocomplete
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

  // Fetch gas stations
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

  // Save preferences
  useEffect(() => {
    const delayTimer = setTimeout(async () => {
      try {
        const body = {
          selectedFuel,
          searchRadius: radius,
          fillSize,
          consumption,
          excludeDistance,
          lastSearchQuery: searchQuery,
          lastSearchLat: searchCenter ? searchCenter[0] : null,
          lastSearchLng: searchCenter ? searchCenter[1] : null,
        };

        const userIdParam = user.auth0Id ? `?userId=${encodeURIComponent(user.auth0Id)}` : '';
        await fetch(`/api/user/preferences${userIdParam}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
      } catch (err) {
        console.error('Failed to sync search preferences:', err);
      }
    }, 1000);

    return () => clearTimeout(delayTimer);
  }, [selectedFuel, radius, fillSize, consumption, excludeDistance, searchQuery, searchCenter, user.auth0Id]);

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

  return (
    <div className="dashboard-container">
      {/* Top Navbar */}
      <header className="navbar">
        <div className="navbar-brand">
          <Bike size={24} style={{ fill: 'currentColor' }} />
          <span>GeoRide Rider Map</span>
        </div>

        {/* Desktop nav actions */}
        <div className="navbar-actions navbar-actions--desktop">
          <div className="auth-status-container">
            {user.isAuthenticated ? (
              <>
                <span className="auth-badge authenticated">Auth0 Connecté</span>
                <span style={{ color: 'var(--color-text-muted)' }}>|</span>
                <a href="/auth/logout" className="btn-auth btn-auth-logout">Se déconnecter</a>
              </>
            ) : (
              <>
                <span className="auth-badge guest">Mode Invité (Dev)</span>
                <span style={{ color: 'var(--color-text-muted)' }}>|</span>
                <a href="/auth/login" className="btn-auth btn-auth-login">Se connecter avec Auth0</a>
              </>
            )}
            <span style={{ color: 'var(--color-text-muted)' }}>|</span>
            <button
              className="btn-auth btn-auth-login"
              onClick={() => router.push('/settings')}
              style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              Réglages
            </button>
          </div>
        </div>

        {/* Mobile burger — opens the sidebar drawer */}
        <button
          className="navbar-burger"
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          aria-label="Ouvrir le menu"
        >
          {isMobileMenuOpen ? <X size={22} /> : <Menu size={22} />}
        </button>
      </header>

      {/* Mobile sidebar drawer overlay */}
      {isMobileMenuOpen && (
        <div className="mobile-drawer-overlay" onClick={() => setIsMobileMenuOpen(false)} />
      )}

      {/* Main Layout */}
      <main className="dashboard-layout">

        {/* Left Sidebar Panel — also used as mobile drawer */}
        <section className={`sidebar${isMobileMenuOpen ? ' sidebar--open' : ''}`}>

          {/* Mobile drawer close button */}
          <div className="sidebar-drawer-header">
            <span className="sidebar-drawer-title">⛽ Pit-Stop</span>
            <button
              className="sidebar-drawer-close"
              onClick={() => setIsMobileMenuOpen(false)}
            >
              <X size={18} />
            </button>
          </div>

          {/* Navigation Tabs */}
          <div className="sidebar-tabs">
            <div
              className="sidebar-tab"
              onClick={() => { router.push('/'); setIsMobileMenuOpen(false); }}
            >
              🧭 Mon Historique
            </div>
            <div className="sidebar-tab active">
              ⛽ Pit-Stop
            </div>
          </div>


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

          {/* Pit-stop settings — collapsible on mobile */}
          <div className="pitstop-settings-header" onClick={() => setShowSettings(!showSettings)}>
            <Sliders size={14} />
            <span>Paramètres de recherche</span>
            <span className="pitstop-settings-toggle">{showSettings ? '▲' : '▼'}</span>
          </div>

          <div className={`pitstop-settings-grid${showSettings ? ' pitstop-settings-open' : ''}`}>
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
              <input type="checkbox" checked={excludeDistance} readOnly />
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
                  <span>Aucune station localisée. Recherchez un lieu ci-dessus pour lancer l&apos;optimiseur.</span>
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
        </section>

        {/* Right Map Panel */}
        <section className="map-view-panel">
          <div className="map-view-header">
            <h2 className="map-title">⛽ Stations-service</h2>
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
              fitAllTripsTrigger={0}
            />
          </div>
        </section>

      </main>

      {/* Mobile Bottom Navigation */}
      <nav className="mobile-bottom-nav">
        <button
          className="mobile-bottom-nav-item"
          onClick={() => router.push('/')}
        >
          <span className="mobile-nav-icon">🧭</span>
          <span>Historique</span>
        </button>
        <button
          className="mobile-bottom-nav-item"
          onClick={() => setIsMobileMenuOpen(true)}
        >
          <span className="mobile-nav-icon">⛽</span>
          <span>Pit-Stop</span>
        </button>
        <button
          className="mobile-bottom-nav-item"
          onClick={() => router.push('/settings')}
        >
          <span className="mobile-nav-icon">⚙️</span>
          <span>Réglages</span>
        </button>
      </nav>

    </div>
  );
}
