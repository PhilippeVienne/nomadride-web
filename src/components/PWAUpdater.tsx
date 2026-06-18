'use client';

import React, { useEffect, useState, useRef } from 'react';
import { RefreshCw, X, ArrowUpCircle } from 'lucide-react';

export default function PWAUpdater() {
  const [showBanner, setShowBanner] = useState(false);
  const registrationRef = useRef<ServiceWorkerRegistration | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
      return;
    }

    const registerSW = async () => {
      try {
        const reg = await navigator.serviceWorker.register('/sw.js', {
          scope: '/',
        });
        registrationRef.current = reg;

        // Check if there is an update waiting already (e.g. from previous load)
        if (reg.waiting) {
          setShowBanner(true);
        }

        // Listen for new service workers installing
        reg.addEventListener('updatefound', () => {
          const installingWorker = reg.installing;
          if (!installingWorker) return;

          installingWorker.addEventListener('statechange', () => {
            // Only show banner if there is a controller (meaning it's an update, not first install)
            if (installingWorker.state === 'installed' && navigator.serviceWorker.controller) {
              setShowBanner(true);
            }
          });
        });
      } catch (error) {
        console.error('Service Worker registration failed:', error);
      }
    };

    registerSW();

    // Listen for controller changes (when skipWaiting is called and sw takes control)
    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!refreshing) {
        refreshing = true;
        window.location.reload();
      }
    });
  }, []);

  const handleUpdate = () => {
    const reg = registrationRef.current;
    if (!reg || !reg.waiting) return;
    // Send skipWaiting command to waiting worker
    reg.waiting.postMessage({ type: 'SKIP_WAITING' });
    setShowBanner(false);
  };

  const handleClose = () => {
    setShowBanner(false);
  };

  if (!showBanner) return null;

  return (
    <div className="pwa-update-banner-container">
      <div className="pwa-update-banner">
        <div className="pwa-update-content">
          <div className="pwa-update-icon-wrapper">
            <ArrowUpCircle className="pwa-update-icon" size={20} />
          </div>
          <div className="pwa-update-text">
            <h4 className="pwa-update-title">Mise à jour disponible</h4>
            <p className="pwa-update-description">Une nouvelle version de l'application est prête à être installée.</p>
          </div>
        </div>
        <div className="pwa-update-actions">
          <button onClick={handleUpdate} className="pwa-update-btn-primary">
            <RefreshCw size={14} className="pwa-update-spin-hover" />
            Mettre à jour
          </button>
          <button onClick={handleClose} className="pwa-update-btn-close" aria-label="Fermer">
            <X size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
