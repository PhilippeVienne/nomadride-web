'use client';

import React, { useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import {
  RefreshCw,
  Bike,
  Clock,
  Navigation,
  Compass,
  AlertCircle,
  Menu,
  X,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import '../app/dashboard.css';
import { FuelType } from '../lib/pitstop/types';

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
  googleId?: string;
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

interface DashboardClientProps {
  initialTrips: Trip[];
  user: User;
}

/** Formats a duration in minutes as "Xh Ym" (or "Ym" under an hour). */
function formatMinutes(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = Math.round(totalMinutes % 60);
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes} min`;
}

/**
 * Derives per-trip stats from the fields we actually store (distance,
 * duration, start/end timestamps, GPS point count). Deliberately does not
 * attempt a "max speed" — the stored path has no per-point timestamps, so
 * any such figure would be fabricated rather than measured.
 */
function getTripStats(trip: Trip) {
  const start = new Date(trip.startedAt);
  const end = new Date(trip.endedAt);
  const distanceKm = trip.distance || 0;
  const durationMin = trip.duration || 0;
  const avgSpeedKmh = durationMin > 0 ? distanceKm / (durationMin / 60) : 0;

  return {
    dateLabel: start.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }),
    startLabel: start.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
    endLabel: end.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
    durationLabel: formatMinutes(durationMin),
    avgSpeedKmh,
    pointCount: trip.path ? trip.path.length : 0,
  };
}

/** Groups trips (already sorted newest-first) into "Mois Année" buckets, preserving order. */
function groupTripsByMonth(trips: Trip[]) {
  const groups: { key: string; label: string; trips: Trip[] }[] = [];
  const indexByKey: Record<string, number> = {};

  for (const trip of trips) {
    const date = new Date(trip.startedAt);
    const key = `${date.getFullYear()}-${date.getMonth()}`;
    let idx = indexByKey[key];
    if (idx === undefined) {
      const label = date.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
      idx = groups.length;
      groups.push({ key, label: label.charAt(0).toUpperCase() + label.slice(1), trips: [] });
      indexByKey[key] = idx;
    }
    groups[idx].trips.push(trip);
  }

  return groups;
}

export default function DashboardClient({ initialTrips, user }: DashboardClientProps) {
  const router = useRouter();

  // State
  // activeTripId is mirrored into the URL (?trip=<id>) via history.pushState
  // rather than router.push/replace: page.tsx doesn't read searchParams, so a
  // Next.js navigation would trigger a pointless server round-trip (and a
  // fresh Postgres query) just to select a trip on the map. Plain History API
  // gives shareable deep links and working back/forward without that cost.
  const [activeTripId, setActiveTripId] = useState<string | null>(
    () => (typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('trip') : null),
  );
  const [collapsedMonths, setCollapsedMonths] = useState<Set<string>>(new Set());
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [syncProgress, setSyncProgress] = useState<{ current: number; total: number } | null>(null);
  const [fitAllTripsTrigger, setFitAllTripsTrigger] = useState(0);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Keep activeTripId in sync with browser back/forward navigation.
  useEffect(() => {
    const onPopState = () => setActiveTripId(new URLSearchParams(window.location.search).get('trip'));
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  // Filter out doubtful/fallback trips (path length <= 2)
  const trips = useMemo(
    () => initialTrips.filter(t => t.path && t.path.length > 2),
    [initialTrips],
  );

  const isDefaultLocalEmail = !user.geoRideEmail || user.geoRideEmail.startsWith('motard_') || user.geoRideEmail === 'motard@example.com';

  // Compute overall stats
  const totalKm = trips.reduce((acc, t) => acc + (t.distance || 0), 0);
  const totalMinutes = trips.reduce((acc, t) => acc + (t.duration || 0), 0);
  const totalHours = Math.floor(totalMinutes / 60);
  const remainingMinutes = totalMinutes % 60;
  const formattedDuration = totalHours > 0
    ? `${totalHours}h ${remainingMinutes}m`
    : `${remainingMinutes} min`;

  // Selected trip's detail panel — clicking a trip both zooms the map to it
  // (existing behavior) and now also surfaces its stats here.
  const activeTripIndex = trips.findIndex((t) => t.id === activeTripId);
  const activeTrip = activeTripIndex >= 0 ? trips[activeTripIndex] : null;
  const activeTripStats = activeTrip ? getTripStats(activeTrip) : null;

  const tripGroups = useMemo(() => groupTripsByMonth(trips), [trips]);

  const monthKeyOf = (trip: Trip) => {
    const date = new Date(trip.startedAt);
    return `${date.getFullYear()}-${date.getMonth()}`;
  };

  // Selects a trip (or clears the selection), mirrors it into the URL as
  // ?trip=<id> for shareable deep links, and makes sure its month group
  // isn't hidden behind a collapsed header.
  const selectTrip = (tripId: string | null) => {
    setActiveTripId(tripId);
    const url = tripId ? `?trip=${tripId}` : window.location.pathname;
    window.history.pushState(null, '', url);

    if (tripId) {
      const trip = trips.find((t) => t.id === tripId);
      if (trip) {
        const key = monthKeyOf(trip);
        setCollapsedMonths((prev) => {
          if (!prev.has(key)) return prev;
          const next = new Set(prev);
          next.delete(key);
          return next;
        });
      }
    }
  };

  const toggleMonthCollapsed = (key: string) => {
    setCollapsedMonths((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const goToAdjacentTrip = (direction: -1 | 1) => {
    if (activeTripIndex < 0 || trips.length === 0) return;
    const nextIndex = activeTripIndex + direction;
    if (nextIndex < 0 || nextIndex >= trips.length) return;
    selectTrip(trips[nextIndex].id);
  };

  // Trigger sync via API Route
  const handleSync = async () => {
    setIsSyncing(true);
    setSyncMessage(null);
    setSyncError(null);
    setSyncProgress(null);

    try {
      const res = await fetch(`/api/sync-georide`, {
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
            if (data.error) throw new Error(data.error);
            if (data.message) setSyncMessage(data.message);
            if (data.current !== undefined && data.total !== undefined) {
              setSyncProgress({ current: data.current, total: data.total });
            }
            if (data.step === 'done') router.refresh();
          } catch (e: any) {
            if (e.message && !e.message.includes('JSON')) throw e;
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
          <span>NomadRide</span>
        </div>

        {/* Desktop nav actions */}
        <div className="navbar-actions navbar-actions--desktop">
          <div className="auth-status-container">
            {user.isAuthenticated ? (
              <>
                <span className="auth-badge authenticated">Google Connecté</span>
                <span style={{ color: 'var(--color-text-muted)' }}>|</span>
                <a href="/auth/logout" className="btn-auth btn-auth-logout">Se déconnecter</a>
              </>
            ) : (
              <>
                <span className="auth-badge guest">Mode Invité</span>
                <span style={{ color: 'var(--color-text-muted)' }}>|</span>
                <a href="/auth/login" className="btn-auth btn-auth-login">Se connecter avec Google</a>
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
            <span className="sidebar-drawer-title">🧭 Mon Historique</span>
            <button
              className="sidebar-drawer-close"
              onClick={() => setIsMobileMenuOpen(false)}
            >
              <X size={18} />
            </button>
          </div>

          {/* Navigation Tabs */}
          <div className="sidebar-tabs">
            <div className="sidebar-tab active">
              🧭 Mon Historique
            </div>
            <div
              className="sidebar-tab"
              onClick={() => { router.push('/pitstop'); setIsMobileMenuOpen(false); }}
            >
              ⛽ Pit-Stop
            </div>
          </div>

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

          {/* Sync Button */}
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

          {/* Sync feedback */}
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
            <div style={{ color: 'var(--color-danger)', fontSize: '13px', background: 'var(--color-danger-bg)', padding: '12px', borderRadius: '8px', display: 'flex', gap: '8px', alignItems: 'center' }}>
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
                  <span>Aucun trajet synchronisé. Cliquez sur &quot;Synchroniser&quot; ci-dessus pour charger l&apos;historique GeoRide.</span>
                </div>
              ) : (
                tripGroups.map((group) => {
                  const isCollapsed = collapsedMonths.has(group.key);

                  return (
                    <div key={group.key} className="trips-month-group">
                      <div
                        className="trips-month-header"
                        onClick={() => toggleMonthCollapsed(group.key)}
                        role="button"
                        tabIndex={0}
                      >
                        <span>
                          {group.label}{' '}
                          <span className="trips-month-header-count">({group.trips.length})</span>
                        </span>
                        <ChevronDown
                          size={14}
                          className={`trips-month-header-chevron ${isCollapsed ? 'collapsed' : ''}`}
                        />
                      </div>

                      {!isCollapsed && group.trips.map(trip => {
                        const isActive = activeTripId === trip.id;
                        const tripDate = new Date(trip.startedAt).toLocaleDateString('fr-FR');

                        return (
                          <div
                            key={trip.id}
                            className={`trip-item-card ${isActive ? 'active' : ''}`}
                            onClick={() => selectTrip(isActive ? null : trip.id)}
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
                      })}
                    </div>
                  );
                })
              )}
            </div>
          </div>

        </section>

        {/* Right Map Panel — full screen on mobile */}
        <section className="map-view-panel">
          <div className="map-view-header">
            <h2 className="map-title">🧭 Carte interactive des rides</h2>
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
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

          {/* Selected trip detail — appears when a trip is clicked in the list */}
          {activeTrip && activeTripStats && (
            <div className="trip-detail-panel">
              <div className="trip-detail-panel-header">
                <span className="trip-detail-panel-title">{activeTrip.title || 'Trajet Moto'}</span>
                <div className="trip-detail-panel-nav">
                  <button
                    type="button"
                    className="trip-detail-panel-nav-btn"
                    onClick={() => goToAdjacentTrip(-1)}
                    disabled={activeTripIndex <= 0}
                    aria-label="Trajet précédent (plus récent)"
                    title="Trajet précédent"
                  >
                    <ChevronLeft size={14} />
                  </button>
                  <button
                    type="button"
                    className="trip-detail-panel-nav-btn"
                    onClick={() => goToAdjacentTrip(1)}
                    disabled={activeTripIndex < 0 || activeTripIndex >= trips.length - 1}
                    aria-label="Trajet suivant (plus ancien)"
                    title="Trajet suivant"
                  >
                    <ChevronRight size={14} />
                  </button>
                  <button
                    type="button"
                    className="trip-detail-panel-close"
                    onClick={() => selectTrip(null)}
                    aria-label="Fermer le détail du trajet"
                  >
                    <X size={14} />
                  </button>
                </div>
              </div>
              <div className="trip-detail-panel-date">
                {activeTripStats.dateLabel} · {activeTripStats.startLabel} → {activeTripStats.endLabel}
              </div>
              <div className="trip-detail-panel-stats">
                <div className="trip-detail-stat">
                  <span className="trip-detail-stat-value">{(activeTrip.distance || 0).toFixed(1)} km</span>
                  <span className="trip-detail-stat-label">Distance</span>
                </div>
                <div className="trip-detail-stat">
                  <span className="trip-detail-stat-value">{activeTripStats.durationLabel}</span>
                  <span className="trip-detail-stat-label">Durée</span>
                </div>
                <div className="trip-detail-stat">
                  <span className="trip-detail-stat-value">{activeTripStats.avgSpeedKmh.toFixed(0)} km/h</span>
                  <span className="trip-detail-stat-label">Vitesse moy.</span>
                </div>
                <div className="trip-detail-stat">
                  <span className="trip-detail-stat-value">{activeTripStats.pointCount}</span>
                  <span className="trip-detail-stat-label">Points GPS</span>
                </div>
              </div>
            </div>
          )}

          <div className="map-container-wrapper">
            <Map
              trips={trips}
              activeTripId={activeTripId}
              stations={[]}
              activeStationId={null}
              selectedFuelType={"sp95"}
              searchCenter={null}
              onStationSelect={() => {}}
              fitAllTripsTrigger={fitAllTripsTrigger}
            />
          </div>
        </section>

      </main>

      {/* Mobile Bottom Navigation */}
      <nav className="mobile-bottom-nav">
        <button
          className="mobile-bottom-nav-item active"
          onClick={() => setIsMobileMenuOpen(true)}
        >
          <span className="mobile-nav-icon">🧭</span>
          <span>Historique</span>
        </button>
        <button
          className="mobile-bottom-nav-item"
          onClick={() => router.push('/pitstop')}
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
