-- CineConecta - Esquema relacional PostgreSQL (versión para evidencia M-09)
-- Basado en sql/01_postgresql_ddl.sql pero sin roles problemáticos ni variables psql

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

-- FIN DEL SCRIPT PARA EVIDENCIA