'use client';

import React, { useState } from 'react';
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

interface DashboardClientProps {
  initialTrips: Trip[];
  user: User;
}

export default function DashboardClient({ initialTrips, user }: DashboardClientProps) {
  const router = useRouter();

  // State
  const [activeTripId, setActiveTripId] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [syncProgress, setSyncProgress] = useState<{ current: number; total: number } | null>(null);
  const [fitAllTripsTrigger, setFitAllTripsTrigger] = useState(0);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Filter out doubtful/fallback trips (path length <= 2)
  const trips = initialTrips.filter(t => t.path && t.path.length > 2);

  const isDefaultLocalEmail = !user.geoRideEmail || user.geoRideEmail.startsWith('motard_auth0_') || user.geoRideEmail === 'motard@example.com';

  // Compute overall stats
  const totalKm = trips.reduce((acc, t) => acc + (t.distance || 0), 0);
  const totalMinutes = trips.reduce((acc, t) => acc + (t.duration || 0), 0);
  const totalHours = Math.floor(totalMinutes / 60);
  const remainingMinutes = totalMinutes % 60;
  const formattedDuration = totalHours > 0
    ? `${totalHours}h ${remainingMinutes}m`
    : `${remainingMinutes} min`;

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
                  <span>Aucun trajet synchronisé. Cliquez sur &quot;Synchroniser&quot; ci-dessus pour charger l&apos;historique GeoRide.</span>
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

        </section>

        {/* Right Map Panel — full screen on mobile */}
        <section className="map-view-panel">
          <div className="map-view-header">
            <h2 className="map-title">🧭 Carte interactive des rides</h2>
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
