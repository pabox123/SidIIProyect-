# Evidencia de índices - CineConecta (M-09)

## Requisitos
- Windows con PowerShell
- Docker Desktop corriendo
- Contenedor cine-evidencia en puerto 5433 (PostgreSQL 16)
- psql en PATH (opcional; el script usa docker exec)

## Ejecución completa
`powershell
powershell -File evidencia_indices/03_medir.ps1
`"
# Evidencia de índices - CineConecta (M-09)  ## Requisitos - Windows con PowerShell - Docker Desktop corriendo - Contenedor cine-evidencia en puerto 5433 (PostgreSQL 16) - psql en PATH (opcional; el script usa docker exec)  ## Ejecución completa `powershell powershell -File evidencia_indices/03_medir.ps1 += "
# Evidencia de índices - CineConecta (M-09)  ## Requisitos - Windows con PowerShell - Docker Desktop corriendo - Contenedor cine-evidencia en puerto 5433 (PostgreSQL 16) - psql en PATH (opcional; el script usa docker exec)  ## Ejecución completa `powershell powershell -File evidencia_indices/03_medir.ps1 += 'El script:'
# Evidencia de índices - CineConecta (M-09)  ## Requisitos - Windows con PowerShell - Docker Desktop corriendo - Contenedor cine-evidencia en puerto 5433 (PostgreSQL 16) - psql en PATH (opcional; el script usa docker exec)  ## Ejecución completa `powershell powershell -File evidencia_indices/03_medir.ps1 += '1. Crea la BD cine_evidencia y carga el DDL (sql/01_postgresql_ddl.sql)'
# Evidencia de índices - CineConecta (M-09)  ## Requisitos - Windows con PowerShell - Docker Desktop corriendo - Contenedor cine-evidencia en puerto 5433 (PostgreSQL 16) - psql en PATH (opcional; el script usa docker exec)  ## Ejecución completa `powershell powershell -File evidencia_indices/03_medir.ps1 += '2. Genera datos sintéticos (~150k cuentas, ~1M subs, ~1M pagos) con evidencia_indices/01_cargar_volumen.sql'
# Evidencia de índices - CineConecta (M-09)  ## Requisitos - Windows con PowerShell - Docker Desktop corriendo - Contenedor cine-evidencia en puerto 5433 (PostgreSQL 16) - psql en PATH (opcional; el script usa docker exec)  ## Ejecución completa `powershell powershell -File evidencia_indices/03_medir.ps1 += '3. Ejecuta las 3 consultas (A, B, C) con y sin cada índice, repitiendo 5 veces con EXPLAIN (ANALYZE, BUFFERS)'
# Evidencia de índices - CineConecta (M-09)  ## Requisitos - Windows con PowerShell - Docker Desktop corriendo - Contenedor cine-evidencia en puerto 5433 (PostgreSQL 16) - psql en PATH (opcional; el script usa docker exec)  ## Ejecución completa `powershell powershell -File evidencia_indices/03_medir.ps1 += '4. Guarda cada EXPLAIN en evidencia_indices/salida/'
# Evidencia de índices - CineConecta (M-09)  ## Requisitos - Windows con PowerShell - Docker Desktop corriendo - Contenedor cine-evidencia en puerto 5433 (PostgreSQL 16) - psql en PATH (opcional; el script usa docker exec)  ## Ejecución completa `powershell powershell -File evidencia_indices/03_medir.ps1 += '5. Genera evidencia_indices/resultados.md listo para Word'
# Evidencia de índices - CineConecta (M-09)  ## Requisitos - Windows con PowerShell - Docker Desktop corriendo - Contenedor cine-evidencia en puerto 5433 (PostgreSQL 16) - psql en PATH (opcional; el script usa docker exec)  ## Ejecución completa `powershell powershell -File evidencia_indices/03_medir.ps1 += "
# Evidencia de índices - CineConecta (M-09)  ## Requisitos - Windows con PowerShell - Docker Desktop corriendo - Contenedor cine-evidencia en puerto 5433 (PostgreSQL 16) - psql en PATH (opcional; el script usa docker exec)  ## Ejecución completa `powershell powershell -File evidencia_indices/03_medir.ps1 += 
- 01_cargar_volumen.sql — carga de datos reproducible (semilla fija)
- 02_consultas.sql — consultas de referencia con parámetros
- 03_medir.ps1 — script principal de medición (este archivo)
- salida/*.txt — EXPLAIN completos de cada ejecución
- resultados.md — reporte final en español, sin tablas ni colores
- README.md — este archivo

## Notas
- No se escriben contraseñas ni cadenas de conexión en archivos.
- Usa session_replication_role = replica para carga masiva rápida y reactiva triggers al final.
- Si la carga supera 25 min o memoria, el SQL reduce volumen a la mitad (comentado en el script).
- El índice GiST de ex_subs_no_overlap no se puede dropear sin dropear la constraint; se deja activo siempre.
