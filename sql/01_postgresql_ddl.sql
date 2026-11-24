-- CineConecta - Esquema relacional PostgreSQL
-- Modelo suministrado: accounts, profiles, plans, subscriptions, payments
-- Decisiones de diseño documentadas inline para el catálogo de objetos 

-- 1) Extensión requerida para EXCLUDE con rangos temporales
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- 2) TABLAS DEL MODELO

CREATE TABLE plans (
  planId       INTEGER GENERATED ALWAYS AS IDENTITY,
  name         VARCHAR(60)   NOT NULL,
  price        NUMERIC(12,2) NOT NULL,
  maxProfiles  INTEGER       NOT NULL,
  CONSTRAINT pk_plans PRIMARY KEY (planId),
  CONSTRAINT uq_plans_name UNIQUE (name),
  CONSTRAINT ck_plans_price CHECK (price > 0),
  CONSTRAINT ck_plans_maxprofiles CHECK (maxProfiles >= 1)
);

CREATE TABLE accounts (
  accountId     INTEGER GENERATED ALWAYS AS IDENTITY,
  fullName      VARCHAR(150) NOT NULL,
  email         VARCHAR(254) NOT NULL,
  passwordHash  VARCHAR(255) NOT NULL,
  createdAt     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT pk_accounts PRIMARY KEY (accountId),
  CONSTRAINT ck_accounts_fullname CHECK (LENGTH(TRIM(fullName)) > 0),
  CONSTRAINT ck_accounts_email CHECK (POSITION('@' IN email) > 1),
  CONSTRAINT ck_accounts_hash CHECK (LENGTH(passwordHash) >= 60)
);
-- Unicidad case-insensitive en email: índice funcional sobre LOWER(email)
CREATE UNIQUE INDEX ux_accounts_email_ci ON accounts (LOWER(email));

CREATE TABLE profiles (
  profileId     INTEGER GENERATED ALWAYS AS IDENTITY,
  accountId     INTEGER     NOT NULL,
  name          VARCHAR(60) NOT NULL,
  maxAgeRating  INTEGER     NOT NULL,
  isActive      CHAR(1)     NOT NULL DEFAULT 'Y',
  CONSTRAINT pk_profiles PRIMARY KEY (profileId),
  CONSTRAINT fk_profiles_account FOREIGN KEY (accountId) REFERENCES accounts (accountId),
  CONSTRAINT ck_profiles_name CHECK (LENGTH(TRIM(name)) > 0),
  CONSTRAINT ck_profiles_age CHECK (maxAgeRating BETWEEN 0 AND 18),
  CONSTRAINT ck_profiles_active CHECK (isActive IN ('Y', 'N'))
);
-- Unicidad case-insensitive de nombre de perfil por cuenta
CREATE UNIQUE INDEX ux_profiles_name_ci ON profiles (accountId, LOWER(name));
-- Índice para consultas de perfiles activos de una cuenta
CREATE INDEX ix_profiles_account_active ON profiles (accountId, isActive);

CREATE TABLE subscriptions (
  subscriptionId INTEGER GENERATED ALWAYS AS IDENTITY,
  accountId      INTEGER   NOT NULL,
  planId         INTEGER   NOT NULL,
  startsAt       TIMESTAMP NOT NULL,
  endsAt         TIMESTAMP NOT NULL,
  CONSTRAINT pk_subscriptions PRIMARY KEY (subscriptionId),
  CONSTRAINT fk_subs_account FOREIGN KEY (accountId) REFERENCES accounts (accountId),
  CONSTRAINT fk_subs_plan FOREIGN KEY (planId) REFERENCES plans (planId),

  CONSTRAINT ck_subs_30days CHECK (endsAt = startsAt + INTERVAL '30 days'),

  CONSTRAINT ex_subs_no_overlap EXCLUDE USING gist (
    accountId WITH =,
    tsrange(startsAt, endsAt, '[)') WITH &&
  )
);
CREATE INDEX ix_subs_plan ON subscriptions (planId);
CREATE INDEX ix_subs_account_start ON subscriptions (accountId, startsAt DESC);

CREATE TABLE payments (
  paymentId      INTEGER GENERATED ALWAYS AS IDENTITY,
  subscriptionId INTEGER       NOT NULL,
  paidAt         TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  amount         NUMERIC(12,2) NOT NULL,
  reference      VARCHAR(100)  NOT NULL,
  CONSTRAINT pk_payments PRIMARY KEY (paymentId),
  CONSTRAINT fk_payments_subscription FOREIGN KEY (subscriptionId) REFERENCES subscriptions (subscriptionId),
  -- 1-1 suscripción-pago: UNIQUE en subscriptionId + FK asegura cardinalidad exacta
  CONSTRAINT uq_payments_subscription UNIQUE (subscriptionId),
  CONSTRAINT uq_payments_reference UNIQUE (reference),
  CONSTRAINT ck_payments_amount CHECK (amount > 0)
);
CREATE INDEX ix_payments_paidat ON payments (paidAt);

-- 3) TRIGGERS Y FUNCIONES DE INTEGRIDAD DE NEGOCIO

-- Trigger: fuerza que toda suscripción tenga EXACTAMENTE un pago (1-1 a nivel BD).
-- CONSTRAINT TRIGGER DEFERRABLE INITIALLY DEFERRED permite insertar suscripción y pago
-- en la misma transacción (sp_contratar_suscripcion) sin violar la restricción
-- momentáneamente; se valida al COMMIT.
CREATE OR REPLACE FUNCTION fn_subscription_requires_payment() RETURNS trigger AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM payments WHERE subscriptionId = NEW.subscriptionId) THEN
    RAISE EXCEPTION 'La suscripción % no tiene pago asociado', NEW.subscriptionId;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER ctr_subscription_requires_payment
  AFTER INSERT ON subscriptions
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION fn_subscription_requires_payment();

-- Trigger: valida límite de perfiles activos según maxProfiles del plan vigente.
-- Usa FOR UPDATE en accounts para serializar creaciones/activaciones concurrentes
-- y evitar race conditions que excedan el límite.
-- Se dispara en INSERT y en UPDATE de isActive = 'Y' (no en desactivación).
-- SECURITY DEFINER + SET search_path: se ejecuta con privilegios de cineconecta_owner
-- para permitir el FOR UPDATE en accounts sin conceder UPDATE a cineconecta_app.
CREATE OR REPLACE FUNCTION fn_profiles_check_limits() RETURNS trigger
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_max    INTEGER;
  v_active INTEGER;
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.isActive = 'Y' THEN
    RETURN NEW;
  END IF;

  PERFORM 1 FROM accounts WHERE accountId = NEW.accountId FOR UPDATE;

  SELECT p.maxProfiles INTO v_max
    FROM subscriptions s
    JOIN plans p ON p.planId = s.planId
   WHERE s.accountId = NEW.accountId
     AND s.startsAt <= CURRENT_TIMESTAMP
     AND CURRENT_TIMESTAMP < s.endsAt;

  IF v_max IS NULL THEN
    RAISE EXCEPTION 'La cuenta % no tiene una suscripción vigente', NEW.accountId;
  END IF;

  SELECT COUNT(*) INTO v_active
    FROM profiles
   WHERE accountId = NEW.accountId
     AND isActive = 'Y'
     AND profileId <> COALESCE(NEW.profileId, -1);

  IF v_active >= v_max THEN
    RAISE EXCEPTION 'La cuenta % alcanzó el máximo de % perfiles activos', NEW.accountId, v_max;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_profiles_check_limits
  BEFORE INSERT OR UPDATE OF isActive ON profiles
  FOR EACH ROW WHEN (NEW.isActive = 'Y')
  EXECUTE FUNCTION fn_profiles_check_limits();

-- 4) FUNCIÓN DE CONTRATACIÓN TRANSACCIONAL (M-02)
-- Propósito: Registra una suscripción y su pago en una sola transacción atómica.
-- Parámetros:
--   p_accountId  INTEGER  -- Cuenta que contrata (debe existir).
--   p_planId     INTEGER  -- Plan a contratar (debe existir).
--   p_reference  VARCHAR  -- Referencia única del pago (ej. ID de transacción externa).
--   p_aprobado   BOOLEAN  -- Si el pago simulado fue aprobado (default true). Si false,
--                          rechaza con error claro SIN insertar suscripción ni pago.
-- Retorna: subscriptionId de la suscripción creada.
-- Errores explícitos:
--   - 'La cuenta % no existe'                      (cuenta inexistente)
--   - 'El plan % no existe'                        (plan inexistente)
--   - 'La cuenta % ya tiene una suscripción vigente' (suscripción activa solapada)
--   - 'Desactive % perfil(es) antes de contratar este plan' (perfiles activos > maxProfiles del plan nuevo)
--   - 'Pago no aprobado: la contratación requiere pago aprobado' (p_aprobado = false)
--   - Error nativo de unicidad en payments.reference (referencia duplicada)
-- Estrategia de bloqueo:
--   1) SELECT ... FOR UPDATE en accounts (línea 1) serializa llamadas concurrentes
--      para la misma cuenta. En READ COMMITTED, la 2ª sesión espera el lock y,
--      al obtenerlo, ve la suscripción insertada por la 1ª (validación d).
--   2) EXCLUDE constraint (ex_subs_no_overlap) actúa como red de seguridad final
--      a nivel de índice GiST contra períodos superpuestos.
--   3) Trigger ctr_subscription_requires_payment (DEFERRABLE) garantiza 1-1
--      suscripción-pago al COMMIT.
-- Seguridad: SECURITY DEFINER + SET search_path = public, pg_temp.
--            Owner = cineconecta_owner. EXECUTE solo para cineconecta_app.
CREATE OR REPLACE FUNCTION sp_contratar_suscripcion(
  p_accountId INTEGER,
  p_planId INTEGER,
  p_reference VARCHAR,
  p_aprobado BOOLEAN DEFAULT true
) RETURNS INTEGER
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_price      NUMERIC(12,2);
  v_max        INTEGER;
  v_active     INTEGER;
  v_start      TIMESTAMP := CURRENT_TIMESTAMP;
  v_sub        INTEGER;
  v_has_active BOOLEAN;
BEGIN
  -- 1) Bloquear la cuenta para serializar concurrencia (FOR UPDATE)
  PERFORM 1 FROM accounts WHERE accountId = p_accountId FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'La cuenta % no existe', p_accountId;
  END IF;

  -- 2) Validar plan y obtener precio y maxProfiles
  SELECT price, maxProfiles INTO v_price, v_max FROM plans WHERE planId = p_planId;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'El plan % no existe', p_planId;
  END IF;

  -- 3) Validar pago aprobado (simulado)
  IF NOT p_aprobado THEN
    RAISE EXCEPTION 'Pago no aprobado: la contratación requiere pago aprobado';
  END IF;

  -- 4) Validar que NO exista suscripción vigente para esta cuenta
  --    (startsAt <= now < endsAt). FOR UPDATE ya garantiza que vemos
  --    la suscripción insertada por una transacción concurrente previa.
  SELECT EXISTS (
    SELECT 1 FROM subscriptions
    WHERE accountId = p_accountId
      AND startsAt <= v_start
      AND v_start < endsAt
  ) INTO v_has_active;
  IF v_has_active THEN
    RAISE EXCEPTION 'La cuenta % ya tiene una suscripción vigente', p_accountId;
  END IF;

  -- 5) Validar límite de perfiles activos vs maxProfiles del NUEVO plan
  SELECT COUNT(*) INTO v_active
    FROM profiles WHERE accountId = p_accountId AND isActive = 'Y';
  IF v_active > v_max THEN
    RAISE EXCEPTION 'Desactive % perfil(es) antes de contratar este plan', v_active - v_max;
  END IF;

  -- 6) Insertar suscripción (30 días exactos: startsAt = now, endsAt = now + 30d)
  INSERT INTO subscriptions (accountId, planId, startsAt, endsAt)
  VALUES (p_accountId, p_planId, v_start, v_start + INTERVAL '30 days')
  RETURNING subscriptionId INTO v_sub;

  -- 7) Insertar pago (monto = precio del plan, reference único)
  INSERT INTO payments (subscriptionId, paidAt, amount, reference)
  VALUES (v_sub, v_start, v_price, p_reference);

  RETURN v_sub;
END;
$$ LANGUAGE plpgsql;

-- 5) ROLES Y PRIVILEGIOS MÍNIMOS (Punto f del enunciado)
-- -------------------------------------------------------
-- Separación estricta: owner (DDL/migraciones) ≠ app (DML runtime) ≠ user (login real).
-- NO se usan superusuarios, ni el propietario del esquema (postgres), ni roles con
-- CREATEDB/CREATEROLE para la aplicación.

-- 5.1 Revocar privilegios por defecto de PUBLIC sobre el esquema public
-- PostgreSQL otorga CREATE en el esquema y EXECUTE en funciones a PUBLIC por defecto.
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC;
-- Nota: CONNECT sobre la base se revoca en el script de despliegue (CREATE DATABASE ... REVOKE CONNECT),
-- aquí solo documentamos la intención: la base no debe permitir conexiones de PUBLIC.

-- 5.2 Rol propietario (owner): dueño de objetos, usado solo para migraciones/DDL
CREATE ROLE cineconecta_owner NOLOGIN;
-- Otorgar ownership de tablas, secuencias y funciones existentes
ALTER TABLE plans OWNER TO cineconecta_owner;
ALTER TABLE accounts OWNER TO cineconecta_owner;
ALTER TABLE profiles OWNER TO cineconecta_owner;
ALTER TABLE subscriptions OWNER TO cineconecta_owner;
ALTER TABLE payments OWNER TO cineconecta_owner;
-- Las secuencias de IDENTITY pertenecen a sus tablas; ALTER TABLE ... OWNER TO las cubre.
ALTER FUNCTION fn_subscription_requires_payment() OWNER TO cineconecta_owner;
ALTER FUNCTION fn_profiles_check_limits() OWNER TO cineconecta_owner;
ALTER FUNCTION sp_contratar_suscripcion(INTEGER, INTEGER, VARCHAR, BOOLEAN) OWNER TO cineconecta_owner;
-- Default privileges para objetos futuros creados por este rol
ALTER DEFAULT PRIVILEGES FOR ROLE cineconecta_owner IN SCHEMA public
  GRANT ALL ON TABLES TO cineconecta_owner;
ALTER DEFAULT PRIVILEGES FOR ROLE cineconecta_owner IN SCHEMA public
  GRANT ALL ON SEQUENCES TO cineconecta_owner;
ALTER DEFAULT PRIVILEGES FOR ROLE cineconecta_owner IN SCHEMA public
  GRANT ALL ON FUNCTIONS TO cineconecta_owner;

-- 5.3 Rol de aplicación (app): grupo con privilegios mínimos de runtime, NOLOGIN
CREATE ROLE cineconecta_app NOLOGIN;
GRANT USAGE ON SCHEMA public TO cineconecta_app;

-- GRANTs mínimos deducidos de las reglas de negocio del enunciado:
-- plans: solo catálogo de lectura
GRANT SELECT ON plans TO cineconecta_app;
-- accounts: la app registra (INSERT) y consulta (SELECT); no hay edición de cuentas
GRANT SELECT, INSERT ON accounts TO cineconecta_app;
-- profiles: crear (INSERT), consultar (SELECT), desactivar (UPDATE isActive='N');
-- NO DELETE para conservar historial de perfiles
GRANT SELECT, INSERT, UPDATE ON profiles TO cineconecta_app;
-- subscriptions y payments: historial inmutable; solo SELECT (consultar) e INSERT (via sp)
GRANT SELECT, INSERT ON subscriptions TO cineconecta_app;
GRANT SELECT, INSERT ON payments TO cineconecta_app;

-- USAGE en secuencias/identities para que INSERT funcione con GENERATED ALWAYS AS IDENTITY
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO cineconecta_app;
ALTER DEFAULT PRIVILEGES FOR ROLE cineconecta_owner IN SCHEMA public
  GRANT USAGE ON SEQUENCES TO cineconecta_app;

-- EXECUTE solo en las funciones que la app necesita invocar o que requieren elevación.
-- fn_profiles_check_limits y sp_contratar_suscripcion son SECURITY DEFINER (owner = cineconecta_owner)
-- con SET search_path = public, pg_temp para ejecutarse con privilegios elevados y permitir
-- FOR UPDATE/INSERT internos sin conceder esos privilegios a cineconecta_app.
-- fn_subscription_requires_payment NO es SECURITY DEFINER: es CONSTRAINT TRIGGER AFTER DEFERRABLE
-- y se ejecuta con privilegios del owner de la tabla (cineconecta_owner) al validar al COMMIT.
REVOKE EXECUTE ON FUNCTION fn_profiles_check_limits() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION sp_contratar_suscripcion(INTEGER, INTEGER, VARCHAR, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fn_profiles_check_limits() TO cineconecta_app;
GRANT EXECUTE ON FUNCTION sp_contratar_suscripcion(INTEGER, INTEGER, VARCHAR, BOOLEAN) TO cineconecta_app;
ALTER DEFAULT PRIVILEGES FOR ROLE cineconecta_owner IN SCHEMA public
  GRANT EXECUTE ON FUNCTIONS TO cineconecta_app;

-- 5.4 Usuario real de la aplicación (LOGIN), miembro de cineconecta_app
-- La contraseña se pasa como variable de psql (:\'app_password\'), SIN valor por defecto.
-- Ejemplo de uso: psql -v app_password='secreto' -f 01_postgresql_ddl.sql
-- NO se escribe la contraseña en el script.
-- \set app_password `echo "$APP_PASSWORD"`  -- placeholder; en despliegue real se usa -v app_password='...'
-- La línea anterior no funciona en psql (backticks ejecutan shell); se pasa -v app_password=... al invocar.
CREATE ROLE cineconecta_user LOGIN PASSWORD :'app_password';
GRANT cineconecta_app TO cineconecta_user;

-- FIN DEL SCRIPT