import { useState, useEffect } from 'react';
import './App.css';

// Types
interface HealthStatus {
  status: 'ok' | 'error';
  info: {
    postgres: { status: string; latency?: string; pool?: any };
    mongodb: { status: string; latency?: string; collections?: number; connectionState?: string };
  };
  error: Record<string, any>;
  details: {
    postgres: { status: string; latency?: string; pool?: any };
    mongodb: { status: string; latency?: string; collections?: number; connectionState?: string };
  };
}

function HealthCheck() {
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchHealth = async () => {
      try {
        const response = await fetch('/api/health');
        const data = await response.json();
        setHealth(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error desconocido');
      } finally {
        setLoading(false);
      }
    };

    fetchHealth();
    const interval = setInterval(fetchHealth, 30000); // Refresh every 30s
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="health-card loading">
        <div className="spinner"></div>
        <p>Verificando servicios...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="health-card error">
        <h3>❌ Error de conexión</h3>
        <p>{error}</p>
        <p className="hint">Asegúrate de que el backend esté corriendo en <code>http://localhost:3000</code></p>
      </div>
    );
  }

  const postgresStatus = health?.details?.postgres?.status || 'unknown';
  const mongodbStatus = health?.details?.mongodb?.status || 'unknown';

  return (
    <div className="health-card">
      <h3>🏥 Estado de los Servicios</h3>
      <div className="service-grid">
        <div className={`service ${postgresStatus}`}>
          <h4>🐘 PostgreSQL</h4>
          <span className={`badge ${postgresStatus}`}>{postgresStatus.toUpperCase()}</span>
          {health?.details?.postgres?.latency && (
            <p>Latencia: {health.details.postgres.latency}</p>
          )}
          {health?.details?.postgres?.pool && (
            <p>Pool: {health.details.postgres.pool.totalCount} total, {health.details.postgres.pool.idleCount} idle</p>
          )}
        </div>
        <div className={`service ${mongodbStatus}`}>
          <h4>🍃 MongoDB</h4>
          <span className={`badge ${mongodbStatus}`}>{mongodbStatus.toUpperCase()}</span>
          {health?.details?.mongodb?.latency && (
            <p>Latencia: {health.details.mongodb.latency}</p>
          )}
          {health?.details?.mongodb?.collections !== undefined && (
            <p>Colecciones: {health.details.mongodb.collections}</p>
          )}
          {health?.details?.mongodb?.connectionState && (
            <p>Estado: {health.details.mongodb.connectionState}</p>
          )}
        </div>
      </div>
      {health?.status === 'ok' && (
        <p className="success">✅ Todos los servicios operativos</p>
      )}
    </div>
  );
}

function App() {
  return (
    <div className="app">
      <header>
        <h1>🎬 CineConecta</h1>
        <p className="subtitle">Plataforma de streaming con persistencia políglota (PostgreSQL + MongoDB)</p>
      </header>
      <main>
        <section className="hero">
          <HealthCheck />
        </section>
        <section className="info">
          <h2>📋 Información del Proyecto</h2>
          <div className="info-grid">
            <div className="info-card">
              <h3>Backend</h3>
              <ul>
                <li>Node.js + NestJS + TypeScript</li>
                <li>PostgreSQL (cuentas, perfiles, planes, suscripciones, pagos)</li>
                <li>MongoDB (catálogo, listas, actividad, admins)</li>
                <li>Health checks en <code>/api/health</code></li>
              </ul>
            </div>
            <div className="info-card">
              <h3>Frontend</h3>
              <ul>
                <li>React 18 + Vite + TypeScript</li>
                <li>React Router para navegación</li>
                <li>Axios para llamadas HTTP</li>
                <li>Proxy a backend en desarrollo</li>
              </ul>
            </div>
            <div className="info-card">
              <h3>Próximos Pasos</h3>
              <ul>
                <li>E-02: Auth clientes + middleware pertenencia</li>
                <li>E-03: Auth admins en MongoDB</li>
                <li>E-04: API cuenta/suscripciones/perfiles</li>
                <li>B-01: Frontend base (Balanta)</li>
                <li>B-02: Búsqueda catálogo (Balanta)</li>
              </ul>
            </div>
          </div>
        </section>
      </main>
      <footer>
        <p>CineConecta - Sistemas Intensivos en Datos II | Equipo: Miguel, Krystal, Edwar, Balanta</p>
      </footer>
    </div>
  );
}

export default App;