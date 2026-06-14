'use client';

import React, { useState } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { RefreshCw, Bike, Clock, Navigation, Compass, AlertCircle } from 'lucide-react';
import '../app/dashboard.css';

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
}

interface DashboardClientProps {
  initialTrips: Trip[];
  user: User;
}

export default function DashboardClient({ initialTrips, user }: DashboardClientProps) {
  const router = useRouter();
  const [activeTripId, setActiveTripId] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);

  // Compute overall stats
  const totalKm = initialTrips.reduce((acc, t) => acc + (t.distance || 0), 0);
  const totalMinutes = initialTrips.reduce((acc, t) => acc + (t.duration || 0), 0);
  
  // Format total duration (hours & minutes)
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

    try {
      // Pass the userId in query params for easy fallback/testing
      const res = await fetch(`/api/sync-georide?userId=auth0|default_local_user_95`, {
        method: 'POST',
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Erreur lors de la synchronisation');
      }

      setSyncMessage(data.message || 'Synchronisation réussie.');
      
      // Force next.js to refresh server component data from database
      router.refresh();
    } catch (err: any) {
      console.error(err);
      setSyncError(err.message || 'Impossible de se connecter à la synchronisation GeoRide.');
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
        <div style={{ fontSize: '13px', color: 'var(--color-text-secondary)' }}>
          Pilote: <span style={{ color: 'var(--color-text-primary)', fontWeight: '600' }}>{user.geoRideEmail || 'motard@example.com'}</span>
        </div>
      </header>

      {/* Main Layout */}
      <main className="dashboard-layout">
        
        {/* Left Sidebar Panel */}
        <section className="sidebar">
          
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
              <span className="stat-value">{initialTrips.length}</span>
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
            <div style={{ color: 'var(--accent-green)', fontSize: '13px', background: 'rgba(16, 185, 129, 0.1)', padding: '12px', borderRadius: '8px', display: 'flex', gap: '8px' }}>
              <span>✓</span>
              <span>{syncMessage}</span>
            </div>
          )}

          {syncError && (
            <div style={{ color: '#ef4444', fontSize: '13px', background: 'rgba(239, 68, 68, 0.1)', padding: '12px', borderRadius: '8px', display: 'flex', gap: '8px', alignItems: 'center' }}>
              <AlertCircle size={16} />
              <span>{syncError}</span>
            </div>
          )}

          {/* Separation line */}
          <hr style={{ border: 'none', borderTop: '1px solid var(--color-border)' }} />

          {/* Trips list section */}
          <div>
            <h3 className="trips-section-title">Historique des Trajets</h3>
            <div className="trips-list-container">
              {initialTrips.length === 0 ? (
                <div className="empty-trips-placeholder">
                  <Compass size={32} />
                  <span>Aucun trajet synchronisé. Cliquez sur "Synchroniser" ci-dessus pour charger l'historique GeoRide.</span>
                </div>
              ) : (
                initialTrips.map(trip => {
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

        {/* Right Map Panel Section */}
        <section className="map-view-panel">
          <div className="map-view-header">
            <h2 className="map-title">Carte interactive des rides</h2>
            {activeTripId && (
              <span style={{ fontSize: '13px', background: 'rgba(249, 115, 22, 0.15)', color: 'var(--accent-orange)', padding: '4px 10px', borderRadius: '12px', fontWeight: '500' }}>
                Tracé actif zoomé
              </span>
            )}
          </div>
          
          <div className="map-container-wrapper">
            <Map trips={initialTrips} activeTripId={activeTripId} />
          </div>
        </section>
        
      </main>
    </div>
  );
}
