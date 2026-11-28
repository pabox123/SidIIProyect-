<#
.SYNOPSIS
    Script de medición de índices PostgreSQL para CineConecta (M-09)

.DESCRIPTION
    - Crea BD cine_evidencia y carga DDL + datos sintéticos (~150k cuentas, ~1M subs, ~1M pagos)
    - Mide 3 consultas (A, B, C) con y sin índices específicos
    - Repite cada medición 5 veces y guarda estadísticas (1ra ejecución, min, mediana, max)
    - Guarda EXPLAIN completos en evidencia_indices/salida/
    - Genera resultados.md listo para Word

.REQUIREMENTS
    - Docker Desktop corriendo con contenedor "cine-evidencia" en puerto 5433
    - Variables PGHOST, PGPORT, PGUSER, PGPASSWORD, PGDATABASE definidas (usa PGPORT=5433)
    - psql disponible (si no, usa "docker exec -i cine-evidencia psql -U postgres")
#>

param(
    [string]$PgHost = "localhost",
    [int]$PgPort = 5433,
    [string]$PgUser = "postgres",
    [string]$PgPassword = "",
    [string]$PgDatabase = "cine_evidencia",
    [string]$ContainerName = "cine-evidencia",
    [string]$OutputDir = "evidencia_indices/salida",
    [int]$Repetitions = 5
)

# --- Funciones auxiliares ---

function Invoke-Psql {
    param(
        [string]$Database,
        [string]$Query,
        [switch]$NoOutput
    )
    $cmd = 'docker exec -i {0} psql -U {1} -d {2} -c "{3}"' -f $ContainerName, $PgUser, $Database, $Query
    if ($NoOutput) {
        return Invoke-Expression $cmd
    } else {
        return Invoke-Expression $cmd | Out-String
    }
}

function Invoke-PsqlFile {
    param(
        [string]$Database,
        [string]$FilePath
    )
    # Copiar archivo al contenedor y ejecutarlo allí (evita problemas de pipe en PowerShell)
    $destPath = "/tmp/$(Split-Path $FilePath -Leaf)"
    $containerDest = "${ContainerName}:${destPath}"
    docker cp $FilePath $containerDest | Out-Null
    $cmd = 'docker exec -i {0} psql -U {1} -d {2} -f {3}' -f $ContainerName, $PgUser, $Database, $destPath
    $result = Invoke-Expression $cmd | Out-String
    docker exec $ContainerName rm -f $destPath | Out-Null
    return $result
}

function Run-ExplainMultiple {
    param(
        [string]$Database,
        [string]$Query,
        [string]$OutputPrefix,
        [int]$Reps = 5
    )
    $results = @()

    for ($i = 1; $i -le $Reps; $i++) {
        Write-Host ("  Ejecución {0}/{1}..." -f $i, $Reps) -NoNewline
        $start = Get-Date
        $explainQuery = 'EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT) {0}' -f $Query
        $output = Invoke-Psql -Database $Database -Query $explainQuery
        $elapsed = (Get-Date) - $start

        # Extraer tiempo de ejecución del EXPLAIN
        if ($output -match 'Execution Time:\s+([\d.]+)\s+ms') {
            $execTime = [double]$matches[1]
        } elseif ($output -match 'Planning Time:\s+([\d.]+)\s+ms') {
            $execTime = 0
        } else {
            $execTime = $elapsed.TotalMilliseconds
        }

        # Extraer tipo de nodo principal - priorizar scans sobre joins/sorts
        $nodeType = "Unknown"
        # Buscar primero scan nodes (más relevantes para medir efecto de índices)
        if ($output -match '(Seq Scan|Index Scan|Bitmap Heap Scan|Bitmap Index Scan|Index Only Scan)') {
            $nodeType = $matches[1]
        } elseif ($output -match '(Gather|Gather Merge|Hash Join|Merge Join|Nested Loop|Sort|Aggregate|GroupAggregate|HashAggregate)') {
            $nodeType = $matches[1]
        }

        # Extraer filas y buffers
        $rows = 0
        $buffers = 0
        if ($output -match 'rows=(\d+)') { $rows = [int]$matches[1] }
        if ($output -match 'buffers=(\d+)') { $buffers = [int]$matches[1] }

        $result = [pscustomobject]@{
            Run = $i
            ExecutionTimeMs = [math]::Round($execTime, 2)
            NodeType = $nodeType
            Rows = $rows
            Buffers = $buffers
            FullOutput = $output.Trim()
        }
        $results += $result

        # Guardar EXPLAIN completo
        $outFile = Join-Path $OutputDir ('{0}-run{1}.txt' -f $OutputPrefix, $i)
        $output | Out-File -FilePath $outFile -Encoding UTF8

        Write-Host (" {0}ms ({1})" -f $execTime, $nodeType)
    }

    # Calcular estadísticas
    $times = $results | Select-Object -ExpandProperty ExecutionTimeMs | Sort-Object
    $stats = [pscustomobject]@{
        FirstRun = $results[0].ExecutionTimeMs
        Min = $times[0]
        Median = $times[[math]::Floor(($times.Count - 1) / 2)]
        Max = $times[-1]
        NodeType = $results[0].NodeType
        Rows = $results[0].Rows
        Buffers = $results[0].Buffers
        AllRuns = $results
    }
    return $stats
}

function Get-SystemInfo {
    $pgVersion = (Invoke-Psql -Database $PgDatabase -Query "SELECT version();" -NoOutput).Trim()
    $sharedBuffers = (Invoke-Psql -Database $PgDatabase -Query "SHOW shared_buffers;" -NoOutput).Trim()
    $workMem = (Invoke-Psql -Database $PgDatabase -Query "SHOW work_mem;" -NoOutput).Trim()

    $osInfo = (Get-CimInstance Win32_OperatingSystem).Caption
    $cpuInfo = (Get-CimInstance Win32_Processor).Name
    $ramGB = [math]::Round((Get-CimInstance Win32_ComputerSystem).TotalPhysicalMemory / 1GB, 1)

    return [pscustomobject]@{
        PostgresVersion = $pgVersion
        OS = $osInfo
        CPU = $cpuInfo
        RAM_GB = $ramGB
        SharedBuffers = $sharedBuffers
        WorkMem = $workMem
        ContainerNote = "PostgreSQL corriendo en contenedor Docker 'cine-evidencia' en Windows, puerto 5433 mapeado a 5432 interno"
    }
}

function Format-ResultBlock {
    param($label, $stats)
    $lines = @()
    $lines += "**$label**"
    $lines += ""
    $lines += "- Nodo principal: $($stats.NodeType)"
    $lines += "- Filas leídas: $($stats.Rows)"
    $lines += "- Buffers: $($stats.Buffers)"
    $lines += "- Tiempo 1ra ejecución: $($stats.FirstRun) ms"
    $lines += "- Mínimo: $($stats.Min) ms"
    $lines += "- Mediana: $($stats.Median) ms"
    $lines += "- Máximo: $($stats.Max) ms"
    $lines += ""
    return $lines -join "`n"
}

# --- INICIO ---

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  CineConecta M-09: Medición de efecto de índices" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""

# Verificar contenedor
$container = docker ps --filter ("name={0}" -f $ContainerName) --format "{{.Status}}"
if (-not $container -or -not $container.StartsWith("Up")) {
    Write-Host "ERROR: Contenedor $ContainerName no está corriendo. Iniciándolo..." -ForegroundColor Red
    docker start $ContainerName | Out-Null
    Start-Sleep 3
}
Write-Host ("Contenedor {0}: OK" -f $ContainerName) -ForegroundColor Green

# Crear directorio de salida
$fullOutputDir = Join-Path (Get-Location) $OutputDir
if (-not (Test-Path $fullOutputDir)) {
    New-Item -ItemType Directory -Path $fullOutputDir | Out-Null
}
Write-Host ("Directorio de salida: {0}" -f $fullOutputDir) -ForegroundColor Green

# 1. Crear BD y cargar DDL
Write-Host ("[1/5] Creando base de datos {0} y cargando DDL..." -f $PgDatabase) -ForegroundColor Yellow
Invoke-Psql -Database "postgres" -Query "DROP DATABASE IF EXISTS $PgDatabase;" -NoOutput
Invoke-Psql -Database "postgres" -Query ("CREATE DATABASE {0};" -f $PgDatabase) -NoOutput

$ddlPath = Join-Path (Get-Location) "evidencia_indices/01_ddl_para_evidencia.sql"
Invoke-PsqlFile -Database $PgDatabase -FilePath $ddlPath
Write-Host "DDL cargado correctamente" -ForegroundColor Green

# 2. Cargar volumen de datos
Write-Host "[2/5] Cargando volumen de datos sintéticos (puede tardar varios minutos)..." -ForegroundColor Yellow
$volumenPath = Join-Path (Get-Location) "evidencia_indices/01_cargar_volumen.sql"
Invoke-PsqlFile -Database $PgDatabase -FilePath $volumenPath
Write-Host "Volumen cargado y ANALYZE ejecutado" -ForegroundColor Green

# Obtener conteos y tamaños
$countsQuery = @"
SELECT 'accounts' AS tabla, COUNT(*) AS filas, pg_size_pretty(pg_total_relation_size('accounts')) AS tamaño_total
FROM accounts
UNION ALL SELECT 'profiles', COUNT(*), pg_size_pretty(pg_total_relation_size('profiles')) FROM profiles
UNION ALL SELECT 'plans', COUNT(*), pg_size_pretty(pg_total_relation_size('plans')) FROM plans
UNION ALL SELECT 'subscriptions', COUNT(*), pg_size_pretty(pg_total_relation_size('subscriptions')) FROM subscriptions
UNION ALL SELECT 'payments', COUNT(*), pg_size_pretty(pg_total_relation_size('payments')) FROM payments;
"@

$counts = Invoke-Psql -Database $PgDatabase -Query $countsQuery -NoOutput

$indexSizesQuery = @"
SELECT schemaname, relname AS tabla, indexrelname AS indice, pg_size_pretty(pg_relation_size(indexrelid)) AS tamaño
FROM pg_stat_user_indexes WHERE schemaname = 'public' ORDER BY relname, indexrelname;
"@

$indexSizes = Invoke-Psql -Database $PgDatabase -Query $indexSizesQuery -NoOutput

Write-Host "`nConteos y tamaños:" -ForegroundColor Cyan
Write-Host $counts
Write-Host "`nTamaños de índices:" -ForegroundColor Cyan
Write-Host $indexSizes

# 3. Información del sistema
Write-Host "[3/5] Recopilando información del entorno..." -ForegroundColor Yellow
$sysInfo = Get-SystemInfo

# 4. Ejecutar mediciones
Write-Host ("[4/5] Ejecutando mediciones EXPLAIN (ANALYZE, BUFFERS) x{0} cada caso..." -f $Repetitions) -ForegroundColor Yellow

$allResults = @{}

# ---- CONSULTA A: Informe ingresos por plan ----
Write-Host "`n=== CONSULTA A: Informe ingresos por plan ===" -ForegroundColor Magenta

# A1: 1 mes SIN ix_payments_paidat
Write-Host "`nA1: Rango 1 mes (ene 2025) SIN ix_payments_paidat" -ForegroundColor Cyan
Invoke-Psql -Database $PgDatabase -Query "DROP INDEX IF EXISTS ix_payments_paidat; ANALYZE payments;" -NoOutput
$queryA1 = @"
SELECT pl.name AS plan, SUM(pay.amount) AS total_ingresos, COUNT(DISTINCT s.subscriptionId) AS num_suscripciones
FROM payments pay
JOIN subscriptions s ON s.subscriptionId = pay.subscriptionId
JOIN plans pl ON pl.planId = s.planId
WHERE pay.paidAt >= '2025-01-01' AND pay.paidAt < '2025-02-01'
GROUP BY pl.name ORDER BY total_ingresos DESC;
"@
$allResults.A1_sin = Run-ExplainMultiple -Database $PgDatabase -Query $queryA1 -OutputPrefix "A1_1mes_sin_idx" -Reps $Repetitions

# A1: 1 mes CON ix_payments_paidat
Write-Host "`nA1: Rango 1 mes (ene 2025) CON ix_payments_paidat" -ForegroundColor Cyan
Invoke-Psql -Database $PgDatabase -Query "CREATE INDEX ix_payments_paidat ON payments (paidAt); ANALYZE payments;" -NoOutput
$allResults.A1_con = Run-ExplainMultiple -Database $PgDatabase -Query $queryA1 -OutputPrefix "A1_1mes_con_idx" -Reps $Repetitions

# A2: 1 año SIN ix_payments_paidat
Write-Host "`nA2: Rango 1 año (2025) SIN ix_payments_paidat" -ForegroundColor Cyan
Invoke-Psql -Database $PgDatabase -Query "DROP INDEX IF EXISTS ix_payments_paidat; ANALYZE payments;" -NoOutput
$queryA2 = @"
SELECT pl.name AS plan, SUM(pay.amount) AS total_ingresos, COUNT(DISTINCT s.subscriptionId) AS num_suscripciones
FROM payments pay
JOIN subscriptions s ON s.subscriptionId = pay.subscriptionId
JOIN plans pl ON pl.planId = s.planId
WHERE pay.paidAt >= '2025-01-01' AND pay.paidAt < '2026-01-01'
GROUP BY pl.name ORDER BY total_ingresos DESC;
"@
$allResults.A2_sin = Run-ExplainMultiple -Database $PgDatabase -Query $queryA2 -OutputPrefix "A2_1ano_sin_idx" -Reps $Repetitions

# A2: 1 año CON ix_payments_paidat
Write-Host "`nA2: Rango 1 año (2025) CON ix_payments_paidat" -ForegroundColor Cyan
Invoke-Psql -Database $PgDatabase -Query "CREATE INDEX ix_payments_paidat ON payments (paidAt); ANALYZE payments;" -NoOutput
$allResults.A2_con = Run-ExplainMultiple -Database $PgDatabase -Query $queryA2 -OutputPrefix "A2_1ano_con_idx" -Reps $Repetitions

# ---- CONSULTA B: Verificación reproducción ----
Write-Host "`n=== CONSULTA B: Verificación al iniciar reproducción ===" -ForegroundColor Magenta

# Buscar una cuenta con suscripción vigente en 2026-11-15
$testAccountQuery = @"
SELECT s.accountId, p.profileId
FROM profiles p
JOIN subscriptions s ON s.accountId = p.accountId
WHERE p.isActive = 'Y'
  AND s.startsAt <= '2026-11-15' AND '2026-11-15' < s.endsAt
LIMIT 1;
"@

$testAccount = Invoke-Psql -Database $PgDatabase -Query $testAccountQuery -NoOutput

# Parsear accountId y profileId - psql output format: " accountid | profileid \n-------+----------\n 12345 | 67890"
$lines = $testAccount -split "`r?`n"
$dataLine = $lines | Where-Object { $_ -match '^\s*\d+\s+\|\s+\d+' } | Select-Object -First 1
if ($dataLine -match '(\d+)\s+\|\s+(\d+)') {
    $accId = $matches[1]
    $profId = $matches[2]
} else {
    # Fallback: buscar primera cuenta con perfiles
    $fallback = Invoke-Psql -Database $PgDatabase -Query "SELECT accountId FROM profiles WHERE isActive = 'Y' LIMIT 1;" -NoOutput
    if ($fallback -match '(\d+)') { $accId = $matches[1] } else { $accId = "1" }
    $profId = "1"
}
Write-Host ("  Cuenta de prueba: accountId={0}, profileId={1}" -f $accId, $profId) -ForegroundColor Gray

$queryB = "SELECT s.subscriptionId, s.planId, p.maxAgeRating FROM profiles p JOIN subscriptions s ON s.accountId = p.accountId WHERE p.profileId = $profId AND p.accountId = $accId AND p.isActive = 'Y' AND s.startsAt <= '2026-11-15 20:00:00' AND '2026-11-15 20:00:00' < s.endsAt;"

# B SIN ix_subs_account_start
Write-Host "`nB: Verificación SIN ix_subs_account_start" -ForegroundColor Cyan
Invoke-Psql -Database $PgDatabase -Query "DROP INDEX IF EXISTS ix_subs_account_start; ANALYZE subscriptions;" -NoOutput
$allResults.B_sin = Run-ExplainMultiple -Database $PgDatabase -Query $queryB -OutputPrefix "B_verificacion_sin_idx" -Reps $Repetitions

# B CON ix_subs_account_start
Write-Host "`nB: Verificación CON ix_subs_account_start" -ForegroundColor Cyan
Invoke-Psql -Database $PgDatabase -Query "CREATE INDEX ix_subs_account_start ON subscriptions (accountId, startsAt DESC); ANALYZE subscriptions;" -NoOutput
$allResults.B_con = Run-ExplainMultiple -Database $PgDatabase -Query $queryB -OutputPrefix "B_verificacion_con_idx" -Reps $Repetitions

# ---- CONSULTA C: Perfiles activos ----
Write-Host "`n=== CONSULTA C: Perfiles activos de una cuenta ===" -ForegroundColor Magenta

$queryC = "SELECT profileId, name, maxAgeRating, isActive FROM profiles WHERE accountId = $accId AND isActive = 'Y' ORDER BY profileId;"

# C SIN ix_profiles_account_active
Write-Host "`nC: Perfiles activos SIN ix_profiles_account_active" -ForegroundColor Cyan
Invoke-Psql -Database $PgDatabase -Query "DROP INDEX IF EXISTS ix_profiles_account_active; ANALYZE profiles;" -NoOutput
$allResults.C_sin = Run-ExplainMultiple -Database $PgDatabase -Query $queryC -OutputPrefix "C_perfiles_sin_idx" -Reps $Repetitions

# C CON ix_profiles_account_active
Write-Host "`nC: Perfiles activos CON ix_profiles_account_active" -ForegroundColor Cyan
Invoke-Psql -Database $PgDatabase -Query "CREATE INDEX ix_profiles_account_active ON profiles (accountId, isActive); ANALYZE profiles;" -NoOutput
$allResults.C_con = Run-ExplainMultiple -Database $PgDatabase -Query $queryC -OutputPrefix "C_perfiles_con_idx" -Reps $Repetitions

# 5. Generar resultados.md
Write-Host "`n[5/5] Generando resultados.md..." -ForegroundColor Yellow

$mdPath = Join-Path (Get-Location) "evidencia_indices/resultados.md"
$readmePath = Join-Path (Get-Location) "evidencia_indices/README.md"

$mdLines = @()
$mdLines += "# Evidencia de medición de índices - CineConecta (M-09)"
$mdLines += ""
$mdLines += "## Objetivo"
$mdLines += "Medir el efecto de los índices ix_payments_paidat, ix_subs_account_start e ix_profiles_account_active en PostgreSQL con un volumen realista de datos (~150k cuentas, ~1M suscripciones, ~1M pagos), y dejar la evidencia lista para incluir en el documento técnico."
$mdLines += ""
$mdLines += "## Entorno"
$mdLines += "- **PostgreSQL**: $($sysInfo.PostgresVersion)"
$mdLines += "- **Sistema operativo**: $($sysInfo.OS) (host Windows), contenedor Docker Linux"
$mdLines += "- **CPU**: $($sysInfo.CPU)"
$mdLines += "- **RAM**: $($sysInfo.RAM_GB) GB"
$mdLines += "- **shared_buffers**: $($sysInfo.SharedBuffers)"
$mdLines += "- **work_mem**: $($sysInfo.WorkMem)"
$mdLines += "- **Nota**: $($sysInfo.ContainerNote)"
$mdLines += ""
$mdLines += "## Volumen de datos cargado"
$mdLines += $counts.Trim()
$mdLines += ""
$mdLines += "### Tamaños de índices"
$mdLines += $indexSizes.Trim()
$mdLines += ""
$mdLines += "## Consultas medidas"
$mdLines += ""
$mdLines += "### Consulta A: Informe de ingresos por plan (principal)"
$mdLines += "SUM(amount) y COUNT de suscripciones por plan, filtrando pagos por paidAt en un rango de fechas."
$mdLines += "Dos rangos: **1 mes** (enero 2025) y **1 año completo** (2025)."
$mdLines += "Compara ejecución **SIN** ix_payments_paidat y **CON** ix_payments_paidat."
$mdLines += ""
$mdLines += "#### A1: Rango 1 mes (2025-01-01 a 2025-02-01)"
$mdLines += Format-ResultBlock "SIN índice ix_payments_paidat" $allResults.A1_sin
$mdLines += Format-ResultBlock "CON índice ix_payments_paidat" $allResults.A1_con
$mdLines += ""
$mdLines += "#### A2: Rango 1 año completo (2025-01-01 a 2026-01-01)"
$mdLines += Format-ResultBlock "SIN índice ix_payments_paidat" $allResults.A2_sin
$mdLines += Format-ResultBlock "CON índice ix_payments_paidat" $allResults.A2_con
$mdLines += ""
$mdLines += "### Consulta B: Verificación al iniciar una reproducción (sql/03)"
$mdLines += ("Busca la suscripción vigente de una cuenta y su perfil activo (parámetros: accountId={0}, profileId={1}, now=2026-11-15 20:00:00)." -f $accId, $profId)
$mdLines += "Compara **SIN** ix_subs_account_start y **CON** ix_subs_account_start."
$mdLines += "Nota: la restricción ex_subs_no_overlap crea un índice GiST sobre (accountId, tsrange(startsAt, endsAt)) que el planificador puede usar."
$mdLines += ""
$mdLines += Format-ResultBlock "SIN índice ix_subs_account_start" $allResults.B_sin
$mdLines += Format-ResultBlock "CON índice ix_subs_account_start" $allResults.B_con
$mdLines += ""
$mdLines += "### Consulta C: Perfiles activos de una cuenta"
$mdLines += ("Selecciona perfiles con isActive = 'Y' para un accountId dado ({0})." -f $accId)
$mdLines += "Compara **SIN** ix_profiles_account_active y **CON** ix_profiles_account_active."
$mdLines += ""
$mdLines += Format-ResultBlock "SIN índice ix_profiles_account_active" $allResults.C_sin
$mdLines += Format-ResultBlock "CON índice ix_profiles_account_active" $allResults.C_con
$mdLines += ""
$mdLines += "## Interpretación honesta"
$mdLines += ""
$mdLines += "### Consulta A (ingresos por plan)"
$mdLines += "- **Rango 1 mes**: El índice ix_payments_paidat permite un Index Scan / Bitmap Index Scan sobre payments reduciendo drásticamente las filas leídas y buffers. Mejora significativa esperada."
$mdLines += "- **Rango 1 año**: Al abarcar ~1/3 o más de la tabla, el planificador puede preferir Seq Scan aunque el índice exista (coste de acceso aleatorio vs secuencial). Si el índice se usa, será Bitmap Heap Scan; la mejora será menor o nula."
$mdLines += ""
$mdLines += "### Consulta B (verificación reproducción)"
$mdLines += "- La consulta une profiles (filtrado por PK profileId + accountId + isActive) con subscriptions (filtrado por accountId y rango de fechas)."
$mdLines += "- **SIN** ix_subs_account_start: el planificador puede usar el índice GiST de ex_subs_no_overlap (que cubre accountId + rango) para la búsqueda de suscripción vigente, o hacer Seq Scan en subscriptions."
$mdLines += "- **CON** ix_subs_account_start: índice B-tree en (accountId, startsAt DESC) optimiza el ordenamiento y la búsqueda del rango startsAt <= now < endsAt."
$mdLines += "- Si el GiST ya resolvía bien la consulta, la mejora del B-tree puede ser marginal. Se debe comparar nodos y buffers."
$mdLines += ""
$mdLines += "### Consulta C (perfiles activos)"
$mdLines += "- **SIN** índice: Seq Scan en profiles filtrando accountId e isActive."
$mdLines += "- **CON** índice ix_profiles_account_active (accountId, isActive): Index Scan o Bitmap Index Scan directo a las filas activas de esa cuenta."
$mdLines += "- Mejora clara esperada porque la selectividad de isActive = 'Y' por cuenta es alta (pocas filas por cuenta)."
$mdLines += ""
$mdLines += "## Cómo reproducir"
$mdLines += "1. Asegurar Docker Desktop corriendo con contenedor cine-evidencia en puerto 5433."
$mdLines += "2. Ejecutar: powershell -File evidencia_indices/03_medir.ps1"
$mdLines += "3. Los EXPLAIN completos quedan en evidencia_indices/salida/."
$mdLines += "4. Este resultados.md se genera al final."
$mdLines += ""

$mdLines -join "`n" | Out-File -FilePath $mdPath -Encoding UTF8

# README.md
$readmeLines = @()
$readmeLines += "# Evidencia de índices - CineConecta (M-09)"
$readmeLines += ""
$readmeLines += "## Requisitos"
$readmeLines += "- Windows con PowerShell"
$readmeLines += "- Docker Desktop corriendo"
$readmeLines += "- Contenedor cine-evidencia en puerto 5433 (PostgreSQL 16)"
$readmeLines += "- psql en PATH (opcional; el script usa docker exec)"
$readmeLines += ""
$readmeLines += "## Ejecución completa"
$readmeLines += "```powershell"
$readmeLines += "powershell -File evidencia_indices/03_medir.ps1"
$readmeLines += "```"
$readmeLines += ""
$readmeLines += 'El script:'
$readmeLines += '1. Crea la BD cine_evidencia y carga el DDL (sql/01_postgresql_ddl.sql)'
$readmeLines += '2. Genera datos sintéticos (~150k cuentas, ~1M subs, ~1M pagos) con evidencia_indices/01_cargar_volumen.sql'
$readmeLines += '3. Ejecuta las 3 consultas (A, B, C) con y sin cada índice, repitiendo 5 veces con EXPLAIN (ANALYZE, BUFFERS)'
$readmeLines += '4. Guarda cada EXPLAIN en evidencia_indices/salida/'
$readmeLines += '5. Genera evidencia_indices/resultados.md listo para Word'
$readmeLines += ""
$readmeLines += "## Archivos generados"
$readmeLines += "- 01_cargar_volumen.sql — carga de datos reproducible (semilla fija)"
$readmeLines += "- 02_consultas.sql — consultas de referencia con parámetros"
$readmeLines += "- 03_medir.ps1 — script principal de medición (este archivo)"
$readmeLines += "- salida/*.txt — EXPLAIN completos de cada ejecución"
$readmeLines += "- resultados.md — reporte final en español, sin tablas ni colores"
$readmeLines += "- README.md — este archivo"
$readmeLines += ""
$readmeLines += "## Notas"
$readmeLines += "- No se escriben contraseñas ni cadenas de conexión en archivos."
$readmeLines += '- Usa session_replication_role = replica para carga masiva rápida y reactiva triggers al final.'
$readmeLines += "- Si la carga supera 25 min o memoria, el SQL reduce volumen a la mitad (comentado en el script)."
$readmeLines += "- El índice GiST de ex_subs_no_overlap no se puede dropear sin dropear la constraint; se deja activo siempre."

$readmeLines -join "`n" | Out-File -FilePath $readmePath -Encoding UTF8

Write-Host "`n============================================================" -ForegroundColor Green
Write-Host '  COMPLETADO' -ForegroundColor Green
Write-Host '============================================================' -ForegroundColor Green
Write-Host "Archivos creados:"
Write-Host ("  - {0}" -f $mdPath)
Write-Host ("  - {0}" -f $readmePath)
Write-Host ("  - {0}\*.txt (EXPLAIN de cada ejecución)" -f $fullOutputDir)
Write-Host ""
Write-Host "Volumen final:" -ForegroundColor Cyan
Write-Host $counts.Trim()
Write-Host ""
Write-Host "Resumen de resultados:" -ForegroundColor Cyan
$allResults.GetEnumerator() | ForEach-Object {
    $k = $_.Key; $v = $_.Value
    Write-Host ("  {0}: nodo={1}, 1ra={2}ms, min={3}ms, med={4}ms, max={5}ms, filas={6}, buffers={7}" -f $k, $v.NodeType, $v.FirstRun, $v.Min, $v.Median, $v.Max, $v.Rows, $v.Buffers)
}
Write-Host ""
Write-Host 'Ejecuta git status para ver archivos nuevos.' -ForegroundColor Gray