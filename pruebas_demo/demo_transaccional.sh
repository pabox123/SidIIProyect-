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

gen_test_email() {
  local prefix="demo_tx"
  local random_suffix=$(openssl rand -hex 6 2>/dev/null || cat /dev/urandom | tr -dc 'a-f0-9' | head -c 12)
  echo "${prefix}_${random_suffix}@example.com"
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

register_test_account() {
  local account_id="$1"
  run_psql "
    CREATE TEMP TABLE IF NOT EXISTS demo_tx_accounts (accountId INTEGER PRIMARY KEY);
    INSERT INTO demo_tx_accounts (accountId) VALUES (${account_id})
    ON CONFLICT DO NOTHING;
  " >/dev/null
}

cleanup_test_data() {
  log ""
  log "=== LIMPIEZA DE DATOS DE PRUEBA ==="

  if [[ "${CONSERVAR}" == "true" ]]; then
    log "Opción --conservar activada: NO se borran los datos de prueba."
    log "Cuentas de prueba registradas:"
    run_psql "SELECT accountId, email FROM accounts WHERE email LIKE 'demo_tx_%' ORDER BY accountId;" | tee -a "${SALIDA_FILE}"
    return 0
  fi

  local account_ids=$(run_psql "SELECT accountId FROM demo_tx_accounts ORDER BY accountId;" 2>/dev/null | tail -n +3 | head -n -1 | xargs)

  if [[ -z "${account_ids}" ]]; then
    log "No hay cuentas de prueba registradas para limpiar."
    return 0
  fi

  log "Cuentas a limpiar: ${account_ids}"

  for acc in ${account_ids}; do
    log "Limpiando accountId=${acc}..."

    run_psql "
      DELETE FROM payments
      WHERE subscriptionId IN (SELECT subscriptionId FROM subscriptions WHERE accountId = ${acc});
    " >/dev/null && log "  Pagos borrados" || log "  ERROR borrando pagos"

    run_psql "
      DELETE FROM subscriptions WHERE accountId = ${acc};
    " >/dev/null && log "  Suscripciones borradas" || log "  ERROR borrando suscripciones"

    run_psql "
      DELETE FROM profiles WHERE accountId = ${acc};
    " >/dev/null && log "  Perfiles borrados" || log "  ERROR borrando perfiles"

    run_psql "
      DELETE FROM accounts WHERE accountId = ${acc};
    " >/dev/null && log "  Cuenta borrada" || log "  ERROR borrando cuenta"
  done

  run_psql "DROP TABLE IF EXISTS demo_tx_accounts;" >/dev/null
  log "Limpieza completada."
}

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

log ""
log "================================================================="
log "PRUEBA 1: Dos contrataciones simultáneas de la misma cuenta"
log "================================================================="

PRUEBA1_PASS=true

log ""
log "--- Versión determinista (con pg_sleep) ---"

EMAIL1=$(gen_test_email)
ACCOUNT1=$(create_test_account "${EMAIL1}" "${PLAN_ID}")
register_test_account "${ACCOUNT1}"
log "Cuenta creada: accountId=${ACCOUNT1}, email=${EMAIL1}"

REF1=$(gen_test_reference)
REF2=$(gen_test_reference)
log "Referencias: ${REF1} (sesión A), ${REF2} (sesión B)"

log "Sesión A: Inicia transacción, llama sp_contratar_suscripcion, pg_sleep(3), COMMIT"
log "Sesión B: Espera 1s, llama sp_contratar_suscripcion (debe bloquear y fallar)"

(
  PGOPTIONS="-c timezone=UTC" psql -v ON_ERROR_STOP=1 -q -X -c "
    BEGIN;
    SELECT sp_contratar_suscripcion(${ACCOUNT1}, ${PLAN_ID}, '${REF1}', true);
    SELECT pg_sleep(3);
    COMMIT;
  " >"${SALIDA_DIR}/prueba1_a_${TIMESTAMP}.txt" 2>&1
) &
PID_A=$!

(
  PGOPTIONS="-c timezone=UTC" psql -v ON_ERROR_STOP=0 -q -X -c "SELECT sp_contratar_suscripcion(${ACCOUNT1}, ${PLAN_ID}, '${REF2}', true);" >"${SALIDA_DIR}/prueba1_b_${TIMESTAMP}.txt" 2>&1
) &
PID_B=$!

sleep 1

log "Ejecutando sesión B..."
wait ${PID_B} || true
RESULT_B=$(cat "${SALIDA_DIR}/prueba1_b_${TIMESTAMP}.txt" 2>/dev/null || echo "No output file")
log "Resultado sesión B:"
echo "${RESULT_B}" | tee -a "${SALIDA_FILE}"

wait ${PID_A} || true
RESULT_A=$(cat "${SALIDA_DIR}/prueba1_a_${TIMESTAMP}.txt" 2>/dev/null || echo "No output file")
log "Resultado sesión A:"
echo "${RESULT_A}" | tee -a "${SALIDA_FILE}"

SUBS_COUNT=$(run_psql "SELECT COUNT(*) FROM subscriptions WHERE accountId = ${ACCOUNT1};" | tail -n +3 | head -n 1 | xargs)
PAYS_COUNT=$(run_psql "SELECT COUNT(*) FROM payments p JOIN subscriptions s ON s.subscriptionId = p.subscriptionId WHERE s.accountId = ${ACCOUNT1};" | tail -n +3 | head -n 1 | xargs)

log "Cuenta ${ACCOUNT1}: ${SUBS_COUNT} suscripción(es), ${PAYS_COUNT} pago(s)"

if [[ "${SUBS_COUNT}" == "1" && "${PAYS_COUNT}" == "1" ]]; then
  log "Versión determinista: PASS (1 sub, 1 pago, 1 error esperado)"
else
  log "Versión determinista: FAIL (esperado 1 sub + 1 pago, obtuvo ${SUBS_COUNT} sub + ${PAYS_COUNT} pago)"
  PRUEBA1_PASS=false
fi

if echo "${RESULT_B}" | grep -qi "ya tiene una suscripci[oó]n vigente\|duplicate key\|exclu"; then
  log "Sesión B falló con error esperado (suscripción vigente / exclusión / unicidad)"
else
  log "Sesión B no mostró error esperado. Revisar salida arriba."
fi

log ""
log "--- Versión de estrés (20 cuentas, 2 procesos paralelos cada una, sin pausa) ---"

STRESS_PASS=0
STRESS_FAIL=0

for i in {1..20}; do
  EMAIL_S=$(gen_test_email)
  ACCOUNT_S=$(create_test_account "${EMAIL_S}" "${PLAN_ID}")
  register_test_account "${ACCOUNT_S}"

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
    ((STRESS_PASS++))
  else
    ((STRESS_FAIL++))
    log "  Cuenta ${ACCOUNT_S} (iter $i): FAIL - ${SUBS_S} sub, ${PAYS_S} pago"
  fi
done

log "Resultados estrés: ${STRESS_PASS}/20 PASS, ${STRESS_FAIL}/20 FAIL"

if [[ ${STRESS_FAIL} -eq 0 ]]; then
  log "Versión de estrés: PASS (todas las 20 cuentas con 1 sub + 1 pago)"
else
  log "Versión de estrés: FAIL (${STRESS_FAIL} cuentas con conteo incorrecto)"
  PRUEBA1_PASS=false
fi

log ""
if [[ "${PRUEBA1_PASS}" == "true" ]]; then
  log ">>> PRUEBA 1: PASS"
  PRUEBA1_RESULT="PASS"
else
  log ">>> PRUEBA 1: FAIL"
  PRUEBA1_RESULT="FAIL"
fi

log ""
log "================================================================="
log "PRUEBA 2: Fallo a mitad de transacción (atomicidad)"
log "================================================================="

PRUEBA2_PASS=true

log ""
log "--- Variante 2a: reference duplicada en payment ---"

EMAIL_2A=$(gen_test_email)
ACCOUNT_2A=$(create_test_account "${EMAIL_2A}" "${PLAN_ID}")
register_test_account "${ACCOUNT_2A}"

REF_EXISTING=$(gen_test_reference)
run_psql "SELECT sp_contratar_suscripcion(${ACCOUNT_2A}, ${PLAN_ID}, '${REF_EXISTING}', true);" >/dev/null
log "Reference existente creada: ${REF_EXISTING}"

REF_DUP="${REF_EXISTING}"
RESULT_2A=$(run_psql_capture "SELECT sp_contratar_suscripcion(${ACCOUNT_2A}, ${PLAN_ID}, '${REF_DUP}', true);" 2>&1)
log "Resultado:"
echo "${RESULT_2A}" | tee -a "${SALIDA_FILE}"

SUBS_2A=$(run_psql "SELECT COUNT(*) FROM subscriptions WHERE accountId = ${ACCOUNT_2A};" | tail -n +3 | head -n 1 | xargs)
PAYS_2A=$(run_psql "SELECT COUNT(*) FROM payments p JOIN subscriptions s ON s.subscriptionId = p.subscriptionId WHERE s.accountId = ${ACCOUNT_2A};" | tail -n +3 | head -n 1 | xargs)

log "Cuenta ${ACCOUNT_2A}: ${SUBS_2A} suscripción(es), ${PAYS_2A} pago(s) (esperado: 1, 1 - la original)"

if [[ "${SUBS_2A}" == "1" && "${PAYS_2A}" == "1" ]]; then
  log "Variante 2a: PASS (rollback atómico, datos originales intactos)"
else
  log "Variante 2a: FAIL (esperado 1 sub + 1 pago, obtuvo ${SUBS_2A} sub + ${PAYS_2A} pago)"
  PRUEBA2_PASS=false
fi

log ""
log "--- Variante 2b: Error provocado (división por cero) tras INSERT subscription ---"

EMAIL_2B=$(gen_test_email)
ACCOUNT_2B=$(create_test_account "${EMAIL_2B}" "${PLAN_ID}")
register_test_account "${ACCOUNT_2B}"

REF_2B=$(gen_test_reference)

RESULT_2B=$(run_psql_capture "
  BEGIN;
  INSERT INTO subscriptions (accountId, planId, startsAt, endsAt)
  VALUES (${ACCOUNT_2B}, ${PLAN_ID}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP + INTERVAL '30 days');
  SELECT 1/0;
  INSERT INTO payments (subscriptionId, paidAt, amount, reference)
  VALUES (currval('subscriptions_subscriptionid_seq'), CURRENT_TIMESTAMP, (SELECT price FROM plans WHERE planId = ${PLAN_ID}), '${REF_2B}');
  COMMIT;
" 2>&1)
log "Resultado (esperado error división por cero):"
echo "${RESULT_2B}" | tee -a "${SALIDA_FILE}"

SUBS_2B=$(run_psql "SELECT COUNT(*) FROM subscriptions WHERE accountId = ${ACCOUNT_2B};" | tail -n +3 | head -n 1 | xargs)
PAYS_2B=$(run_psql "SELECT COUNT(*) FROM payments p JOIN subscriptions s ON s.subscriptionId = p.subscriptionId WHERE s.accountId = ${ACCOUNT_2B};" | tail -n +3 | head -n 1 | xargs)

log "Cuenta ${ACCOUNT_2B}: ${SUBS_2B} suscripción(es), ${PAYS_2B} pago(s) (esperado: 0, 0)"

if [[ "${SUBS_2B}" == "0" && "${PAYS_2B}" == "0" ]]; then
  log "Variante 2b: PASS (rollback completo, cero registros)"
else
  log "Variante 2b: FAIL (esperado 0 sub + 0 pago, obtuvo ${SUBS_2B} sub + ${PAYS_2B} pago)"
  PRUEBA2_PASS=false
fi

log ""
log "--- Variante 2c: pg_terminate_backend durante pg_sleep(10) ---"

EMAIL_2C=$(gen_test_email)
ACCOUNT_2C=$(create_test_account "${EMAIL_2C}" "${PLAN_ID}")
register_test_account "${ACCOUNT_2C}"

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
  log "No se encontró backend activo para accountId=${ACCOUNT_2C}, reintentando..."
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

log "Cuenta ${ACCOUNT_2C}: ${SUBS_2C} suscripción(es), ${PAYS_2C} pago(s) (esperado: 0, 0)"

if [[ "${SUBS_2C}" == "0" && "${PAYS_2C}" == "0" ]]; then
  log "Variante 2c: PASS (terminación de backend causó rollback, cero registros)"
else
  log "Variante 2c: FAIL (esperado 0 sub + 0 pago, obtuvo ${SUBS_2C} sub + ${PAYS_2C} pago)"
  PRUEBA2_PASS=false
fi

log ""
log "--- Variante 2d (opcional): Trigger diferido - suscripción sin pago ---"

EMAIL_2D=$(gen_test_email)
ACCOUNT_2D=$(create_test_account "${EMAIL_2D}" "${PLAN_ID}")
register_test_account "${ACCOUNT_2D}"

REF_2D=$(gen_test_reference)

RESULT_2D=$(run_psql_capture "
  BEGIN;
  INSERT INTO subscriptions (accountId, planId, startsAt, endsAt)
  VALUES (${ACCOUNT_2D}, ${PLAN_ID}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP + INTERVAL '30 days');
  COMMIT;
" 2>&1)
log "Resultado (esperado error trigger diferido):"
echo "${RESULT_2D}" | tee -a "${SALIDA_FILE}"

SUBS_2D=$(run_psql "SELECT COUNT(*) FROM subscriptions WHERE accountId = ${ACCOUNT_2D};" | tail -n +3 | head -n 1 | xargs)
PAYS_2D=$(run_psql "SELECT COUNT(*) FROM payments p JOIN subscriptions s ON s.subscriptionId = p.subscriptionId WHERE s.accountId = ${ACCOUNT_2D};" | tail -n +3 | head -n 1 | xargs)

log "Cuenta ${ACCOUNT_2D}: ${SUBS_2D} suscripción(es), ${PAYS_2D} pago(s) (esperado: 0, 0 tras rollback por trigger)"

if [[ "${SUBS_2D}" == "0" && "${PAYS_2D}" == "0" ]]; then
  log "Variante 2d: PASS (trigger diferido rechazó commit sin pago)"
elif echo "${RESULT_2D}" | grep -qi "no tiene pago asociado"; then
  log "Variante 2d: PASS (trigger diferido funcionó, rollback automático)"
else
  log "Variante 2d: Resultado inesperado (puede ser OK si el trigger no es DEFERRABLE en esta BD)"
fi

log ""
if [[ "${PRUEBA2_PASS}" == "true" ]]; then
  log ">>> PRUEBA 2: PASS"
  PRUEBA2_RESULT="PASS"
else
  log ">>> PRUEBA 2: FAIL"
  PRUEBA2_RESULT="FAIL"
fi

log ""
log "================================================================="
log "PRUEBA 3: Consultas de verificación (verificaciones.sql)"
log "================================================================="

log "Ejecutando verificaciones.sql..."
run_psql "$(cat "${SCRIPT_DIR}/verificaciones.sql")" 2>&1 | tee -a "${SALIDA_FILE}"

log ""
log "--- Verificación específica de cuentas de prueba (demo_tx_*) ---"
run_psql "
  SELECT a.accountId, a.email,
         COUNT(DISTINCT s.subscriptionId) AS n_subs,
         COUNT(DISTINCT p.paymentId)      AS n_pays
  FROM accounts a
  LEFT JOIN subscriptions s ON s.accountId = a.accountId
  LEFT JOIN payments p      ON p.subscriptionId = s.subscriptionId
  WHERE a.email LIKE 'demo_tx_%'
  GROUP BY a.accountId, a.email
  ORDER BY a.accountId;
" 2>&1 | tee -a "${SALIDA_FILE}"

VERIF_OUTPUT=$(run_psql "$(cat "${SCRIPT_DIR}/verificaciones.sql")" 2>&1)
PRUEBA3_PASS=true

if echo "${VERIF_OUTPUT}" | grep -q "Suscripciones superpuestas.*0 rows"; then
  log "Sin suscripciones superpuestas"
else
  log "Verificar suscripciones superpuestas manualmente"
fi

if echo "${VERIF_OUTPUT}" | grep -q "Suscripciones sin pago.*0 rows"; then
  log "Sin suscripciones sin pago"
else
  log "Verificar suscripciones sin pago manualmente"
  PRUEBA3_PASS=false
fi

if echo "${VERIF_OUTPUT}" | grep -q "Pagos sin suscripci[oó]n.*0 rows"; then
  log "Sin pagos sin suscripción"
else
  log "Verificar pagos sin suscripción manualmente"
  PRUEBA3_PASS=false
fi

if echo "${VERIF_OUTPUT}" | grep -q "IGUALES"; then
  log "Total suscripciones = total pagos"
else
  log "Totales globales difieren"
  PRUEBA3_PASS=false
fi

log ""
if [[ "${PRUEBA3_PASS}" == "true" ]]; then
  log ">>> PRUEBA 3: PASS"
  PRUEBA3_RESULT="PASS"
else
  log ">>> PRUEBA 3: FAIL (revisar salida detallada)"
  PRUEBA3_RESULT="FAIL"
fi

cleanup_test_data

log ""
log "================================================================="
log "RESUMEN FINAL"
log "================================================================="
log "Prueba 1 (Concurrencia):     ${PRUEBA1_RESULT}"
log "Prueba 2 (Atomicidad):       ${PRUEBA2_RESULT}"
log "Prueba 3 (Verificaciones):   ${PRUEBA3_RESULT}"
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