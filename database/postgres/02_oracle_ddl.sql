
BEGIN
  EXECUTE IMMEDIATE 'DROP TABLE payments CASCADE CONSTRAINTS';
EXCEPTION WHEN OTHERS THEN NULL;
END;
/
BEGIN
  EXECUTE IMMEDIATE 'DROP TABLE subscriptions CASCADE CONSTRAINTS';
EXCEPTION WHEN OTHERS THEN NULL;
END;
/
BEGIN
  EXECUTE IMMEDIATE 'DROP TABLE profiles CASCADE CONSTRAINTS';
EXCEPTION WHEN OTHERS THEN NULL;
END;
/
BEGIN
  EXECUTE IMMEDIATE 'DROP TABLE plans CASCADE CONSTRAINTS';
EXCEPTION WHEN OTHERS THEN NULL;
END;
/
BEGIN
  EXECUTE IMMEDIATE 'DROP TABLE accounts CASCADE CONSTRAINTS';
EXCEPTION WHEN OTHERS THEN NULL;
END;
/

CREATE TABLE plans (
  planId       NUMBER GENERATED ALWAYS AS IDENTITY,
  name         VARCHAR2(60)   NOT NULL,
  price        NUMBER(12,2)   NOT NULL,
  maxProfiles  NUMBER(10)     NOT NULL,
  CONSTRAINT pk_plans PRIMARY KEY (planId),
  CONSTRAINT uq_plans_name UNIQUE (name),
  CONSTRAINT ck_plans_price CHECK (price > 0),
  CONSTRAINT ck_plans_maxprofiles CHECK (maxProfiles >= 1)
);

CREATE TABLE accounts (
  accountId     NUMBER GENERATED ALWAYS AS IDENTITY,
  fullName      VARCHAR2(150) NOT NULL,
  email         VARCHAR2(254) NOT NULL,
  passwordHash  VARCHAR2(255) NOT NULL,
  createdAt     TIMESTAMP      DEFAULT SYSTIMESTAMP NOT NULL,
  CONSTRAINT pk_accounts PRIMARY KEY (accountId),
  CONSTRAINT ck_accounts_fullname CHECK (LENGTH(TRIM(fullName)) > 0),
  CONSTRAINT ck_accounts_email CHECK (INSTR(email, '@') > 1),
  CONSTRAINT ck_accounts_hash CHECK (LENGTH(passwordHash) >= 60)
);

CREATE UNIQUE INDEX ux_accounts_email_ci
  ON accounts (LOWER(email));

CREATE TABLE profiles (
  profileId     NUMBER GENERATED ALWAYS AS IDENTITY,
  accountId     NUMBER       NOT NULL,
  name          VARCHAR2(60) NOT NULL,
  maxAgeRating  NUMBER(2)    NOT NULL,
  isActive      CHAR(1)      DEFAULT 'Y' NOT NULL,
  CONSTRAINT pk_profiles PRIMARY KEY (profileId),
  CONSTRAINT fk_profiles_account
    FOREIGN KEY (accountId) REFERENCES accounts (accountId),
  CONSTRAINT ck_profiles_name CHECK (LENGTH(TRIM(name)) > 0),
  CONSTRAINT ck_profiles_age CHECK (maxAgeRating BETWEEN 0 AND 18),
  CONSTRAINT ck_profiles_active CHECK (isActive IN ('Y', 'N'))
);

CREATE UNIQUE INDEX ux_profiles_name_ci
  ON profiles (accountId, LOWER(name));

CREATE INDEX ix_profiles_account_active
  ON profiles (accountId, isActive);

CREATE TABLE subscriptions (
  subscriptionId NUMBER GENERATED ALWAYS AS IDENTITY,
  accountId      NUMBER      NOT NULL,
  planId         NUMBER      NOT NULL,
  startsAt       TIMESTAMP   NOT NULL,
  endsAt         TIMESTAMP   NOT NULL,
  CONSTRAINT pk_subscriptions PRIMARY KEY (subscriptionId),
  CONSTRAINT fk_subs_account
    FOREIGN KEY (accountId) REFERENCES accounts (accountId),
  CONSTRAINT fk_subs_plan
    FOREIGN KEY (planId) REFERENCES plans (planId),
  CONSTRAINT ck_subs_30days CHECK (endsAt = startsAt + INTERVAL '30' DAY),
  CONSTRAINT ck_subs_period CHECK (endsAt > startsAt)
);

CREATE INDEX ix_subs_plan
  ON subscriptions (planId);

CREATE INDEX ix_subs_account_start
  ON subscriptions (accountId, startsAt DESC);

CREATE TABLE payments (
  paymentId      NUMBER GENERATED ALWAYS AS IDENTITY,
  subscriptionId NUMBER        NOT NULL,
  paidAt         TIMESTAMP     DEFAULT SYSTIMESTAMP NOT NULL,
  amount         NUMBER(12,2)  NOT NULL,
  reference      VARCHAR2(100) NOT NULL,
  CONSTRAINT pk_payments PRIMARY KEY (paymentId),
  CONSTRAINT fk_payments_subscription
    FOREIGN KEY (subscriptionId) REFERENCES subscriptions (subscriptionId),
  CONSTRAINT uq_payments_subscription UNIQUE (subscriptionId),
  CONSTRAINT uq_payments_reference UNIQUE (reference),
  CONSTRAINT ck_payments_amount CHECK (amount > 0)
);

CREATE INDEX ix_payments_paidat
  ON payments (paidAt);

