#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SALIDA_DIR="${SCRIPT_DIR}/salida"
TIMESTAMP=$(date '+%Y%m%d_%H%M%S')
SALIDA_FILE="${SALIDA_DIR}/demo_${TIMESTAMP}.txt"
CONSERVAR=false

for arg in "$@"; do
  case $arg in
    --conservar) CONSERVAR=true ;;
    *) echo "Opción desconocida: $arg" >&2; exit 1 ;;
  esac
done

if [[ "${CONFIRMAR_PRUEBAS:-}" != "si" ]]; then
  echo "ERROR: Debe definir CONFIRMAR_PRUEBAS=si para ejecutar las pruebas." >&2
  echo "Esto escribe datos en la base de datos. Use una base de pruebas (local o rama Neon), nunca producción." >&2
  exit 1
fi

if ! command -v psql &>/dev/null; then
  echo "ERROR: psql no está instalado o no está en PATH." >&2
  exit 1
fi

if [[ -z "${DATABASE_URL:-}" && ( -z "${PGHOST:-}" || -z "${PGPORT:-}" || -z "${PGUSER:-}" || -z "${PGPASSWORD:-}" || -z "${PGDATABASE:-}" ) ]]; then
  echo "ERROR: Faltan variables de conexión. Defina DATABASE_URL o PGHOST/PGPORT/PGUSER/PGPASSWORD/PGDATABASE." >&2
  exit 1
fi

if [[ -n "${DATABASE_URL:-}" ]]; then
  CONN_DISPLAY="${DATABASE_URL}"
  CONN_DISPLAY="${CONN_DISPLAY//:*@*/:****@}"
else
  CONN_DISPLAY="postgresql://${PGUSER}:****@${PGHOST}:${PGPORT}/${PGDATABASE}"
fi

# Detect pooler
if [[ "${CONN_DISPLAY}" == *"-pooler"* ]]; then
  echo "ADVERTENCIA: Conexión usa pooler (-pooler). Las pruebas necesitan conexión directa (pg_terminate_backend no funciona con pooler)."
  echo "Deteniendo. Use conexión directa a la base de datos."
  exit 1
fi

echo "================================================================="
echo "CineConecta - Demo Transaccional M-06"
echo "================================================================="
echo "Conexión: ${CONN_DISPLAY}"
echo "Zona horaria: UTC (PGOPTIONS=-c timezone=UTC)"
echo "Salida: ${SALIDA_FILE}"
echo "Conservar datos: ${CONSERVAR}"
echo "================================================================="

run_psql() {
  local sql="$1"
  PGOPTIONS="-c timezone=UTC" psql -v ON_ERROR_STOP=1 -q -X -c "$sql" 2>&1
}

run_psql_capture() {
  local sql="$1"
  PGOPTIONS="-c timezone=UTC" psql -v ON_ERROR_STOP=0 -q -X -c "$sql" 2>&1
}

log() {
  echo "$@" | tee -a "${SALIDA_FILE}"
}

log "Inicio: $(date '+%Y-%m-%d %H:%M:%S')"
log "Conexión: ${CONN_DISPLAY}"
log ""

# RUNID único para esta ejecución: 6 chars hex
RUNID=$(openssl rand -hex 3 2>/dev/null || cat /dev/urandom | tr -dc 'a-f0-9' | head -c 6)
EMAIL_PREFIX="demo_tx_${RUNID}"
log "RUNID: ${RUNID} (prefijo de prueba: ${EMAIL_PREFIX}_*@example.com)"

# Verificar permisos de DELETE en las 4 tablas con has_table_privilege
log "Verificando permisos de DELETE en tablas de prueba..."
CAN_DELETE_ACCOUNTS=$(run_psql "SELECT has_table_privilege(current_user, 'accounts', 'DELETE');" | tail -n +3 | head -n 1 | xargs)
CAN_DELETE_PROFILES=$(run_psql "SELECT has_table_privilege(current_user, 'profiles', 'DELETE');" | tail -n +3 | head -n 1 | xargs)
CAN_DELETE_SUBS=$(run_psql "SELECT has_table_privilege(current_user, 'subscriptions', 'DELETE');" | tail -n +3 | head -n 1 | xargs)
CAN_DELETE_PAYS=$(run_psql "SELECT has_table_privilege(current_user, 'payments', 'DELETE');" | tail -n +3 | head -n 1 | xargs)

HAS_DELETE=false
if [[ "${CAN_DELETE_ACCOUNTS}" == "t" && "${CAN_DELETE_PROFILES}" == "t" && "${CAN_DELETE_SUBS}" == "t" && "${CAN_DELETE_PAYS}" == "t" ]]; then
  HAS_DELETE=true
  log "Permisos DELETE: SÍ (accounts=${CAN_DELETE_ACCOUNTS}, profiles=${CAN_DELETE_PROFILES}, subscriptions=${CAN_DELETE_SUBS}, payments=${CAN_DELETE_PAYS})"
else
  log "Permisos DELETE: NO (accounts=${CAN_DELETE_ACCOUNTS}, profiles=${CAN_DELETE_PROFILES}, subscriptions=${CAN_DELETE_SUBS}, payments=${CAN_DELETE_PAYS})"
  log "La limpieza será manual con pruebas_demo/limpieza_owner.sql"
fi

gen_test_email() {
  local random_suffix=$(openssl rand -hex 6 2>/dev/null || cat /dev/urandom | tr -dc 'a-f0-9' | head -c 12)
  echo "${EMAIL_PREFIX}_${random_suffix}@example.com"
}

gen_test_reference() {
  local prefix="DEMO_TX"
  local random_suffix=$(openssl rand -hex 8 2>/dev/null || cat /dev/urandom | tr -dc 'a-f0-9' | head -c 16)
  echo "${prefix}_${random_suffix}"
}

get_plan_id() {
  run_psql "SELECT planId FROM plans ORDER BY planId LIMIT 1;" | tail -n +3 | head -n 1 | xargs
}

create_test_account() {
  local email="$1"
  local plan_id="$2"
  local hash='$2a$10$RpxcT2DZPshwmANBMILFmex8jpg9COHMlEvjtZBJS9D76fgPXZIr2'

  run_psql "
    INSERT INTO accounts (fullName, email, passwordHash)
    VALUES ('Demo Transaccional', '${email}', '${hash}')
    RETURNING accountId;
  " | tail -n +3 | head -n 1 | xargs
}

cleanup_test_data() {
  log ""
  log "=== LIMPIEZA DE DATOS DE PRUEBA ==="

  if [[ "${CONSERVAR}" == "true" ]]; then
    log "Opción --conservar activada: NO se borran los datos de prueba."
    log "Cuentas de prueba de esta corrida (${EMAIL_PREFIX}_*@example.com):"
    run_psql "SELECT accountId, email FROM accounts WHERE email LIKE '${EMAIL_PREFIX}_%@example.com' ORDER BY accountId;" | tee -a "${SALIDA_FILE}"
    return 0
  fi

  if [[ "${HAS_DELETE}" == "true" ]]; then
    log "Ejecutando limpieza automática (DELETE en una transacción)..."
    run_psql "
      BEGIN;
      DELETE FROM payments
      WHERE subscriptionId IN (SELECT subscriptionId FROM subscriptions WHERE accountId IN (SELECT accountId FROM accounts WHERE email LIKE '${EMAIL_PREFIX}_%@example.com'));
      DELETE FROM subscriptions WHERE accountId IN (SELECT accountId FROM accounts WHERE email LIKE '${EMAIL_PREFIX}_%@example.com');
      DELETE FROM profiles WHERE accountId IN (SELECT accountId FROM accounts WHERE email LIKE '${EMAIL_PREFIX}_%@example.com');
      DELETE FROM accounts WHERE email LIKE '${EMAIL_PREFIX}_%@example.com';
      COMMIT;
    " >/dev/null && log "Limpieza completada (pagos → suscripciones → perfiles → cuentas)." || log "ERROR en limpieza automática"
  else
    local remaining=$(run_psql "SELECT count(*) FROM accounts WHERE email LIKE '${EMAIL_PREFIX}_%@example.com';" | tail -n +3 | head -n 1 | xargs)
    log "Sin permiso DELETE. Limpieza pendiente: ejecutar pruebas_demo/limpieza_owner.sql con el usuario dueño."
    log "Cuentas demo_tx_ de esta corrida que quedan en la base: ${remaining}"
  fi
}

# Trap ERR para mostrar línea de error
trap 'echo "ERROR en la línea $LINENO" >&2' ERR
trap 'cleanup_test_data; log "INTERRUMPIDO - Limpieza ejecutada"; exit 1' INT TERM

log "Verificando existencia de sp_contratar_suscripcion..."
if ! run_psql "SELECT 1 FROM pg_proc WHERE proname = 'sp_contratar_suscripcion';" | grep -q "1"; then
  log "ERROR: La función sp_contratar_suscripcion no existe en la base de datos."
  log "Ejecute primero sql/01_postgresql_ddl.sql"
  cleanup_test_data
  exit 1
fi
log "Función sp_contratar_suscripcion: OK"

PLAN_ID=$(get_plan_id)
if [[ -z "${PLAN_ID}" ]]; then
  log "ERROR: No hay planes en la tabla plans."
  cleanup_test_data
  exit 1
fi
log "Plan de prueba: planId=${PLAN_ID}"

# ================================================================
# PRUEBA 1: Dos contrataciones simultáneas de la misma cuenta
# ================================================================
log ""
log "================================================================="
log "PRUEBA 1: Concurrencia - dos sesiones, misma cuenta"
log "================================================================="

PRUEBA1_PASS=true
PRUEBA1_DETAILS=()

# --- Versión determinista (con pg_sleep) ---
log ""
log "--- Versión determinista (pg_sleep) ---"

EMAIL1=$(gen_test_email)
ACCOUNT1=$(create_test_account "${EMAIL1}" "${PLAN_ID}")
log "Cuenta: accountId=${ACCOUNT1}"

REF1=$(gen_test_reference)
REF2=$(gen_test_reference)
log "Referencias: A=${REF1}, B=${REF2}"

# Ejecutar sesión A en background (con pg_sleep)
(
  PGOPTIONS="-c timezone=UTC" psql -v ON_ERROR_STOP=1 -q -X -c "
    BEGIN;
    SELECT sp_contratar_suscripcion(${ACCOUNT1}, ${PLAN_ID}, '${REF1}', true);
    SELECT pg_sleep(3);
    COMMIT;
  " >"${SALIDA_DIR}/prueba1_a_${TIMESTAMP}.txt" 2>&1
) &
PID_A=$!

# Ejecutar sesión B en background (sin pausa, debe bloquear y fallar)
(
  PGOPTIONS="-c timezone=UTC" psql -v ON_ERROR_STOP=0 -q -X -c "SELECT sp_contratar_suscripcion(${ACCOUNT1}, ${PLAN_ID}, '${REF2}', true);" >"${SALIDA_DIR}/prueba1_b_${TIMESTAMP}.txt" 2>&1
) &
PID_B=$!

sleep 1
wait ${PID_B} || true
RESULT_B=$(cat "${SALIDA_DIR}/prueba1_b_${TIMESTAMP}.txt" 2>/dev/null || echo "No output file")

wait ${PID_A} || true
RESULT_A=$(cat "${SALIDA_DIR}/prueba1_a_${TIMESTAMP}.txt" 2>/dev/null || echo "No output file")

SUBS_COUNT=$(run_psql "SELECT COUNT(*) FROM subscriptions WHERE accountId = ${ACCOUNT1};" | tail -n +3 | head -n 1 | xargs)
PAYS_COUNT=$(run_psql "SELECT COUNT(*) FROM payments p JOIN subscriptions s ON s.subscriptionId = p.subscriptionId WHERE s.accountId = ${ACCOUNT1};" | tail -n +3 | head -n 1 | xargs)

log "Cuenta ${ACCOUNT1}: ${SUBS_COUNT} sub, ${PAYS_COUNT} pago"

# Determinar quién ganó y quién falló
A_SUCCEEDED=false
B_SUCCEEDED=false
A_ERROR=""
B_ERROR=""

if echo "${RESULT_A}" | grep -q "sp_contratar_suscripcion" && echo "${RESULT_A}" | grep -q "^[[:space:]]*[0-9]"; then
  A_SUCCEEDED=true
elif echo "${RESULT_A}" | grep -qi "ya tiene una suscripci[oó]n vigente\|duplicate key\|exclu"; then
  A_ERROR=$(echo "${RESULT_A}" | grep -i "ERROR\|ya tiene\|duplicate\|exclu" | head -1 | sed 's/^[[:space:]]*//')
fi

if echo "${RESULT_B}" | grep -q "sp_contratar_suscripcion" && echo "${RESULT_B}" | grep -q "^[[:space:]]*[0-9]"; then
  B_SUCCEEDED=true
elif echo "${RESULT_B}" | grep -qi "ya tiene una suscripci[oó]n vigente\|duplicate key\|exclu"; then
  B_ERROR=$(echo "${RESULT_B}" | grep -i "ERROR\|ya tiene\|duplicate\|exclu" | head -1 | sed 's/^[[:space:]]*//')
fi

DET_PASS=true
if [[ "${SUBS_COUNT}" == "1" && "${PAYS_COUNT}" == "1" && ( "${A_SUCCEEDED}" == "true" || "${B_SUCCEEDED}" == "true" ) && ( "${A_SUCCEEDED}" != "${B_SUCCEEDED}" ) ]]; then
  log "Determinista: PASS (1 sub, 1 pago, una sesión OK, otra rechazada)"
  if [[ "${A_SUCCEEDED}" == "true" ]]; then
    log "  Ganó: Sesión A (ref ${REF1}) | Rechazada: Sesión B - ${B_ERROR:-error de suscripción vigente}"
  else
    log "  Ganó: Sesión B (ref ${REF2}) | Rechazada: Sesión A - ${A_ERROR:-error de suscripción vigente}"
  fi
else
  log "Determinista: FAIL (subs=${SUBS_COUNT}, pays=${PAYS_COUNT}, A_ok=${A_SUCCEEDED}, B_ok=${B_SUCCEEDED})"
  DET_PASS=false
  PRUEBA1_PASS=false
fi
PRUEBA1_DETAILS+=("Determinista: $([[ ${DET_PASS} == true ]] && echo PASS || echo FAIL)")

# --- Versión de estrés (20 cuentas, 2 procesos paralelos cada una, sin pausa) ---
log ""
log "--- Versión de estrés (20 cuentas, 2 hilos cada una) ---"

STRESS_PASS=0
STRESS_FAIL=0
STRESS_DETAILS=()

for i in {1..20}; do
  EMAIL_S=$(gen_test_email)
  ACCOUNT_S=$(create_test_account "${EMAIL_S}" "${PLAN_ID}")

  REF_S1=$(gen_test_reference)
  REF_S2=$(gen_test_reference)

  (
    PGOPTIONS="-c timezone=UTC" psql -v ON_ERROR_STOP=1 -q -X -c "SELECT sp_contratar_suscripcion(${ACCOUNT_S}, ${PLAN_ID}, '${REF_S1}', true);" >"${SALIDA_DIR}/stress_${i}_1_${TIMESTAMP}.txt" 2>&1
  ) &
  PID1=$!

  (
    PGOPTIONS="-c timezone=UTC" psql -v ON_ERROR_STOP=1 -q -X -c "SELECT sp_contratar_suscripcion(${ACCOUNT_S}, ${PLAN_ID}, '${REF_S2}', true);" >"${SALIDA_DIR}/stress_${i}_2_${TIMESTAMP}.txt" 2>&1
  ) &
  PID2=$!

  wait ${PID1} || true
  wait ${PID2} || true

  SUBS_S=$(run_psql "SELECT COUNT(*) FROM subscriptions WHERE accountId = ${ACCOUNT_S};" | tail -n +3 | head -n 1 | xargs)
  PAYS_S=$(run_psql "SELECT COUNT(*) FROM payments p JOIN subscriptions s ON s.subscriptionId = p.subscriptionId WHERE s.accountId = ${ACCOUNT_S};" | tail -n +3 | head -n 1 | xargs)

  if [[ "${SUBS_S}" == "1" && "${PAYS_S}" == "1" ]]; then
    STRESS_PASS=$((STRESS_PASS+1))
    STRESS_DETAILS+=("  Cuenta ${ACCOUNT_S}: PASS")
  else
    STRESS_FAIL=$((STRESS_FAIL+1))
    STRESS_DETAILS+=("  Cuenta ${ACCOUNT_S}: FAIL (${SUBS_S} sub, ${PAYS_S} pago)")
    PRUEBA1_PASS=false
  fi
done

log "Estrés: ${STRESS_PASS}/20 PASS, ${STRESS_FAIL}/20 FAIL"
for d in "${STRESS_DETAILS[@]}"; do log "${d}"; done

if [[ ${STRESS_FAIL} -eq 0 ]]; then
  log "Estrés: PASS (todas 20 cuentas con 1 sub + 1 pago)"
  PRUEBA1_DETAILS+=("Estrés: PASS")
else
  log "Estrés: FAIL (${STRESS_FAIL} cuentas con conteo incorrecto)"
  PRUEBA1_DETAILS+=("Estrés: FAIL")
fi

log ""
if [[ "${PRUEBA1_PASS}" == "true" ]]; then
  log ">>> PRUEBA 1: PASS"
  PRUEBA1_RESULT="PASS"
else
  log ">>> PRUEBA 1: FAIL"
  PRUEBA1_RESULT="FAIL"
fi

# ================================================================
# PRUEBA 2: Fallo a mitad de transacción (atomicidad)
# ================================================================
log ""
log "================================================================="
log "PRUEBA 2: Atomicidad - fallo a mitad de transacción"
log "================================================================="

PRUEBA2_PASS=true
PRUEBA2_DETAILS=()

# --- Variante 2a: reference duplicada en payment ---
log ""
log "--- 2a: reference duplicada en payment ---"

EMAIL_2A=$(gen_test_email)
ACCOUNT_2A=$(create_test_account "${EMAIL_2A}" "${PLAN_ID}")

REF_EXISTING=$(gen_test_reference)
run_psql "SELECT sp_contratar_suscripcion(${ACCOUNT_2A}, ${PLAN_ID}, '${REF_EXISTING}', true);" >/dev/null
log "Reference existente: ${REF_EXISTING}"

REF_DUP="${REF_EXISTING}"
RESULT_2A=$(run_psql_capture "SELECT sp_contratar_suscripcion(${ACCOUNT_2A}, ${PLAN_ID}, '${REF_DUP}', true);" 2>&1) || true
log "Resultado: $(echo "${RESULT_2A}" | head -1 | sed 's/^[[:space:]]*//')"

SUBS_2A=$(run_psql "SELECT COUNT(*) FROM subscriptions WHERE accountId = ${ACCOUNT_2A};" | tail -n +3 | head -n 1 | xargs)
PAYS_2A=$(run_psql "SELECT COUNT(*) FROM payments p JOIN subscriptions s ON s.subscriptionId = p.subscriptionId WHERE s.accountId = ${ACCOUNT_2A};" | tail -n +3 | head -n 1 | xargs)

log "Cuenta ${ACCOUNT_2A}: ${SUBS_2A} sub, ${PAYS_2A} pago (esperado: 1, 1)"

if [[ "${SUBS_2A}" == "1" && "${PAYS_2A}" == "1" ]]; then
  log "2a: PASS (rollback atómico, datos originales intactos)"
  PRUEBA2_DETAILS+=("2a: PASS")
else
  log "2a: FAIL (esperado 1 sub + 1 pago, obtuvo ${SUBS_2A} sub + ${PAYS_2A} pago)"
  PRUEBA2_PASS=false
  PRUEBA2_DETAILS+=("2a: FAIL")
fi

# --- Variante 2b: Error provocado (división por cero) tras INSERT subscription ---
log ""
log "--- 2b: división por cero tras INSERT subscription ---"

EMAIL_2B=$(gen_test_email)
ACCOUNT_2B=$(create_test_account "${EMAIL_2B}" "${PLAN_ID}")

REF_2B=$(gen_test_reference)

RESULT_2B=$(run_psql_capture "
  BEGIN;
  INSERT INTO subscriptions (accountId, planId, startsAt, endsAt)
  VALUES (${ACCOUNT_2B}, ${PLAN_ID}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP + INTERVAL '30 days');
  SELECT 1/0;
  INSERT INTO payments (subscriptionId, paidAt, amount, reference)
  VALUES (currval('subscriptions_subscriptionid_seq'), CURRENT_TIMESTAMP, (SELECT price FROM plans WHERE planId = ${PLAN_ID}), '${REF_2B}');
  COMMIT;
" 2>&1) || true
log "Resultado: $(echo "${RESULT_2B}" | head -1 | sed 's/^[[:space:]]*//')"

SUBS_2B=$(run_psql "SELECT COUNT(*) FROM subscriptions WHERE accountId = ${ACCOUNT_2B};" | tail -n +3 | head -n 1 | xargs)
PAYS_2B=$(run_psql "SELECT COUNT(*) FROM payments p JOIN subscriptions s ON s.subscriptionId = p.subscriptionId WHERE s.accountId = ${ACCOUNT_2B};" | tail -n +3 | head -n 1 | xargs)

log "Cuenta ${ACCOUNT_2B}: ${SUBS_2B} sub, ${PAYS_2B} pago (esperado: 0, 0)"

if [[ "${SUBS_2B}" == "0" && "${PAYS_2B}" == "0" ]]; then
  log "2b: PASS (rollback completo, cero registros)"
  PRUEBA2_DETAILS+=("2b: PASS")
else
  log "2b: FAIL (esperado 0 sub + 0 pago, obtuvo ${SUBS_2B} sub + ${PAYS_2B} pago)"
  PRUEBA2_PASS=false
  PRUEBA2_DETAILS+=("2b: FAIL")
fi

# --- Variante 2c: pg_terminate_backend durante pg_sleep(10) ---
log ""
log "--- 2c: pg_terminate_backend durante pg_sleep(10) ---"

EMAIL_2C=$(gen_test_email)
ACCOUNT_2C=$(create_test_account "${EMAIL_2C}" "${PLAN_ID}")

REF_2C=$(gen_test_reference)

(
  PGOPTIONS="-c timezone=UTC" psql -v ON_ERROR_STOP=1 -q -X -c "
    BEGIN;
    SELECT sp_contratar_suscripcion(${ACCOUNT_2C}, ${PLAN_ID}, '${REF_2C}', true);
    SELECT pg_sleep(10);
    COMMIT;
  " >"${SALIDA_DIR}/prueba2c_${TIMESTAMP}.txt" 2>&1
) &
PID_SLEEP=$!

sleep 1

BACKEND_PID=$(run_psql "
  SELECT pid FROM pg_stat_activity
  WHERE query LIKE '%sp_contratar_suscripcion(${ACCOUNT_2C}%' AND state = 'active'
  LIMIT 1;
" | tail -n +3 | head -n 1 | xargs)

if [[ -n "${BACKEND_PID}" && "${BACKEND_PID}" != "0" ]]; then
  log "Terminando backend PID=${BACKEND_PID}..."
  run_psql "SELECT pg_terminate_backend(${BACKEND_PID});" >/dev/null
else
  log "No se encontró backend activo, reintentando..."
  sleep 1
  BACKEND_PID=$(run_psql "
    SELECT pid FROM pg_stat_activity
    WHERE query LIKE '%sp_contratar_suscripcion(${ACCOUNT_2C}%' AND state = 'active'
    LIMIT 1;
  " | tail -n +3 | head -n 1 | xargs)
  if [[ -n "${BACKEND_PID}" && "${BACKEND_PID}" != "0" ]]; then
    run_psql "SELECT pg_terminate_backend(${BACKEND_PID});" >/dev/null
  fi
fi

wait ${PID_SLEEP} 2>/dev/null || true

SUBS_2C=$(run_psql "SELECT COUNT(*) FROM subscriptions WHERE accountId = ${ACCOUNT_2C};" | tail -n +3 | head -n 1 | xargs)
PAYS_2C=$(run_psql "SELECT COUNT(*) FROM payments p JOIN subscriptions s ON s.subscriptionId = p.subscriptionId WHERE s.accountId = ${ACCOUNT_2C};" | tail -n +3 | head -n 1 | xargs)

log "Cuenta ${ACCOUNT_2C}: ${SUBS_2C} sub, ${PAYS_2C} pago (esperado: 0, 0)"

if [[ "${SUBS_2C}" == "0" && "${PAYS_2C}" == "0" ]]; then
  log "2c: PASS (terminación causó rollback, cero registros)"
  PRUEBA2_DETAILS+=("2c: PASS")
else
  log "2c: FAIL (esperado 0 sub + 0 pago, obtuvo ${SUBS_2C} sub + ${PAYS_2C} pago)"
  PRUEBA2_PASS=false
  PRUEBA2_DETAILS+=("2c: FAIL")
fi

# --- Variante 2d (opcional): Trigger diferido - suscripción sin pago ---
log ""
log "--- 2d: trigger diferido (suscripción sin pago) ---"

EMAIL_2D=$(gen_test_email)
ACCOUNT_2D=$(create_test_account "${EMAIL_2D}" "${PLAN_ID}")

REF_2D=$(gen_test_reference)

RESULT_2D=$(run_psql_capture "
  BEGIN;
  INSERT INTO subscriptions (accountId, planId, startsAt, endsAt)
  VALUES (${ACCOUNT_2D}, ${PLAN_ID}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP + INTERVAL '30 days');
  COMMIT;
" 2>&1) || true
log "Resultado: $(echo "${RESULT_2D}" | head -1 | sed 's/^[[:space:]]*//')"

SUBS_2D=$(run_psql "SELECT COUNT(*) FROM subscriptions WHERE accountId = ${ACCOUNT_2D};" | tail -n +3 | head -n 1 | xargs)
PAYS_2D=$(run_psql "SELECT COUNT(*) FROM payments p JOIN subscriptions s ON s.subscriptionId = p.subscriptionId WHERE s.accountId = ${ACCOUNT_2D};" | tail -n +3 | head -n 1 | xargs)

log "Cuenta ${ACCOUNT_2D}: ${SUBS_2D} sub, ${PAYS_2D} pago (esperado: 0, 0 tras rollback por trigger)"

if [[ "${SUBS_2D}" == "0" && "${PAYS_2D}" == "0" ]]; then
  log "2d: PASS (trigger diferido rechazó commit sin pago)"
  PRUEBA2_DETAILS+=("2d: PASS")
elif echo "${RESULT_2D}" | grep -qi "no tiene pago asociado"; then
  log "2d: PASS (trigger diferido funcionó, rollback automático)"
  PRUEBA2_DETAILS+=("2d: PASS")
else
  log "2d: SKIP (trigger no DEFERRABLE en esta BD o comportamiento distinto)"
  PRUEBA2_DETAILS+=("2d: SKIP")
fi

log ""
if [[ "${PRUEBA2_PASS}" == "true" ]]; then
  log ">>> PRUEBA 2: PASS"
  PRUEBA2_RESULT="PASS"
else
  log ">>> PRUEBA 2: FAIL"
  PRUEBA2_RESULT="FAIL"
fi

# ================================================================
# PRUEBA 3: Consultas de verificación (verificaciones.sql)
# ================================================================
log ""
log "================================================================="
log "PRUEBA 3: Verificaciones de integridad"
log "================================================================="

PRUEBA3_PASS=true
PRUEBA3_DETAILS=()

log "Ejecutando verificaciones.sql..."
VERIF_OUTPUT=$(PGOPTIONS="-c timezone=UTC" psql -v ON_ERROR_STOP=1 -q -X -f "${SCRIPT_DIR}/verificaciones.sql" 2>&1)
echo "${VERIF_OUTPUT}" | tee -a "${SALIDA_FILE}"

# Verificar cada consulta
if echo "${VERIF_OUTPUT}" | grep -q "Suscripciones superpuestas.*0 rows"; then
  log "  Sin suscripciones superpuestas: PASS"
  PRUEBA3_DETAILS+=("Superpuestas: PASS")
else
  log "  Sin suscripciones superpuestas: FAIL"
  PRUEBA3_PASS=false
  PRUEBA3_DETAILS+=("Superpuestas: FAIL")
fi

if echo "${VERIF_OUTPUT}" | grep -q "Suscripciones sin pago.*0 rows"; then
  log "  Sin suscripciones sin pago: PASS"
  PRUEBA3_DETAILS+=("Sin pago: PASS")
else
  log "  Sin suscripciones sin pago: FAIL"
  PRUEBA3_PASS=false
  PRUEBA3_DETAILS+=("Sin pago: FAIL")
fi

if echo "${VERIF_OUTPUT}" | grep -q "Pagos sin suscripci[oó]n.*0 rows"; then
  log "  Sin pagos sin suscripción: PASS"
  PRUEBA3_DETAILS+=("Sin suscripción: PASS")
else
  log "  Sin pagos sin suscripción: FAIL"
  PRUEBA3_PASS=false
  PRUEBA3_DETAILS+=("Sin suscripción: FAIL")
fi

if echo "${VERIF_OUTPUT}" | grep -q "IGUALES"; then
  log "  Total subs = total pagos: PASS"
  PRUEBA3_DETAILS+=("Totales: PASS")
else
  log "  Total subs = total pagos: FAIL"
  PRUEBA3_PASS=false
  PRUEBA3_DETAILS+=("Totales: FAIL")
fi

# Verificación específica de cuentas demo de esta corrida
log ""
log "--- Cuentas demo_tx_* de esta corrida (${EMAIL_PREFIX}_*) ---"
run_psql "
  SELECT a.accountId, a.email,
         COUNT(DISTINCT s.subscriptionId) AS n_subs,
         COUNT(DISTINCT p.paymentId)      AS n_pays
  FROM accounts a
  LEFT JOIN subscriptions s ON s.accountId = a.accountId
  LEFT JOIN payments p      ON p.subscriptionId = s.subscriptionId
  WHERE a.email LIKE '${EMAIL_PREFIX}_%@example.com'
  GROUP BY a.accountId, a.email
  ORDER BY a.accountId;
" 2>&1 | tee -a "${SALIDA_FILE}"

log ""
if [[ "${PRUEBA3_PASS}" == "true" ]]; then
  log ">>> PRUEBA 3: PASS"
  PRUEBA3_RESULT="PASS"
else
  log ">>> PRUEBA 3: FAIL"
  PRUEBA3_RESULT="FAIL"
fi

# ================================================================
# LIMPIEZA Y RESUMEN FINAL
# ================================================================
cleanup_test_data

log ""
log "================================================================="
log "RESUMEN FINAL"
log "================================================================="
log "Prueba 1 (Concurrencia):     ${PRUEBA1_RESULT}"
for d in "${PRUEBA1_DETAILS[@]}"; do log "  ${d}"; done
log "Prueba 2 (Atomicidad):       ${PRUEBA2_RESULT}"
for d in "${PRUEBA2_DETAILS[@]}"; do log "  ${d}"; done
log "Prueba 3 (Verificaciones):   ${PRUEBA3_RESULT}"
for d in "${PRUEBA3_DETAILS[@]}"; do log "  ${d}"; done
log "================================================================="

OVERALL_PASS=true
[[ "${PRUEBA1_RESULT}" == "PASS" ]] || OVERALL_PASS=false
[[ "${PRUEBA2_RESULT}" == "PASS" ]] || OVERALL_PASS=false
[[ "${PRUEBA3_RESULT}" == "PASS" ]] || OVERALL_PASS=false

if [[ "${OVERALL_PASS}" == "true" ]]; then
  log ">>> RESULTADO GLOBAL: PASS - Todas las pruebas pasaron"
  log "Fin: $(date '+%Y-%m-%d %H:%M:%S')"
  exit 0
else
  log ">>> RESULTADO GLOBAL: FAIL - Alguna prueba falló"
  log "Fin: $(date '+%Y-%m-%d %H:%M:%S')"
  exit 1
fi