export default function OfflinePage() {
  return (
    <div
      style={{
        minHeight: '100dvh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '16px',
        padding: '24px',
        textAlign: 'center',
        background: '#0b0f19',
        color: '#f8fafc',
        fontFamily: 'var(--font-sans), sans-serif',
      }}
    >
      <img src="/icon.svg" alt="NomadRide" width={72} height={72} style={{ borderRadius: '18px' }} />
      <h1 style={{ fontSize: '20px', fontWeight: 700, margin: 0 }}>Vous êtes hors ligne</h1>
      <p style={{ fontSize: '14px', color: '#94a3b8', maxWidth: '320px', margin: 0 }}>
        NomadRide a besoin d&apos;une connexion pour charger vos trajets et les prix des stations. Reconnectez-vous puis réessayez.
      </p>
      <a
        href="/"
        style={{
          marginTop: '8px',
          padding: '10px 20px',
          borderRadius: '999px',
          background: '#f97316',
          color: '#ffffff',
          fontWeight: 600,
          fontSize: '13px',
          textDecoration: 'none',
        }}
      >
        Réessayer
      </a>
    </div>
  );
}
