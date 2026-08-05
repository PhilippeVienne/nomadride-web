import Link from 'next/link';
import { Bike, ArrowLeft, Scale, ShieldCheck, Info } from 'lucide-react';
import pkg from '../../../package.json';
import '../dashboard.css';

export const metadata = {
  title: 'À propos — NomadRide',
};

export default function AboutPage() {
  const appVersion = pkg.version;
  const commitSha = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7);
  const commitRef = process.env.VERCEL_GIT_COMMIT_REF;
  const vercelEnv = process.env.VERCEL_ENV;

  return (
    <div className="dashboard-container">
      <header className="navbar">
        <div className="navbar-brand">
          <Bike size={24} style={{ fill: 'currentColor' }} />
          <span>NomadRide - À propos</span>
        </div>

        <div className="navbar-actions navbar-actions--desktop">
          <Link href="/pitstop" className="btn-back-dashboard">
            <ArrowLeft size={14} /> Retour
          </Link>
        </div>

        <div className="navbar-actions navbar-actions--settings-mobile">
          <Link href="/pitstop" className="btn-back-dashboard" aria-label="Retour">
            <ArrowLeft size={16} />
          </Link>
        </div>
      </header>

      <main className="settings-layout">
        <div className="settings-grid-container">
          <h2 className="settings-section-header">À propos de NomadRide</h2>

          <div className="settings-form-wrapper">
            <div className="settings-card">
              <h3 className="settings-card-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Scale size={18} style={{ color: 'var(--accent-orange)' }} /> Mentions légales
              </h3>
              <p className="settings-card-desc">
                NomadRide est un site personnel, développé et édité par Philippe Vienne, sans finalité commerciale.
              </p>
              <p className="settings-card-desc">
                Contact : <a href="mailto:philippegeek@gmail.com" style={{ color: 'var(--accent-cyan)' }}>philippegeek@gmail.com</a>
              </p>
              <p className="settings-card-desc">
                Hébergement applicatif : Vercel Inc. (<a href="https://vercel.com" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent-cyan)' }}>vercel.com</a>).
                Base de données : Supabase (PostgreSQL).
              </p>
            </div>

            <div className="settings-card">
              <h3 className="settings-card-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <ShieldCheck size={18} style={{ color: 'var(--accent-green)' }} /> Données personnelles &amp; RGPD
              </h3>
              <p className="settings-card-desc">
                Données traitées : votre identifiant de connexion Auth0, les identifiants de votre compte GeoRide
                (email et mot de passe, stockés chiffrés), ainsi que l&apos;historique de trajets et les positions
                GPS synchronisés depuis GeoRide.
              </p>
              <p className="settings-card-desc">
                Finalité : vous authentifier, afficher votre historique de trajets sur la carte, et rechercher les
                stations-service les moins chères sur votre itinéraire.
              </p>
              <p className="settings-card-desc">
                Sous-traitants : Auth0 (authentification), Supabase (hébergement base de données), Vercel
                (hébergement applicatif), et GeoRide (source des données de trajets — un compte tiers dont vous
                fournissez vous-même les identifiants).
              </p>
              <p className="settings-card-desc">
                Cookies : uniquement le cookie de session nécessaire à l&apos;authentification Auth0. Aucun cookie
                publicitaire ni traceur analytique tiers.
              </p>
              <p className="settings-card-desc">
                Conservation : vos données sont conservées tant que votre compte existe. Vous pouvez vider votre
                historique de trajets à tout moment depuis Réglages → Zone de danger.
              </p>
              <p className="settings-card-desc">
                Droits d&apos;accès, de rectification, d&apos;effacement et de portabilité : contactez-nous à
                l&apos;adresse ci-dessus pour exercer vos droits RGPD, y compris la suppression complète de votre
                compte.
              </p>
            </div>

            <div className="settings-card">
              <h3 className="settings-card-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Info size={18} style={{ color: 'var(--accent-cyan)' }} /> Version de l&apos;application
              </h3>
              <p className="settings-card-desc">Version : {appVersion}</p>
              {commitSha && <p className="settings-card-desc">Commit : {commitSha}{commitRef ? ` (${commitRef})` : ''}</p>}
              {vercelEnv && <p className="settings-card-desc">Environnement : {vercelEnv}</p>}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
