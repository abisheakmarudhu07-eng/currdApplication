import { useEffect, useState } from 'react';

type HealthState = 'checking' | 'connected' | 'unavailable';

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL;

export default function App() {
  const [apiStatus, setApiStatus] = useState<HealthState>('checking');
  const [databaseStatus, setDatabaseStatus] = useState<HealthState>('checking');

  useEffect(() => {
    const controller = new AbortController();

    async function checkEndpoint(path: string, setStatus: (status: HealthState) => void) {
      try {
        const response = await fetch(`${apiBaseUrl}${path}`, { signal: controller.signal });
        setStatus(response.ok ? 'connected' : 'unavailable');
      } catch {
        if (!controller.signal.aborted) setStatus('unavailable');
      }
    }

    void checkEndpoint('/health', setApiStatus);
    void checkEndpoint('/health/db', setDatabaseStatus);
    return () => controller.abort();
  }, []);

  return (
    <main className="page-shell">
      <section className="hero-card">
        <p className="eyebrow">YOUR FOOD. YOUR PROGRESS.</p>
        <h1>Currd</h1>
        <p className="intro">A food and fitness tracker built around reliable nutrition data and consistent daily habits.</p>
        <div className="status-grid" aria-label="Development service status">
          <StatusItem label="API" status={apiStatus} />
          <StatusItem label="MySQL" status={databaseStatus} />
        </div>
        <p className="setup-note">Starter foundation is running. Next we will build the reviewed food catalogue API and nutrition calculations.</p>
      </section>
    </main>
  );
}

function StatusItem({ label, status }: { label: string; status: HealthState }) {
  const statusLabel = {
    checking: 'Checking…',
    connected: 'Connected',
    unavailable: 'Unavailable'
  }[status];

  return (
    <div className="status-item">
      <span className="status-label">{label}</span>
      <span className={`status-value status-${status}`}>
        <span className="status-dot" aria-hidden="true" />
        {statusLabel}
      </span>
    </div>
  );
}
