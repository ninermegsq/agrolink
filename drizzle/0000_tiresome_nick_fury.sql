CREATE TYPE "public"."catalog_access_grants_status" AS ENUM('active', 'revoked');--> statement-breakpoint
CREATE TYPE "public"."catalog_contacts_review_status" AS ENUM('pending', 'reviewed', 'published', 'inactive');--> statement-breakpoint
CREATE TYPE "public"."catalog_import_batches_source_type" AS ENUM('xlsx', 'csv');--> statement-breakpoint
CREATE TYPE "public"."catalog_import_rows_status" AS ENUM('pending', 'created', 'updated', 'duplicate', 'review', 'approved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."contacts_status" AS ENUM('active', 'inactive', 'archived');--> statement-breakpoint
CREATE TYPE "public"."import_batch_status" AS ENUM('preview', 'queued', 'processing', 'completed', 'cancelled', 'failed');--> statement-breakpoint
CREATE TYPE "public"."import_batches_source_type" AS ENUM('xlsx', 'csv', 'pasted', 'vcard');--> statement-breakpoint
CREATE TYPE "public"."import_rows_status" AS ENUM('pending', 'created', 'updated', 'duplicate', 'review', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."message_templates_scope" AS ENUM('organization', 'personal');--> statement-breakpoint
CREATE TYPE "public"."opportunities_stage" AS ENUM('new', 'started', 'negotiating', 'won', 'lost');--> statement-breakpoint
CREATE TYPE "public"."organization_members_role" AS ENUM('owner', 'admin', 'operator');--> statement-breakpoint
CREATE TYPE "public"."organization_members_status" AS ENUM('active', 'invited', 'suspended');--> statement-breakpoint
CREATE TYPE "public"."phone_validation_status" AS ENUM('valid', 'incomplete', 'review', 'invalid');--> statement-breakpoint
CREATE TYPE "public"."subscriptions_billing_period" AS ENUM('monthly', 'annual');--> statement-breakpoint
CREATE TYPE "public"."subscriptions_plan" AS ENUM('essential', 'professional', 'enterprise');--> statement-breakpoint
CREATE TYPE "public"."subscriptions_status" AS ENUM('trial', 'active', 'past_due', 'cancelled', 'pending');--> statement-breakpoint
CREATE TYPE "public"."tasks_status" AS ENUM('pending', 'done', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."users_access_status" AS ENUM('pending', 'active', 'blocked');--> statement-breakpoint
CREATE TYPE "public"."users_role" AS ENUM('user', 'admin');--> statement-breakpoint
CREATE TABLE "activities" (
	"id" serial PRIMARY KEY NOT NULL,
	"organizationId" integer NOT NULL,
	"contactId" integer,
	"catalogContactId" integer,
	"userId" integer NOT NULL,
	"type" varchar(60) NOT NULL,
	"description" text NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auditLogs" (
	"id" serial PRIMARY KEY NOT NULL,
	"organizationId" integer NOT NULL,
	"userId" integer,
	"action" varchar(120) NOT NULL,
	"entityType" varchar(80) NOT NULL,
	"entityId" integer,
	"metadataJson" text,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "catalogAccessGrants" (
	"id" serial PRIMARY KEY NOT NULL,
	"organizationId" integer NOT NULL,
	"grantedById" integer NOT NULL,
	"status" "catalog_access_grants_status" DEFAULT 'active' NOT NULL,
	"validUntil" timestamp with time zone NOT NULL,
	"reason" varchar(500) NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"revokedAt" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "catalogAuditLogs" (
	"id" serial PRIMARY KEY NOT NULL,
	"adminUserId" integer NOT NULL,
	"catalogContactId" integer,
	"batchId" integer,
	"action" varchar(120) NOT NULL,
	"metadataJson" text,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "catalogContactPhones" (
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
--> statement-breakpoint
CREATE TABLE "catalogContacts" (
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
--> statement-breakpoint
CREATE TABLE "catalogImportBatches" (
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
--> statement-breakpoint
CREATE TABLE "catalogImportRows" (
	"id" serial PRIMARY KEY NOT NULL,
	"batchId" integer NOT NULL,
	"rowNumber" integer NOT NULL,
	"fingerprint" varchar(160) NOT NULL,
	"rawJson" text,
	"status" "catalog_import_rows_status" DEFAULT 'pending' NOT NULL,
	"message" text,
	"catalogContactId" integer
);
--> statement-breakpoint
CREATE TABLE "catalogLinks" (
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
--> statement-breakpoint
CREATE TABLE "categories" (
	"id" serial PRIMARY KEY NOT NULL,
	"organizationId" integer NOT NULL,
	"name" varchar(120) NOT NULL,
	"color" varchar(20) DEFAULT 'green' NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contactPhones" (
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
--> statement-breakpoint
CREATE TABLE "contacts" (
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
--> statement-breakpoint
CREATE TABLE "importBatches" (
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
--> statement-breakpoint
CREATE TABLE "importRows" (
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
--> statement-breakpoint
CREATE TABLE "messageTemplates" (
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
--> statement-breakpoint
CREATE TABLE "opportunities" (
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
--> statement-breakpoint
CREATE TABLE "organizationMembers" (
	"id" serial PRIMARY KEY NOT NULL,
	"organizationId" integer NOT NULL,
	"userId" integer NOT NULL,
	"role" "organization_members_role" DEFAULT 'operator' NOT NULL,
	"status" "organization_members_status" DEFAULT 'active' NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organizations" (
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
--> statement-breakpoint
CREATE TABLE "subscriptions" (
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
--> statement-breakpoint
CREATE TABLE "tags" (
	"id" serial PRIMARY KEY NOT NULL,
	"organizationId" integer NOT NULL,
	"name" varchar(80) NOT NULL,
	"color" varchar(20) DEFAULT 'sage' NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tasks" (
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
--> statement-breakpoint
CREATE TABLE "users" (
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
--> statement-breakpoint
CREATE INDEX "activities_org_created_idx" ON "activities" USING btree ("organizationId","createdAt");--> statement-breakpoint
CREATE INDEX "catalogAccessGrants_org_status_idx" ON "catalogAccessGrants" USING btree ("organizationId","status");--> statement-breakpoint
CREATE INDEX "catalogAuditLogs_created_idx" ON "catalogAuditLogs" USING btree ("createdAt");--> statement-breakpoint
CREATE INDEX "catalogContactPhones_contact_idx" ON "catalogContactPhones" USING btree ("catalogContactId");--> statement-breakpoint
CREATE INDEX "catalogContactPhones_normalized_idx" ON "catalogContactPhones" USING btree ("normalized");--> statement-breakpoint
CREATE INDEX "catalogContacts_name_idx" ON "catalogContacts" USING btree ("name");--> statement-breakpoint
CREATE INDEX "catalogContacts_state_idx" ON "catalogContacts" USING btree ("state");--> statement-breakpoint
CREATE INDEX "catalogContacts_city_idx" ON "catalogContacts" USING btree ("city");--> statement-breakpoint
CREATE INDEX "catalogContacts_status_idx" ON "catalogContacts" USING btree ("reviewStatus");--> statement-breakpoint
CREATE INDEX "catalogImportBatches_created_idx" ON "catalogImportBatches" USING btree ("createdAt");--> statement-breakpoint
CREATE UNIQUE INDEX "catalogImportRows_batch_row_unique" ON "catalogImportRows" USING btree ("batchId","rowNumber");--> statement-breakpoint
CREATE UNIQUE INDEX "catalogLinks_org_contact_unique" ON "catalogLinks" USING btree ("organizationId","catalogContactId");--> statement-breakpoint
CREATE INDEX "catalogLinks_org_idx" ON "catalogLinks" USING btree ("organizationId");--> statement-breakpoint
CREATE UNIQUE INDEX "categories_org_name_unique" ON "categories" USING btree ("organizationId","name");--> statement-breakpoint
CREATE INDEX "contactPhones_contact_idx" ON "contactPhones" USING btree ("contactId");--> statement-breakpoint
CREATE INDEX "contactPhones_org_normalized_idx" ON "contactPhones" USING btree ("organizationId","normalized");--> statement-breakpoint
CREATE INDEX "contacts_org_name_idx" ON "contacts" USING btree ("organizationId","name");--> statement-breakpoint
CREATE INDEX "contacts_org_status_idx" ON "contacts" USING btree ("organizationId","status");--> statement-breakpoint
CREATE INDEX "contacts_org_email_idx" ON "contacts" USING btree ("organizationId","email");--> statement-breakpoint
CREATE INDEX "contacts_org_city_idx" ON "contacts" USING btree ("organizationId","city");--> statement-breakpoint
CREATE INDEX "importBatches_org_created_idx" ON "importBatches" USING btree ("organizationId","createdAt");--> statement-breakpoint
CREATE UNIQUE INDEX "importRows_batch_row_unique" ON "importRows" USING btree ("batchId","rowNumber");--> statement-breakpoint
CREATE INDEX "importRows_fingerprint_idx" ON "importRows" USING btree ("organizationId","fingerprint");--> statement-breakpoint
CREATE UNIQUE INDEX "organizationMembers_org_user_unique" ON "organizationMembers" USING btree ("organizationId","userId");--> statement-breakpoint
CREATE INDEX "organizationMembers_user_idx" ON "organizationMembers" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "organizations_owner_idx" ON "organizations" USING btree ("ownerId");--> statement-breakpoint
CREATE UNIQUE INDEX "tags_org_name_unique" ON "tags" USING btree ("organizationId","name");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_unique" ON "users" USING btree ("email");