'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Bike, ArrowLeft, RefreshCw, AlertTriangle, Check, Trash2, Eye, EyeOff } from 'lucide-react';
import '../app/dashboard.css';

interface User {
  id: string;
  geoRideEmail?: string;
  lastSyncDate?: string;
  auth0Id?: string;
  trackingStartDate?: string;
  selectedTrackers: string[];
  isAuthenticated?: boolean;
}

interface Tracker {
  id: string;
  name: string;
}

interface SettingsClientProps {
  user: User;
}

export default function SettingsClient({ user }: SettingsClientProps) {
  const router = useRouter();

  // Helper to check if email is default local fallback
  const isDefaultLocalEmail = !user.geoRideEmail || user.geoRideEmail.startsWith('motard_auth0_') || user.geoRideEmail === 'motard@example.com';

  // Input states
  const [geoRideEmail, setGeoRideEmail] = useState(isDefaultLocalEmail ? '' : user.geoRideEmail || '');
  const [geoRidePassword, setGeoRidePassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  
  // Format Date for HTML input
  const defaultDateStr = user.trackingStartDate 
    ? new Date(user.trackingStartDate).toISOString().split('T')[0]
    : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const [trackingStartDate, setTrackingStartDate] = useState(defaultDateStr);

  const [selectedTrackers, setSelectedTrackers] = useState<string[]>(user.selectedTrackers);

  // Dynamic tracker fetch states
  const [availableTrackers, setAvailableTrackers] = useState<Tracker[]>([]);
  const [isLoadingTrackers, setIsLoadingTrackers] = useState(false);
  const [trackersError, setTrackersError] = useState<string | null>(null);

  // Saving states
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Deleting states
  const [isDeletingTrips, setIsDeletingTrips] = useState(false);
  const [deleteSuccess, setDeleteSuccess] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Load available trackers
  const loadTrackers = async () => {
    // Only load if user email seems set
    const activeEmail = geoRideEmail || user.geoRideEmail;
    if (!activeEmail || activeEmail.startsWith('motard_auth0_') || activeEmail === 'motard@example.com') {
      setAvailableTrackers([]);
      setIsLoadingTrackers(false);
      return;
    }

    try {
      setIsLoadingTrackers(true);
      setTrackersError(null);
      
      const userIdParam = user.auth0Id ? `?userId=${encodeURIComponent(user.auth0Id)}` : '';
      const res = await fetch(`/api/user/trackers${userIdParam}`);
      
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Impossible de lister vos motos.');
      }
      
      const data = await res.json();
      setAvailableTrackers(data);
    } catch (err: any) {
      console.error(err);
      setTrackersError(err.message || 'Impossible de récupérer la liste des trackers.');
    } finally {
      setIsLoadingTrackers(false);
    }
  };

  // Fetch trackers on mount
  useEffect(() => {
    loadTrackers();
  }, [user.geoRideEmail, user.auth0Id]);

  // Handle selected trackers checkbox toggle
  const handleTrackerToggle = (trackerId: string) => {
    if (selectedTrackers.includes(trackerId)) {
      setSelectedTrackers(selectedTrackers.filter(id => id !== trackerId));
    } else {
      setSelectedTrackers([...selectedTrackers, trackerId]);
    }
  };

  // Submit Settings
  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setSaveSuccess(null);
    setSaveError(null);

    try {
      const userIdParam = user.auth0Id ? `?userId=${encodeURIComponent(user.auth0Id)}` : '';
      const res = await fetch(`/api/user/settings${userIdParam}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          geoRideEmail,
          geoRidePassword: geoRidePassword || undefined, // Only send password if user changed it
          trackingStartDate,
          selectedTrackers,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Erreur lors de la sauvegarde des réglages.');
      }

      setSaveSuccess(data.message || 'Vos réglages ont été enregistrés.');
      setGeoRidePassword(''); // Reset password input field
      
      // Reload trackers list in case credentials changed
      loadTrackers();
      
      router.refresh();
    } catch (err: any) {
      console.error(err);
      setSaveError(err.message || 'Erreur réseau lors de l\'enregistrement.');
    } finally {
      setIsSaving(false);
    }
  };

  // Wipe Cached Trips
  const handleDeleteAllTrips = async () => {
    setIsDeletingTrips(true);
    setDeleteSuccess(null);
    setDeleteError(null);

    try {
      const userIdParam = user.auth0Id ? `?userId=${encodeURIComponent(user.auth0Id)}` : '';
      const res = await fetch(`/api/user/trips${userIdParam}`, {
        method: 'DELETE',
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Erreur lors de la suppression des trajets.');
      }

      setDeleteSuccess(data.message || 'Historique local supprimé avec succès.');
      setShowDeleteConfirm(false);
      router.refresh();
    } catch (err: any) {
      console.error(err);
      setDeleteError(err.message || 'Impossible de vider le cache des trajets.');
    } finally {
      setIsDeletingTrips(false);
    }
  };

  return (
    <div className="dashboard-container">
      {/* Top Navbar */}
      <header className="navbar">
        <div className="navbar-brand">
          <Bike size={24} style={{ fill: 'currentColor' }} />
          <span>GeoRide Rider Map - Réglages</span>
        </div>

        <div className="navbar-actions">
          <div className="auth-status-container">
            {user.isAuthenticated ? (
              <span className="auth-badge authenticated">Auth0 Connecté</span>
            ) : (
              <span className="auth-badge guest">Mode Invité (Dev)</span>
            )}
            <span style={{ color: 'var(--color-text-muted)' }}>|</span>
            <button 
              className="btn-back-dashboard" 
              onClick={() => router.push('/')}
            >
              <ArrowLeft size={14} /> Retour au Dashboard
            </button>
          </div>
        </div>
      </header>

      {/* Settings Panel Grid */}
      <main className="settings-layout">
        <div className="settings-grid-container">
          <h2 className="settings-section-header">Paramètres de synchronisation</h2>
          
          <form onSubmit={handleSaveSettings} className="settings-form-wrapper">
            {/* 1. Account Settings Card */}
            <div className="settings-card">
              <h3 className="settings-card-title">1. Liaison Compte GeoRide</h3>
              <p className="settings-card-desc">
                Renseignez vos identifiants GeoRide pour permettre à l'application de s'authentifier auprès des serveurs GeoRide et importer vos trajets.
              </p>

              <div className="input-group">
                <label htmlFor="settings-email">Email GeoRide</label>
                <input
                  id="settings-email"
                  type="email"
                  required
                  placeholder="votre.email@georide.com"
                  value={geoRideEmail}
                  onChange={(e) => setGeoRideEmail(e.target.value)}
                />
              </div>

              <div className="input-group" style={{ position: 'relative' }}>
                <label htmlFor="settings-password">Mot de passe GeoRide</label>
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                  <input
                    id="settings-password"
                    type={showPassword ? "text" : "password"}
                    placeholder={user.geoRideEmail && !isDefaultLocalEmail ? "•••••••• (inchangé)" : "Votre mot de passe"}
                    value={geoRidePassword}
                    onChange={(e) => setGeoRidePassword(e.target.value)}
                    style={{ width: '100%', paddingRight: '40px' }}
                  />
                  <button 
                    type="button" 
                    className="password-toggle-btn"
                    onClick={() => setShowPassword(!showPassword)}
                    style={{ position: 'absolute', right: '10px', background: 'none', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer' }}
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>
            </div>

            {/* 2. Options Settings Card */}
            <div className="settings-card">
              <h3 className="settings-card-title">2. Période & Motos à synchroniser</h3>
              
              <div className="input-group">
                <label htmlFor="settings-date">Date de début d'importation</label>
                <p className="settings-card-desc" style={{ marginTop: '2px', marginBottom: '8px' }}>
                  L'application n'importera aucun trajet antérieur à cette date.
                </p>
                <input
                  id="settings-date"
                  type="date"
                  required
                  value={trackingStartDate}
                  onChange={(e) => setTrackingStartDate(e.target.value)}
                />
              </div>

              <div className="tracker-select-container">
                <label className="input-group-label" style={{ display: 'block', fontSize: '11px', color: 'var(--color-text-secondary)', fontWeight: '500', marginBottom: '8px' }}>
                  Sélection des motos à importer
                </label>

                {isLoadingTrackers ? (
                  <div className="tracker-loading-box">
                    <RefreshCw size={18} className="spinner" style={{ color: 'var(--accent-orange)' }} />
                    <span>Récupération de vos motos depuis GeoRide...</span>
                  </div>
                ) : trackersError ? (
                  <div className="tracker-error-box">
                    <AlertTriangle size={18} style={{ color: '#ef4444' }} />
                    <span>{trackersError}</span>
                  </div>
                ) : availableTrackers.length === 0 ? (
                  <div className="tracker-empty-box">
                    <Bike size={20} style={{ color: 'var(--color-text-muted)' }} />
                    <span>Veuillez lier votre compte GeoRide ci-dessus pour lister vos motos disponibles.</span>
                  </div>
                ) : (
                  <div className="trackers-checkbox-list">
                    {availableTrackers.map(tracker => {
                      const isChecked = selectedTrackers.includes(tracker.id);
                      return (
                        <div 
                          key={tracker.id} 
                          className={`tracker-checkbox-item ${isChecked ? 'active' : ''}`}
                          onClick={() => handleTrackerToggle(tracker.id)}
                        >
                          <div className="custom-checkbox">
                            {isChecked && <Check size={12} strokeWidth={3} />}
                          </div>
                          <span className="tracker-bike-name">{tracker.name}</span>
                          <span className="tracker-bike-id">ID: {tracker.id}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Save Buttons & Feedback */}
            <div className="form-submit-block">
              <button 
                type="submit" 
                className="btn-sync" 
                style={{ width: '100%', maxWidth: '300px' }}
                disabled={isSaving}
              >
                {isSaving ? 'Enregistrement en cours...' : 'Sauvegarder les réglages'}
              </button>

              {saveSuccess && (
                <div className="settings-feedback-banner success">
                  <Check size={16} /> <span>{saveSuccess}</span>
                </div>
              )}

              {saveError && (
                <div className="settings-feedback-banner error">
                  <AlertTriangle size={16} /> <span>{saveError}</span>
                </div>
              )}
            </div>
          </form>

          {/* 3. Danger Zone Reset Card */}
          <div className="settings-card danger-card" style={{ marginTop: '30px' }}>
            <h3 className="settings-card-title" style={{ color: '#ef4444', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Trash2 size={18} /> Zone de danger
            </h3>
            <p className="settings-card-desc">
              La réinitialisation de l'historique effacera tous les trajets mis en cache localement dans la base de données. Vos trajets réels sur l'application mobile GeoRide ne seront pas affectés. Cela force un rechargement propre à la prochaine synchronisation.
            </p>

            {!showDeleteConfirm ? (
              <button 
                type="button" 
                className="btn-danger-outline"
                onClick={() => setShowDeleteConfirm(true)}
              >
                Réinitialiser le cache des trajets
              </button>
            ) : (
              <div className="delete-confirm-box">
                <div className="delete-confirm-msg">
                  <AlertTriangle size={18} />
                  <span>Êtes-vous sûr de vouloir supprimer tous les trajets stockés en cache local ? Cette action est irréversible.</span>
                </div>
                <div style={{ display: 'flex', gap: '12px' }}>
                  <button 
                    type="button" 
                    className="btn-danger-confirm"
                    disabled={isDeletingTrips}
                    onClick={handleDeleteAllTrips}
                  >
                    {isDeletingTrips ? 'Suppression...' : 'Oui, supprimer définitivement'}
                  </button>
                  <button 
                    type="button" 
                    className="btn-creds-edit"
                    onClick={() => setShowDeleteConfirm(false)}
                  >
                    Annuler
                  </button>
                </div>
              </div>
            )}

            {deleteSuccess && (
              <div className="settings-feedback-banner success" style={{ marginTop: '12px' }}>
                <Check size={16} /> <span>{deleteSuccess}</span>
              </div>
            )}

            {deleteError && (
              <div className="settings-feedback-banner error" style={{ marginTop: '12px' }}>
                <AlertTriangle size={16} /> <span>{deleteError}</span>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
