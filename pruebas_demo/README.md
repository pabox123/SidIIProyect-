# CineConecta - Demo Transaccional (M-06)

Pruebas de integridad transaccional para la funcion sp_contratar_suscripcion en PostgreSQL.

## Que prueba este script

Valida tres propiedades fundamentales del modelo relacional:

1. Concurrencia (Prueba 1): Dos sesiones intentan contratar suscripcion para la misma cuenta simultaneamente. Solo una debe tener exito; la otra debe fallar por bloqueo (FOR UPDATE) o por constraint de exclusion (EXCLUDE). En todos los casos: exactamente 1 suscripcion y 1 pago por cuenta.

2. Atomicidad (Prueba 2): Tres variantes de fallo a mitad de transaccion:
   - 2a: reference duplicado en payments (fallo en segundo INSERT)
   - 2b: Error provocado (division por cero) tras INSERT de suscripcion, con ROLLBACK
   - 2c: pg_terminate_backend mata la sesion durante pg_sleep(10)
   - 2d (opcional): Trigger diferido ctr_subscription_requires_payment rechaza COMMIT sin pago

   En todos los casos: cero suscripciones y cero pagos de esa cuenta.

3. Verificaciones globales (Prueba 3): Consultas que deben devolver 0 filas:
   - Suscripciones superpuestas por cuenta (autounion con tsrange)
   - Suscripciones sin pago (trigger diferido exige 1-1)
   - Pagos sin suscripcion (FK lo impide)
   - Total suscripciones = total pagos en toda la base
   - Por cada cuenta de prueba: conteo de suscripciones y pagos vs. esperado

## Requisitos

- psql (PostgreSQL client) en PATH
- Base de datos PostgreSQL con el esquema CineConecta cargado (sql/01_postgresql_ddl.sql)
- Datos sinteticos base cargados (sql/04_datos_sinteticos.sql) -- opcional pero recomendado
- Variables de entorno de conexion (una de estas dos formas):

```bash
# Opcion A: Variables individuales
export PGHOST=ep-cold-silence-bd21ad3g.c-8.us-east-2.aws.neon.tech
export PGPORT=5432
export PGUSER=cineconecta_user
export PGPASSWORD=tu_password
export PGDATABASE=neondb
export PGSSLMODE=require

# Opcion B: DATABASE_URL
export DATABASE_URL="postgresql://user:pass@host:port/dbname"
```

Seguridad: Nunca escribas credenciales en archivos. El script solo lee variables de entorno.

## Como ejecutar

```bash
cd pruebas_demo

# Obligatorio: confirma que entiendes que escribe datos
CONFIRMAR_PRUEBAS=si ./demo_transaccional.sh
```

### Opciones

| Opcion | Efecto |
|--------|--------|
| --conservar | No borra las cuentas de prueba al final (para inspeccion manual con psql) |

### Ejemplo completo

```bash
# Contra base local de pruebas
PGHOST=localhost PGPORT=5432 PGUSER=cineconecta_user PGPASSWORD=secret PGDATABASE=cineconecta_test \
  CONFIRMAR_PRUEBAS=si ./demo_transaccional.sh

# Contra rama de pruebas Neon (ejemplo)
DATABASE_URL="postgresql://user:pass@ep-xxx.us-east-1.aws.neon.tech/cineconecta_test?sslmode=require" \
  CONFIRMAR_PRUEBAS=si ./demo_transaccional.sh --conservar
```

## Que imprime el script

- Cabecera con conexion (password oculto), zona horaria UTC, archivo de salida
- Prueba 1: Version determinista (con pg_sleep) + version estres (20 cuentas x 2 procesos paralelos)
  - Muestra el error exacto que devolvio el segundo intento
  - Conteo final de suscripciones/pagos por cuenta
  - Linea PASS o FAIL con motivo
- Prueba 2: Cada variante con su resultado y conteo (0,0 esperado)
- Prueba 3: Salida completa de verificaciones.sql + resumen por cuenta de prueba
- Resumen global con codigo de salida 0 (todo PASS) o 1 (algun FAIL)

La salida se guarda duplicada en salida/demo_YYYYMMDD_HHMMSS.txt.

## Estructura de archivos

```
pruebas_demo/
├── demo_transaccional.sh       # Script principal (bash + psql)
├── limpieza_owner.sql          # Limpieza manual (ejecutar con usuario dueño)
├── verificaciones.sql          # Consultas de verificacion (ejecutables a mano)
├── README.md                   # Este archivo
└── salida/                     # Resultados de cada ejecucion
    └── demo_20261126_221437.txt
```

## Limpieza de datos de prueba

El script crea cuentas con email `demo_tx_<RUNID>_<aleatorio>@example.com` donde RUNID es un identificador unico por ejecucion.

### Limpieza automatica (si el usuario tiene DELETE)

Al inicio, el script verifica con `has_table_privilege` si el usuario actual (cineconecta_user) tiene privilegio DELETE en las tablas `accounts`, `profiles`, `subscriptions` y `payments`.

- **Si tiene DELETE**: la limpieza se hace automaticamente al final (y en trap INT/TERM/ERR) en una sola transaccion y en orden de FKs (pagos -> suscripciones -> perfiles -> cuentas).
- **Si NO tiene DELETE** (caso normal con cineconecta_user): el script NO intenta borrar. Al final imprime:

```
Limpieza pendiente: ejecutar pruebas_demo/limpieza_owner.sql con el usuario dueño.
Cuentas demo_tx_ de esta corrida que quedan en la base: N
```

Esto **no** cambia el resultado PASS/FAIL de las pruebas.

### Limpieza manual con limpieza_owner.sql

Archivo: `pruebas_demo/limpieza_owner.sql`

Ejecuta en el **SQL Editor de Neon** (o con psql como `cineconecta_owner`):

```sql
-- En SQL Editor de Neon:
-- 1. Abre el proyecto -> SQL Editor
-- 2. Pega el contenido de limpieza_owner.sql
-- 3. Ejecuta (Run)

-- O desde terminal con el usuario dueño:
psql -U cineconecta_owner -d neondb -f pruebas_demo/limpieza_owner.sql
```

El script borra en orden de FKs y al final muestra `cuentas_demo_tx_restantes`. Debe ser 0.

## Ejecutar solo las verificaciones (sin pruebas de escritura)

```bash
# Con psql directamente
PGOPTIONS="-c timezone=UTC" psql -f verificaciones.sql

# O desde el script (solo verificacion, sin CONFIRMAR_PRUEBAS)
# El script requiere CONFIRMAR_PRUEBAS=si para las pruebas 1 y 2.
# Para solo verificacion, ejecuta el .sql a mano.
```

## Que hace cada prueba en detalle

### Prueba 1 - Concurrencia

Version determinista:
1. Crea cuenta nueva `demo_tx_<RUNID>_XXXXXX@example.com`
2. Sesion A: BEGIN; sp_contratar_suscripcion(...); pg_sleep(3); COMMIT;
3. 1 segundo despues, Sesion B: sp_contratar_suscripcion(...) (misma cuenta, distinta reference)
4. Sesion B bloquea en FOR UPDATE de accounts, espera a que A haga COMMIT
5. Al obtener el lock, Sesion B ve la suscripcion insertada por A y falla con:
   `ERROR: La cuenta X ya tiene una suscripcion vigente`
6. Resultado: 1 suscripcion, 1 pago

Version estres (20 repeticiones):
- 20 cuentas nuevas, cada una con 2 procesos psql lanzados en paralelo (sin pg_sleep)
- Mismo resultado esperado: exactamente 1 exito y 1 fallo por cuenta

### Prueba 2 - Atomicidad

| Variante | Que hace | Esperado |
|----------|----------|----------|
| 2a | Llama sp_contratar_suscripcion con reference que YA EXISTE en payments | Falla en INSERT payment (unicidad). Rollback total: 1 sub + 1 pago (el original), 0 nuevos |
| 2b | Transaccion manual: INSERT subscription -> SELECT 1/0 (error) -> ROLLBACK | 0 sub, 0 pagos |
| 2c | Sesion llama funcion + pg_sleep(10). Otra sesion hace pg_terminate_backend(pid) | 0 sub, 0 pagos (terminacion = rollback implicito) |
| 2d | INSERT subscription (sin payment) -> COMMIT. Trigger diferido valida al commit | Falla con `La suscripcion X no tiene pago asociado`. 0 sub, 0 pagos |

### Prueba 3 - Verificaciones

Ejecuta verificaciones.sql que comprueba:

```sql
-- 1. Suscripciones superpuestas (0 filas)
SELECT ... FROM subscriptions s1 JOIN subscriptions s2
  ON s2.accountId = s1.accountId
  AND tsrange(s1.startsAt, s1.endsAt, '[)') && tsrange(s2.startsAt, s2.endsAt, '[)');

-- 2. Suscripciones sin pago (0 filas)
SELECT ... FROM subscriptions s LEFT JOIN payments p ON p.subscriptionId = s.subscriptionId
WHERE p.paymentId IS NULL;

-- 3. Pagos sin suscripcion (0 filas)
SELECT ... FROM payments p LEFT JOIN subscriptions s ON s.subscriptionId = p.subscriptionId
WHERE s.subscriptionId IS NULL;

-- 4. Por cuenta demo_tx_*: n_subs vs n_pays
-- 5. Totales globales: COUNT(subscriptions) = COUNT(payments)
-- 6. Unicidad de reference en payments
-- 7. Constraint 30 dias exactos (ck_subs_30days)
```

## Interpretacion de resultados

| Resultado | Significado |
|-----------|-------------|
| PASS | Todo correcto: concurrencia serializada, atomicidad garantizada, integridad global |
| FAIL | Alguna prueba fallo. Revisa la salida para ver que cuenta y que conteo salio mal |

### Fallos comunes y que indican

| Sintoma | Causa probable |
|---------|----------------|
| Prueba 1: 2 suscripciones o 0 pagos | FOR UPDATE no esta en la funcion, o isolation level no es READ COMMITTED |
| Prueba 1 estres: conteos variables | Race condition no cubierta por FOR UPDATE + EXCLUDE |
| Prueba 2a: queda suscripcion sin pago | Trigger ctr_subscription_requires_payment no es DEFERRABLE INITIALLY DEFERRED |
| Prueba 2b/2c: quedan registros | Transaccion no se revierte (autocommit on, o error no atrapado) |
| Prueba 3: filas en superpuestas/sin pago | Datos base corruptos o triggers no funcionan |

## Notas tecnicas

- Zona horaria: Todas las conexiones usan PGOPTIONS="-c timezone=UTC" para consistencia temporal
- Prefijo de prueba: Cuentas creadas con email `demo_tx_<RUNID>_<random>@example.com` -- no colisionan con datos sinteticos base ni entre corridas
- Limpieza ordenada: Pagos -> Suscripciones -> Perfiles -> Cuentas (respeta FKs)
- Trap ERR/INT/TERM: Si el script falla o se interrumpe, ejecuta limpieza automatica (salvo --conservar) o avisa de limpieza pendiente
- Sin credenciales en disco: Solo variables de entorno; salida oculta passwords
- set -e con blindaje: wait, grep y aritmetica no matan el script

## Solucion de problemas

### psql: command not found
Instala PostgreSQL client tools. En Windows: installer de PostgreSQL incluye psql.exe.

### CONFIRMAR_PRUEBAS=si no funciona en PowerShell
Usa: `$env:CONFIRMAR_PRUEBAS="si"; ./demo_transaccional.sh`
O ejecuta desde Git Bash / WSL.

### Error de conexion
Verifica que las variables PGHOST/PGPORT/PGUSER/PGPASSWORD/PGDATABASE o DATABASE_URL sean correctas y la base acepte conexiones.

### Function sp_contratar_suscripcion does not exist
Ejecuta primero sql/01_postgresql_ddl.sql en la base de destino.

### Timeout en Prueba 2c (pg_terminate_backend)
El script espera 1s antes de buscar el PID. Si la BD esta muy cargada, aumenta el sleep en el script (linea ~400).

### El host contiene "-pooler"
El script detecta pooler y se detiene. Usa el host directo (sin -pooler) porque pg_terminate_backend no funciona a traves del pooler de Neon.

---

Version: M-06 Demo Transaccional
Esquema requerido: sql/01_postgresql_ddl.sql (planes, accounts, profiles, subscriptions, payments, triggers, sp_contratar_suscripcion)
Datos base opcionales: sql/04_datos_sinteticos.sql