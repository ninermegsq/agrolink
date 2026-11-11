-- AGROLINK - schema inicial (drizzle/0000_tiresome_nick_fury.sql)
-- 19 enums, 22 tabelas, 28 indices, RLS habilitado em todas as tabelas,
-- papel dedicado da aplicacao (`agrolink_app`) e bookkeeping do drizzle.
--
-- A senha do papel `agrolink_app` NAO fica neste arquivo: ela vive apenas no
-- `.env` local (gitignored). Para reaplicar em outro projeto, troque
-- '<SENHA-FORTE>' abaixo por uma senha a sua escolha.

CREATE TYPE "public"."catalog_access_grants_status" AS ENUM('active', 'revoked');
CREATE TYPE "public"."catalog_contacts_review_status" AS ENUM('pending', 'reviewed', 'published', 'inactive');
CREATE TYPE "public"."catalog_import_batches_source_type" AS ENUM('xlsx', 'csv');
CREATE TYPE "public"."catalog_import_rows_status" AS ENUM('pending', 'created', 'updated', 'duplicate', 'review', 'approved', 'rejected');
CREATE TYPE "public"."contacts_status" AS ENUM('active', 'inactive', 'archived');
CREATE TYPE "public"."import_batch_status" AS ENUM('preview', 'queued', 'processing', 'completed', 'cancelled', 'failed');
CREATE TYPE "public"."import_batches_source_type" AS ENUM('xlsx', 'csv', 'pasted', 'vcard');
CREATE TYPE "public"."import_rows_status" AS ENUM('pending', 'created', 'updated', 'duplicate', 'review', 'rejected');
CREATE TYPE "public"."message_templates_scope" AS ENUM('organization', 'personal');
CREATE TYPE "public"."opportunities_stage" AS ENUM('new', 'started', 'negotiating', 'won', 'lost');
CREATE TYPE "public"."organization_members_role" AS ENUM('owner', 'admin', 'operator');
CREATE TYPE "public"."organization_members_status" AS ENUM('active', 'invited', 'suspended');
CREATE TYPE "public"."phone_validation_status" AS ENUM('valid', 'incomplete', 'review', 'invalid');
CREATE TYPE "public"."subscriptions_billing_period" AS ENUM('monthly', 'annual');
CREATE TYPE "public"."subscriptions_plan" AS ENUM('essential', 'professional', 'enterprise');
CREATE TYPE "public"."subscriptions_status" AS ENUM('trial', 'active', 'past_due', 'cancelled', 'pending');
CREATE TYPE "public"."tasks_status" AS ENUM('pending', 'done', 'cancelled');
CREATE TYPE "public"."users_access_status" AS ENUM('pending', 'active', 'blocked');
CREATE TYPE "public"."users_role" AS ENUM('user', 'admin');

CREATE TABLE "public"."activities" (
	"id" serial PRIMARY KEY NOT NULL,
	"organizationId" integer NOT NULL,
	"contactId" integer,
	"catalogContactId" integer,
	"userId" integer NOT NULL,
	"type" varchar(60) NOT NULL,
	"description" text NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE "public"."auditLogs" (
	"id" serial PRIMARY KEY NOT NULL,
	"organizationId" integer NOT NULL,
	"userId" integer,
	"action" varchar(120) NOT NULL,
	"entityType" varchar(80) NOT NULL,
	"entityId" integer,
	"metadataJson" text,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE "public"."catalogAccessGrants" (
	"id" serial PRIMARY KEY NOT NULL,
	"organizationId" integer NOT NULL,
	"grantedById" integer NOT NULL,
	"status" "catalog_access_grants_status" DEFAULT 'active' NOT NULL,
	"validUntil" timestamp with time zone NOT NULL,
	"reason" varchar(500) NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"revokedAt" timestamp with time zone
);
CREATE TABLE "public"."catalogAuditLogs" (
	"id" serial PRIMARY KEY NOT NULL,
	"adminUserId" integer NOT NULL,
	"catalogContactId" integer,
	"batchId" integer,
	"action" varchar(120) NOT NULL,
	"metadataJson" text,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE "public"."catalogContactPhones" (
	"id" serial PRIMARY KEY NOT NULL,
	"catalogContactId" integer NOT NULL,
	"original" varchar(80) NOT NULL,
	"normalized" varchar(40),
	"countryCode" varchar(8),
	"areaCode" varchar(8),
	"validationStatus" "phone_validation_status" DEFAULT 'review' NOT NULL,
	"source" varchar(80) DEFAULT 'catalog_import' NOT NULL,
	"isWhatsapp" boolean DEFAULT true NOT NULL,
	"isPreferred" boolean DEFAULT false NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE "public"."catalogContacts" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(180) NOT NULL,
	"tradeName" varchar(180),
	"company" varchar(180),
	"email" varchar(320),
	"addressOriginal" text,
	"street" varchar(180),
	"addressNumber" varchar(40),
	"complement" varchar(120),
	"neighborhood" varchar(120),
	"city" varchar(120),
	"state" varchar(4),
	"zipCode" varchar(20),
	"region" varchar(120),
	"products" text,
	"businessType" varchar(80),
	"categoriesJson" text,
	"tagsJson" text,
	"origin" varchar(160) NOT NULL,
	"sourceFile" varchar(255),
	"sourceRowNumber" integer,
	"sourceUpdatedAt" timestamp with time zone,
	"rawJson" text,
	"reviewStatus" "catalog_contacts_review_status" DEFAULT 'pending' NOT NULL,
	"reviewedAt" timestamp with time zone,
	"reviewedById" integer,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE "public"."catalogImportBatches" (
	"id" serial PRIMARY KEY NOT NULL,
	"createdById" integer NOT NULL,
	"fileName" varchar(255),
	"sourceType" "catalog_import_batches_source_type" NOT NULL,
	"status" "import_batch_status" DEFAULT 'preview' NOT NULL,
	"totalRows" integer DEFAULT 0 NOT NULL,
	"processedRows" integer DEFAULT 0 NOT NULL,
	"createdContacts" integer DEFAULT 0 NOT NULL,
	"updatedContacts" integer DEFAULT 0 NOT NULL,
	"duplicateRows" integer DEFAULT 0 NOT NULL,
	"reviewRows" integer DEFAULT 0 NOT NULL,
	"rejectedRows" integer DEFAULT 0 NOT NULL,
	"approvedRows" integer DEFAULT 0 NOT NULL,
	"publishedRows" integer DEFAULT 0 NOT NULL,
	"publishedAt" timestamp with time zone,
	"publishedById" integer,
	"settingsJson" text,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"completedAt" timestamp with time zone
);
CREATE TABLE "public"."catalogImportRows" (
	"id" serial PRIMARY KEY NOT NULL,
	"batchId" integer NOT NULL,
	"rowNumber" integer NOT NULL,
	"fingerprint" varchar(160) NOT NULL,
	"rawJson" text,
	"status" "catalog_import_rows_status" DEFAULT 'pending' NOT NULL,
	"message" text,
	"catalogContactId" integer
);
CREATE TABLE "public"."catalogLinks" (
	"id" serial PRIMARY KEY NOT NULL,
	"organizationId" integer NOT NULL,
	"catalogContactId" integer NOT NULL,
	"favorite" boolean DEFAULT false NOT NULL,
	"notes" text,
	"tagsJson" text,
	"responsibleUserId" integer,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE "public"."categories" (
	"id" serial PRIMARY KEY NOT NULL,
	"organizationId" integer NOT NULL,
	"name" varchar(120) NOT NULL,
	"color" varchar(20) DEFAULT 'green' NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE "public"."contactPhones" (
	"id" serial PRIMARY KEY NOT NULL,
	"organizationId" integer NOT NULL,
	"contactId" integer NOT NULL,
	"original" varchar(80) NOT NULL,
	"normalized" varchar(40),
	"countryCode" varchar(8),
	"areaCode" varchar(8),
	"validationStatus" "phone_validation_status" DEFAULT 'review' NOT NULL,
	"source" varchar(80) DEFAULT 'import' NOT NULL,
	"isWhatsapp" boolean DEFAULT true NOT NULL,
	"isPreferred" boolean DEFAULT false NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE "public"."contacts" (
	"id" serial PRIMARY KEY NOT NULL,
	"organizationId" integer NOT NULL,
	"name" varchar(180) NOT NULL,
	"tradeName" varchar(180),
	"company" varchar(180),
	"email" varchar(320),
	"addressOriginal" text,
	"street" varchar(180),
	"addressNumber" varchar(40),
	"complement" varchar(120),
	"neighborhood" varchar(120),
	"city" varchar(120),
	"state" varchar(4),
	"zipCode" varchar(20),
	"region" varchar(120),
	"products" text,
	"businessType" varchar(80),
	"notes" text,
	"categoriesJson" text,
	"tagsJson" text,
	"responsibleUserId" integer,
	"origin" varchar(120) DEFAULT 'manual' NOT NULL,
	"importBatchId" integer,
	"status" "contacts_status" DEFAULT 'active' NOT NULL,
	"communicationPreference" varchar(40) DEFAULT 'whatsapp' NOT NULL,
	"doNotContact" boolean DEFAULT false NOT NULL,
	"favorite" boolean DEFAULT false NOT NULL,
	"customFieldsJson" text,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE "public"."importBatches" (
	"id" serial PRIMARY KEY NOT NULL,
	"organizationId" integer NOT NULL,
	"createdById" integer NOT NULL,
	"fileName" varchar(255),
	"sourceType" "import_batches_source_type" NOT NULL,
	"profileName" varchar(120) DEFAULT 'Modelo Produtores',
	"status" "import_batch_status" DEFAULT 'preview' NOT NULL,
	"totalRows" integer DEFAULT 0 NOT NULL,
	"processedRows" integer DEFAULT 0 NOT NULL,
	"createdContacts" integer DEFAULT 0 NOT NULL,
	"updatedContacts" integer DEFAULT 0 NOT NULL,
	"ignoredDuplicates" integer DEFAULT 0 NOT NULL,
	"pendingRows" integer DEFAULT 0 NOT NULL,
	"rejectedRows" integer DEFAULT 0 NOT NULL,
	"settingsJson" text,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"completedAt" timestamp with time zone
);
CREATE TABLE "public"."importRows" (
	"id" serial PRIMARY KEY NOT NULL,
	"organizationId" integer NOT NULL,
	"batchId" integer NOT NULL,
	"rowNumber" integer NOT NULL,
	"fingerprint" varchar(160) NOT NULL,
	"rawJson" text,
	"status" "import_rows_status" DEFAULT 'pending' NOT NULL,
	"message" text,
	"contactId" integer
);
CREATE TABLE "public"."messageTemplates" (
	"id" serial PRIMARY KEY NOT NULL,
	"organizationId" integer NOT NULL,
	"ownerId" integer,
	"name" varchar(140) NOT NULL,
	"body" text NOT NULL,
	"categoryName" varchar(120),
	"purpose" varchar(80) DEFAULT 'geral' NOT NULL,
	"scope" "message_templates_scope" DEFAULT 'organization' NOT NULL,
	"isDefault" boolean DEFAULT false NOT NULL,
	"archived" boolean DEFAULT false NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE "public"."opportunities" (
	"id" serial PRIMARY KEY NOT NULL,
	"organizationId" integer NOT NULL,
	"contactId" integer NOT NULL,
	"catalogContactId" integer,
	"ownerId" integer,
	"title" varchar(180) NOT NULL,
	"stage" "opportunities_stage" DEFAULT 'new' NOT NULL,
	"valueCents" integer,
	"nextContactAt" timestamp with time zone,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE "public"."organizationMembers" (
	"id" serial PRIMARY KEY NOT NULL,
	"organizationId" integer NOT NULL,
	"userId" integer NOT NULL,
	"role" "organization_members_role" DEFAULT 'operator' NOT NULL,
	"status" "organization_members_status" DEFAULT 'active' NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE "public"."organizations" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(180) NOT NULL,
	"slug" varchar(120) NOT NULL,
	"ownerId" integer NOT NULL,
	"countryCode" varchar(4) DEFAULT 'BR' NOT NULL,
	"countryDialCode" varchar(8) DEFAULT '55' NOT NULL,
	"defaultAreaCode" varchar(4),
	"usePhonesAsWhatsapp" boolean DEFAULT true NOT NULL,
	"openWhatsappDirectly" boolean DEFAULT false NOT NULL,
	"defaultMessage" text,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organizations_slug_unique" UNIQUE("slug")
);
CREATE TABLE "public"."subscriptions" (
	"id" serial PRIMARY KEY NOT NULL,
	"organizationId" integer NOT NULL,
	"plan" "subscriptions_plan" DEFAULT 'essential' NOT NULL,
	"billingPeriod" "subscriptions_billing_period" DEFAULT 'monthly' NOT NULL,
	"status" "subscriptions_status" DEFAULT 'pending' NOT NULL,
	"catalogAccess" boolean DEFAULT false NOT NULL,
	"catalogIncluded" boolean DEFAULT false NOT NULL,
	"trialEndsAt" timestamp with time zone,
	"manualCatalogAccessUntil" timestamp with time zone,
	"cancelAtPeriodEnd" boolean DEFAULT false NOT NULL,
	"maxContacts" integer DEFAULT 1000 NOT NULL,
	"maxMembers" integer DEFAULT 3 NOT NULL,
	"maxImports" integer DEFAULT 10 NOT NULL,
	"stripeCustomerId" varchar(120),
	"stripeSubscriptionId" varchar(120),
	"currentPeriodEnd" timestamp with time zone,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE "public"."tags" (
	"id" serial PRIMARY KEY NOT NULL,
	"organizationId" integer NOT NULL,
	"name" varchar(80) NOT NULL,
	"color" varchar(20) DEFAULT 'sage' NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE "public"."tasks" (
	"id" serial PRIMARY KEY NOT NULL,
	"organizationId" integer NOT NULL,
	"contactId" integer,
	"catalogContactId" integer,
	"assignedToId" integer,
	"title" varchar(180) NOT NULL,
	"dueAt" timestamp with time zone,
	"status" "tasks_status" DEFAULT 'pending' NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE "public"."users" (
	"id" serial PRIMARY KEY NOT NULL,
	"openId" varchar(64) NOT NULL,
	"name" text,
	"email" varchar(320),
	"passwordHash" varchar(255),
	"loginMethod" varchar(64),
	"role" "users_role" DEFAULT 'user' NOT NULL,
	"accessStatus" "users_access_status" DEFAULT 'active' NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	"lastSignedIn" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_openId_unique" UNIQUE("openId")
);

CREATE INDEX "activities_org_created_idx" ON "public"."activities" USING btree ("organizationId","createdAt");
CREATE INDEX "catalogAccessGrants_org_status_idx" ON "public"."catalogAccessGrants" USING btree ("organizationId","status");
CREATE INDEX "catalogAuditLogs_created_idx" ON "public"."catalogAuditLogs" USING btree ("createdAt");
CREATE INDEX "catalogContactPhones_contact_idx" ON "public"."catalogContactPhones" USING btree ("catalogContactId");
CREATE INDEX "catalogContactPhones_normalized_idx" ON "public"."catalogContactPhones" USING btree ("normalized");
CREATE INDEX "catalogContacts_name_idx" ON "public"."catalogContacts" USING btree ("name");
CREATE INDEX "catalogContacts_state_idx" ON "public"."catalogContacts" USING btree ("state");
CREATE INDEX "catalogContacts_city_idx" ON "public"."catalogContacts" USING btree ("city");
CREATE INDEX "catalogContacts_status_idx" ON "public"."catalogContacts" USING btree ("reviewStatus");
CREATE INDEX "catalogImportBatches_created_idx" ON "public"."catalogImportBatches" USING btree ("createdAt");
CREATE UNIQUE INDEX "catalogImportRows_batch_row_unique" ON "public"."catalogImportRows" USING btree ("batchId","rowNumber");
CREATE UNIQUE INDEX "catalogLinks_org_contact_unique" ON "public"."catalogLinks" USING btree ("organizationId","catalogContactId");
CREATE INDEX "catalogLinks_org_idx" ON "public"."catalogLinks" USING btree ("organizationId");
CREATE UNIQUE INDEX "categories_org_name_unique" ON "public"."categories" USING btree ("organizationId","name");
CREATE INDEX "contactPhones_contact_idx" ON "public"."contactPhones" USING btree ("contactId");
CREATE INDEX "contactPhones_org_normalized_idx" ON "public"."contactPhones" USING btree ("organizationId","normalized");
CREATE INDEX "contacts_org_name_idx" ON "public"."contacts" USING btree ("organizationId","name");
CREATE INDEX "contacts_org_status_idx" ON "public"."contacts" USING btree ("organizationId","status");
CREATE INDEX "contacts_org_email_idx" ON "public"."contacts" USING btree ("organizationId","email");
CREATE INDEX "contacts_org_city_idx" ON "public"."contacts" USING btree ("organizationId","city");
CREATE INDEX "importBatches_org_created_idx" ON "public"."importBatches" USING btree ("organizationId","createdAt");
CREATE UNIQUE INDEX "importRows_batch_row_unique" ON "public"."importRows" USING btree ("batchId","rowNumber");
CREATE INDEX "importRows_fingerprint_idx" ON "public"."importRows" USING btree ("organizationId","fingerprint");
CREATE UNIQUE INDEX "organizationMembers_org_user_unique" ON "public"."organizationMembers" USING btree ("organizationId","userId");
CREATE INDEX "organizationMembers_user_idx" ON "public"."organizationMembers" USING btree ("userId");
CREATE INDEX "organizations_owner_idx" ON "public"."organizations" USING btree ("ownerId");
CREATE UNIQUE INDEX "tags_org_name_unique" ON "public"."tags" USING btree ("organizationId","name");
CREATE UNIQUE INDEX "users_email_unique" ON "public"."users" USING btree ("email");

-- Papel dedicado da aplicacao: sem superusuario, sem BYPASSRLS e sem
-- permissao de criar outros papeis. A senha e definida no ambiente.
CREATE ROLE agrolink_app LOGIN PASSWORD '<SENHA-FORTE>' NOSUPERUSER NOCREATEDB NOCREATEROLE INHERIT;
GRANT USAGE ON SCHEMA public TO agrolink_app;

-- Row Level Security: a aplicacao conecta com o papel dedicado `agrolink_app`
-- (sem superusuario e sem BYPASSRLS), e as regras de acesso ficam no servidor
-- (sessao + escopo de organizacao). As politicas liberam `service_role` e
-- `agrolink_app`; `anon` e `authenticated` ficam sem politica alguma, e com o
-- RLS ativo o acesso e negado por padrao (PostgREST devolve zero linhas).
ALTER TABLE "public"."activities" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."auditLogs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."catalogAccessGrants" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."catalogAuditLogs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."catalogContactPhones" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."catalogContacts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."catalogImportBatches" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."catalogImportRows" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."catalogLinks" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."categories" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."contactPhones" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."contacts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."importBatches" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."importRows" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."messageTemplates" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."opportunities" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."organizationMembers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."organizations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."subscriptions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."tags" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."tasks" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."users" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "activities_service_role_all" ON "public"."activities" FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "auditLogs_service_role_all" ON "public"."auditLogs" FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "catalogAccessGrants_service_role_all" ON "public"."catalogAccessGrants" FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "catalogAuditLogs_service_role_all" ON "public"."catalogAuditLogs" FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "catalogContactPhones_service_role_all" ON "public"."catalogContactPhones" FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "catalogContacts_service_role_all" ON "public"."catalogContacts" FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "catalogImportBatches_service_role_all" ON "public"."catalogImportBatches" FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "catalogImportRows_service_role_all" ON "public"."catalogImportRows" FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "catalogLinks_service_role_all" ON "public"."catalogLinks" FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "categories_service_role_all" ON "public"."categories" FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "contactPhones_service_role_all" ON "public"."contactPhones" FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "contacts_service_role_all" ON "public"."contacts" FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "importBatches_service_role_all" ON "public"."importBatches" FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "importRows_service_role_all" ON "public"."importRows" FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "messageTemplates_service_role_all" ON "public"."messageTemplates" FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "opportunities_service_role_all" ON "public"."opportunities" FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "organizationMembers_service_role_all" ON "public"."organizationMembers" FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "organizations_service_role_all" ON "public"."organizations" FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "subscriptions_service_role_all" ON "public"."subscriptions" FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "tags_service_role_all" ON "public"."tags" FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "tasks_service_role_all" ON "public"."tasks" FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "users_service_role_all" ON "public"."users" FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Politicas do papel da aplicacao. O escopo por organizacao e garantido no
-- servidor (sessao + organizacao do usuario), nao no banco.
CREATE POLICY "activities_agrolink_app_all" ON "public"."activities" FOR ALL TO agrolink_app USING (true) WITH CHECK (true);
CREATE POLICY "auditLogs_agrolink_app_all" ON "public"."auditLogs" FOR ALL TO agrolink_app USING (true) WITH CHECK (true);
CREATE POLICY "catalogAccessGrants_agrolink_app_all" ON "public"."catalogAccessGrants" FOR ALL TO agrolink_app USING (true) WITH CHECK (true);
CREATE POLICY "catalogAuditLogs_agrolink_app_all" ON "public"."catalogAuditLogs" FOR ALL TO agrolink_app USING (true) WITH CHECK (true);
CREATE POLICY "catalogContactPhones_agrolink_app_all" ON "public"."catalogContactPhones" FOR ALL TO agrolink_app USING (true) WITH CHECK (true);
CREATE POLICY "catalogContacts_agrolink_app_all" ON "public"."catalogContacts" FOR ALL TO agrolink_app USING (true) WITH CHECK (true);
CREATE POLICY "catalogImportBatches_agrolink_app_all" ON "public"."catalogImportBatches" FOR ALL TO agrolink_app USING (true) WITH CHECK (true);
CREATE POLICY "catalogImportRows_agrolink_app_all" ON "public"."catalogImportRows" FOR ALL TO agrolink_app USING (true) WITH CHECK (true);
CREATE POLICY "catalogLinks_agrolink_app_all" ON "public"."catalogLinks" FOR ALL TO agrolink_app USING (true) WITH CHECK (true);
CREATE POLICY "categories_agrolink_app_all" ON "public"."categories" FOR ALL TO agrolink_app USING (true) WITH CHECK (true);
CREATE POLICY "contactPhones_agrolink_app_all" ON "public"."contactPhones" FOR ALL TO agrolink_app USING (true) WITH CHECK (true);
CREATE POLICY "contacts_agrolink_app_all" ON "public"."contacts" FOR ALL TO agrolink_app USING (true) WITH CHECK (true);
CREATE POLICY "importBatches_agrolink_app_all" ON "public"."importBatches" FOR ALL TO agrolink_app USING (true) WITH CHECK (true);
CREATE POLICY "importRows_agrolink_app_all" ON "public"."importRows" FOR ALL TO agrolink_app USING (true) WITH CHECK (true);
CREATE POLICY "messageTemplates_agrolink_app_all" ON "public"."messageTemplates" FOR ALL TO agrolink_app USING (true) WITH CHECK (true);
CREATE POLICY "opportunities_agrolink_app_all" ON "public"."opportunities" FOR ALL TO agrolink_app USING (true) WITH CHECK (true);
CREATE POLICY "organizationMembers_agrolink_app_all" ON "public"."organizationMembers" FOR ALL TO agrolink_app USING (true) WITH CHECK (true);
CREATE POLICY "organizations_agrolink_app_all" ON "public"."organizations" FOR ALL TO agrolink_app USING (true) WITH CHECK (true);
CREATE POLICY "subscriptions_agrolink_app_all" ON "public"."subscriptions" FOR ALL TO agrolink_app USING (true) WITH CHECK (true);
CREATE POLICY "tags_agrolink_app_all" ON "public"."tags" FOR ALL TO agrolink_app USING (true) WITH CHECK (true);
CREATE POLICY "tasks_agrolink_app_all" ON "public"."tasks" FOR ALL TO agrolink_app USING (true) WITH CHECK (true);
CREATE POLICY "users_agrolink_app_all" ON "public"."users" FOR ALL TO agrolink_app USING (true) WITH CHECK (true);

-- Permissoes explicitas exigidas pela aplicacao.
GRANT USAGE ON SCHEMA public TO postgres, service_role, agrolink_app;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO postgres, service_role, agrolink_app;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO postgres, service_role, agrolink_app;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO postgres, service_role, agrolink_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO postgres, service_role, agrolink_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres, service_role, agrolink_app;

-- Bookkeeping do drizzle: mantem `pnpm db:migrate` coerente com o schema ja aplicado.
CREATE SCHEMA IF NOT EXISTS drizzle;
CREATE TABLE IF NOT EXISTS "drizzle"."__drizzle_migrations" (
	"id" SERIAL PRIMARY KEY,
	"hash" text NOT NULL,
	"created_at" bigint
);
ALTER TABLE "drizzle"."__drizzle_migrations" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "drizzle_migrations_service_role_all" ON "drizzle"."__drizzle_migrations" FOR ALL TO service_role USING (true) WITH CHECK (true);
GRANT USAGE ON SCHEMA drizzle TO postgres, service_role, agrolink_app;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA drizzle TO postgres, service_role, agrolink_app;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA drizzle TO postgres, service_role, agrolink_app;
INSERT INTO "drizzle"."__drizzle_migrations" ("hash", "created_at") VALUES ('c2dcb8a6650978fba6ea24ae09751f5fa60176fac0d252c9deeaab0ac512a473', 1794404410761);
