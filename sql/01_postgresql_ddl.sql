
-- CineConecta - DDL PostgreSQL
-- Ejecutar con la conexión en UTC: SET TIME ZONE 'UTC';

-- Necesaria para la restricción de exclusión con igualdad sobre enteros
CREATE EXTENSION IF NOT EXISTS btree_gist;

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
CREATE UNIQUE INDEX ux_profiles_name_ci ON profiles (accountId, LOWER(name));
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
  CONSTRAINT uq_payments_subscription UNIQUE (subscriptionId),
  CONSTRAINT uq_payments_reference UNIQUE (reference),
  CONSTRAINT ck_payments_amount CHECK (amount > 0)
);
CREATE INDEX ix_payments_paidat ON payments (paidAt);

-- Toda suscripción debe tener su pago al confirmar la transacción
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

-- Perfil activo: requiere suscripción vigente y no superar el máximo del plan
CREATE OR REPLACE FUNCTION fn_profiles_check_limits() RETURNS trigger AS $$
DECLARE
  v_max    INTEGER;
  v_active INTEGER;
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.isActive = 'Y' THEN
    RETURN NEW;
  END IF;

  -- Serializa la creación de perfiles de una misma cuenta
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

-- Contratación: pago y suscripción en una única transacción
-- (se invoca solo cuando el pago simulado fue aprobado)
CREATE OR REPLACE FUNCTION sp_contratar_suscripcion(
  p_accountId INTEGER, p_planId INTEGER, p_reference VARCHAR
) RETURNS INTEGER AS $$
DECLARE
  v_price  NUMERIC(12,2);
  v_max    INTEGER;
  v_active INTEGER;
  v_start  TIMESTAMP := CURRENT_TIMESTAMP;
  v_sub    INTEGER;
BEGIN
  PERFORM 1 FROM accounts WHERE accountId = p_accountId FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'La cuenta % no existe', p_accountId;
  END IF;

  SELECT price, maxProfiles INTO v_price, v_max FROM plans WHERE planId = p_planId;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'El plan % no existe', p_planId;
  END IF;

  SELECT COUNT(*) INTO v_active
    FROM profiles WHERE accountId = p_accountId AND isActive = 'Y';
  IF v_active > v_max THEN
    RAISE EXCEPTION 'Desactive % perfil(es) antes de contratar este plan', v_active - v_max;
  END IF;

  -- La restricción ex_subs_no_overlap rechaza el INSERT si ya hay una suscripción vigente
  INSERT INTO subscriptions (accountId, planId, startsAt, endsAt)
  VALUES (p_accountId, p_planId, v_start, v_start + INTERVAL '30 days')
  RETURNING subscriptionId INTO v_sub;

  INSERT INTO payments (subscriptionId, paidAt, amount, reference)
  VALUES (v_sub, v_start, v_price, p_reference);

  RETURN v_sub;
END;
$$ LANGUAGE plpgsql;
