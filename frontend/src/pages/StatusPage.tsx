import { useState, useEffect } from 'react';

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

export function HealthCheck() {
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


export function StatusPage() {
  return (
    <section className="status-page">
      <h1>Estado de los servicios</h1>
      <p className="muted">Verificación de la conexión del backend con PostgreSQL y MongoDB (se actualiza cada 30 s).</p>
      <HealthCheck />
    </section>
  );
}
