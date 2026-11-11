import {
  boolean,
  index,
  integer,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";

// =============================================================================
// AGROLINK - esquema do banco (PostgreSQL / Supabase)
//
// Os enums do PostgreSQL sao tipos nomeados no schema publico. Cada conjunto
// de valores precisa de um nome proprio, senao o `CREATE TYPE` falha por
// conflito quando dois tipos compartilham o mesmo nome.
// =============================================================================

export const usersRole = pgEnum("users_role", ["user", "admin"]);
export const usersAccessStatus = pgEnum("users_access_status", ["pending", "active", "blocked"]);
export const organizationMembersRole = pgEnum("organization_members_role", ["owner", "admin", "operator"]);
export const organizationMembersStatus = pgEnum("organization_members_status", ["active", "invited", "suspended"]);
export const contactsStatus = pgEnum("contacts_status", ["active", "inactive", "archived"]);
export const phoneValidationStatus = pgEnum("phone_validation_status", ["valid", "incomplete", "review", "invalid"]);
export const importBatchesSourceType = pgEnum("import_batches_source_type", ["xlsx", "csv", "pasted", "vcard"]);
export const importBatchStatus = pgEnum("import_batch_status", ["preview", "queued", "processing", "completed", "cancelled", "failed"]);
export const importRowsStatus = pgEnum("import_rows_status", ["pending", "created", "updated", "duplicate", "review", "rejected"]);
export const catalogImportBatchesSourceType = pgEnum("catalog_import_batches_source_type", ["xlsx", "csv"]);
export const catalogImportRowsStatus = pgEnum("catalog_import_rows_status", ["pending", "created", "updated", "duplicate", "review", "approved", "rejected"]);
export const catalogContactsReviewStatus = pgEnum("catalog_contacts_review_status", ["pending", "reviewed", "published", "inactive"]);
export const messageTemplatesScope = pgEnum("message_templates_scope", ["organization", "personal"]);
export const tasksStatus = pgEnum("tasks_status", ["pending", "done", "cancelled"]);
export const opportunitiesStage = pgEnum("opportunities_stage", ["new", "started", "negotiating", "won", "lost"]);
export const subscriptionsPlan = pgEnum("subscriptions_plan", ["essential", "professional", "enterprise"]);
export const subscriptionsBillingPeriod = pgEnum("subscriptions_billing_period", ["monthly", "annual"]);
export const subscriptionsStatus = pgEnum("subscriptions_status", ["trial", "active", "past_due", "cancelled", "pending"]);
export const catalogAccessGrantsStatus = pgEnum("catalog_access_grants_status", ["active", "revoked"]);

const createdAt = () => timestamp("createdAt", { withTimezone: true, mode: "date" }).defaultNow().notNull();
const updatedAt = () => timestamp("updatedAt", { withTimezone: true, mode: "date" }).defaultNow().notNull();

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  // Hash scrypt no formato `scrypt$<salt>$<hash>`; nulo para convites
  //Manuais que ainda nao definiram senha.
  passwordHash: varchar("passwordHash", { length: 255 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: usersRole("role").default("user").notNull(),
  accessStatus: usersAccessStatus("accessStatus").default("active").notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
  lastSignedIn: timestamp("lastSignedIn", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
}, table => ({
  emailUnique: uniqueIndex("users_email_unique").on(table.email),
}));

export const organizations = pgTable("organizations", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 180 }).notNull(),
  slug: varchar("slug", { length: 120 }).notNull().unique(),
  ownerId: integer("ownerId").notNull(),
  countryCode: varchar("countryCode", { length: 4 }).default("BR").notNull(),
  countryDialCode: varchar("countryDialCode", { length: 8 }).default("55").notNull(),
  defaultAreaCode: varchar("defaultAreaCode", { length: 4 }),
  usePhonesAsWhatsapp: boolean("usePhonesAsWhatsapp").default(true).notNull(),
  openWhatsappDirectly: boolean("openWhatsappDirectly").default(false).notNull(),
  defaultMessage: text("defaultMessage"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, table => ({ ownerIdx: index("organizations_owner_idx").on(table.ownerId) }));

export const organizationMembers = pgTable("organizationMembers", {
  id: serial("id").primaryKey(),
  organizationId: integer("organizationId").notNull(),
  userId: integer("userId").notNull(),
  role: organizationMembersRole("role").default("operator").notNull(),
  status: organizationMembersStatus("status").default("active").notNull(),
  createdAt: createdAt(),
}, table => ({
  orgUserUnique: uniqueIndex("organizationMembers_org_user_unique").on(table.organizationId, table.userId),
  userIdx: index("organizationMembers_user_idx").on(table.userId),
}));

export const categories = pgTable("categories", {
  id: serial("id").primaryKey(),
  organizationId: integer("organizationId").notNull(),
  name: varchar("name", { length: 120 }).notNull(),
  color: varchar("color", { length: 20 }).default("green").notNull(),
  createdAt: createdAt(),
}, table => ({ orgNameUnique: uniqueIndex("categories_org_name_unique").on(table.organizationId, table.name) }));

export const tags = pgTable("tags", {
  id: serial("id").primaryKey(),
  organizationId: integer("organizationId").notNull(),
  name: varchar("name", { length: 80 }).notNull(),
  color: varchar("color", { length: 20 }).default("sage").notNull(),
  createdAt: createdAt(),
}, table => ({ orgNameUnique: uniqueIndex("tags_org_name_unique").on(table.organizationId, table.name) }));

export const importBatches = pgTable("importBatches", {
  id: serial("id").primaryKey(),
  organizationId: integer("organizationId").notNull(),
  createdById: integer("createdById").notNull(),
  fileName: varchar("fileName", { length: 255 }),
  sourceType: importBatchesSourceType("sourceType").notNull(),
  profileName: varchar("profileName", { length: 120 }).default("Modelo Produtores"),
  status: importBatchStatus("status").default("preview").notNull(),
  totalRows: integer("totalRows").default(0).notNull(),
  processedRows: integer("processedRows").default(0).notNull(),
  createdContacts: integer("createdContacts").default(0).notNull(),
  updatedContacts: integer("updatedContacts").default(0).notNull(),
  ignoredDuplicates: integer("ignoredDuplicates").default(0).notNull(),
  pendingRows: integer("pendingRows").default(0).notNull(),
  rejectedRows: integer("rejectedRows").default(0).notNull(),
  settingsJson: text("settingsJson"),
  createdAt: createdAt(),
  completedAt: timestamp("completedAt", { withTimezone: true, mode: "date" }),
}, table => ({ orgCreatedIdx: index("importBatches_org_created_idx").on(table.organizationId, table.createdAt) }));

export const contacts = pgTable("contacts", {
  id: serial("id").primaryKey(),
  organizationId: integer("organizationId").notNull(),
  name: varchar("name", { length: 180 }).notNull(),
  tradeName: varchar("tradeName", { length: 180 }),
  company: varchar("company", { length: 180 }),
  email: varchar("email", { length: 320 }),
  addressOriginal: text("addressOriginal"),
  street: varchar("street", { length: 180 }),
  addressNumber: varchar("addressNumber", { length: 40 }),
  complement: varchar("complement", { length: 120 }),
  neighborhood: varchar("neighborhood", { length: 120 }),
  city: varchar("city", { length: 120 }),
  state: varchar("state", { length: 4 }),
  zipCode: varchar("zipCode", { length: 20 }),
  region: varchar("region", { length: 120 }),
  products: text("products"),
  businessType: varchar("businessType", { length: 80 }),
  notes: text("notes"),
  categoriesJson: text("categoriesJson"),
  tagsJson: text("tagsJson"),
  responsibleUserId: integer("responsibleUserId"),
  origin: varchar("origin", { length: 120 }).default("manual").notNull(),
  importBatchId: integer("importBatchId"),
  status: contactsStatus("status").default("active").notNull(),
  communicationPreference: varchar("communicationPreference", { length: 40 }).default("whatsapp").notNull(),
  doNotContact: boolean("doNotContact").default(false).notNull(),
  favorite: boolean("favorite").default(false).notNull(),
  customFieldsJson: text("customFieldsJson"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, table => ({
  orgNameIdx: index("contacts_org_name_idx").on(table.organizationId, table.name),
  orgStatusIdx: index("contacts_org_status_idx").on(table.organizationId, table.status),
  orgEmailIdx: index("contacts_org_email_idx").on(table.organizationId, table.email),
  orgCityIdx: index("contacts_org_city_idx").on(table.organizationId, table.city),
}));

export const catalogContacts = pgTable("catalogContacts", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 180 }).notNull(),
  tradeName: varchar("tradeName", { length: 180 }),
  company: varchar("company", { length: 180 }),
  email: varchar("email", { length: 320 }),
  addressOriginal: text("addressOriginal"),
  street: varchar("street", { length: 180 }),
  addressNumber: varchar("addressNumber", { length: 40 }),
  complement: varchar("complement", { length: 120 }),
  neighborhood: varchar("neighborhood", { length: 120 }),
  city: varchar("city", { length: 120 }),
  state: varchar("state", { length: 4 }),
  zipCode: varchar("zipCode", { length: 20 }),
  region: varchar("region", { length: 120 }),
  products: text("products"),
  businessType: varchar("businessType", { length: 80 }),
  categoriesJson: text("categoriesJson"),
  tagsJson: text("tagsJson"),
  origin: varchar("origin", { length: 160 }).notNull(),
  sourceFile: varchar("sourceFile", { length: 255 }),
  sourceRowNumber: integer("sourceRowNumber"),
  sourceUpdatedAt: timestamp("sourceUpdatedAt", { withTimezone: true, mode: "date" }),
  rawJson: text("rawJson"),
  reviewStatus: catalogContactsReviewStatus("reviewStatus").default("pending").notNull(),
  reviewedAt: timestamp("reviewedAt", { withTimezone: true, mode: "date" }),
  reviewedById: integer("reviewedById"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, table => ({
  nameIdx: index("catalogContacts_name_idx").on(table.name),
  stateIdx: index("catalogContacts_state_idx").on(table.state),
  cityIdx: index("catalogContacts_city_idx").on(table.city),
  statusIdx: index("catalogContacts_status_idx").on(table.reviewStatus),
}));

export const contactPhones = pgTable("contactPhones", {
  id: serial("id").primaryKey(),
  organizationId: integer("organizationId").notNull(),
  contactId: integer("contactId").notNull(),
  original: varchar("original", { length: 80 }).notNull(),
  normalized: varchar("normalized", { length: 40 }),
  countryCode: varchar("countryCode", { length: 8 }),
  areaCode: varchar("areaCode", { length: 8 }),
  validationStatus: phoneValidationStatus("validationStatus").default("review").notNull(),
  source: varchar("source", { length: 80 }).default("import").notNull(),
  isWhatsapp: boolean("isWhatsapp").default(true).notNull(),
  isPreferred: boolean("isPreferred").default(false).notNull(),
  createdAt: createdAt(),
}, table => ({
  contactIdx: index("contactPhones_contact_idx").on(table.contactId),
  orgNormalizedIdx: index("contactPhones_org_normalized_idx").on(table.organizationId, table.normalized),
}));

export const catalogContactPhones = pgTable("catalogContactPhones", {
  id: serial("id").primaryKey(),
  catalogContactId: integer("catalogContactId").notNull(),
  original: varchar("original", { length: 80 }).notNull(),
  normalized: varchar("normalized", { length: 40 }),
  countryCode: varchar("countryCode", { length: 8 }),
  areaCode: varchar("areaCode", { length: 8 }),
  validationStatus: phoneValidationStatus("validationStatus").default("review").notNull(),
  source: varchar("source", { length: 80 }).default("catalog_import").notNull(),
  isWhatsapp: boolean("isWhatsapp").default(true).notNull(),
  isPreferred: boolean("isPreferred").default(false).notNull(),
  createdAt: createdAt(),
}, table => ({
  contactIdx: index("catalogContactPhones_contact_idx").on(table.catalogContactId),
  normalizedIdx: index("catalogContactPhones_normalized_idx").on(table.normalized),
}));

export const catalogLinks = pgTable("catalogLinks", {
  id: serial("id").primaryKey(),
  organizationId: integer("organizationId").notNull(),
  catalogContactId: integer("catalogContactId").notNull(),
  favorite: boolean("favorite").default(false).notNull(),
  notes: text("notes"),
  tagsJson: text("tagsJson"),
  responsibleUserId: integer("responsibleUserId"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, table => ({
  orgCatalogUnique: uniqueIndex("catalogLinks_org_contact_unique").on(table.organizationId, table.catalogContactId),
  orgIdx: index("catalogLinks_org_idx").on(table.organizationId),
}));

export const catalogImportBatches = pgTable("catalogImportBatches", {
  id: serial("id").primaryKey(),
  createdById: integer("createdById").notNull(),
  fileName: varchar("fileName", { length: 255 }),
  sourceType: catalogImportBatchesSourceType("sourceType").notNull(),
  status: importBatchStatus("status").default("preview").notNull(),
  totalRows: integer("totalRows").default(0).notNull(),
  processedRows: integer("processedRows").default(0).notNull(),
  createdContacts: integer("createdContacts").default(0).notNull(),
  updatedContacts: integer("updatedContacts").default(0).notNull(),
  duplicateRows: integer("duplicateRows").default(0).notNull(),
  reviewRows: integer("reviewRows").default(0).notNull(),
  rejectedRows: integer("rejectedRows").default(0).notNull(),
  approvedRows: integer("approvedRows").default(0).notNull(),
  publishedRows: integer("publishedRows").default(0).notNull(),
  publishedAt: timestamp("publishedAt", { withTimezone: true, mode: "date" }),
  publishedById: integer("publishedById"),
  settingsJson: text("settingsJson"),
  createdAt: createdAt(),
  completedAt: timestamp("completedAt", { withTimezone: true, mode: "date" }),
}, table => ({ createdIdx: index("catalogImportBatches_created_idx").on(table.createdAt) }));

export const catalogImportRows = pgTable("catalogImportRows", {
  id: serial("id").primaryKey(),
  batchId: integer("batchId").notNull(),
  rowNumber: integer("rowNumber").notNull(),
  fingerprint: varchar("fingerprint", { length: 160 }).notNull(),
  rawJson: text("rawJson"),
  status: catalogImportRowsStatus("status").default("pending").notNull(),
  message: text("message"),
  catalogContactId: integer("catalogContactId"),
}, table => ({ batchRowUnique: uniqueIndex("catalogImportRows_batch_row_unique").on(table.batchId, table.rowNumber) }));

export const importRows = pgTable("importRows", {
  id: serial("id").primaryKey(),
  organizationId: integer("organizationId").notNull(),
  batchId: integer("batchId").notNull(),
  rowNumber: integer("rowNumber").notNull(),
  fingerprint: varchar("fingerprint", { length: 160 }).notNull(),
  rawJson: text("rawJson"),
  status: importRowsStatus("status").default("pending").notNull(),
  message: text("message"),
  contactId: integer("contactId"),
}, table => ({ batchRowUnique: uniqueIndex("importRows_batch_row_unique").on(table.batchId, table.rowNumber), fingerprintIdx: index("importRows_fingerprint_idx").on(table.organizationId, table.fingerprint) }));

export const messageTemplates = pgTable("messageTemplates", {
  id: serial("id").primaryKey(),
  organizationId: integer("organizationId").notNull(),
  ownerId: integer("ownerId"),
  name: varchar("name", { length: 140 }).notNull(),
  body: text("body").notNull(),
  categoryName: varchar("categoryName", { length: 120 }),
  purpose: varchar("purpose", { length: 80 }).default("geral").notNull(),
  scope: messageTemplatesScope("scope").default("organization").notNull(),
  isDefault: boolean("isDefault").default(false).notNull(),
  archived: boolean("archived").default(false).notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const activities = pgTable("activities", {
  id: serial("id").primaryKey(),
  organizationId: integer("organizationId").notNull(),
  contactId: integer("contactId"),
  catalogContactId: integer("catalogContactId"),
  userId: integer("userId").notNull(),
  type: varchar("type", { length: 60 }).notNull(),
  description: text("description").notNull(),
  createdAt: createdAt(),
}, table => ({ orgCreatedIdx: index("activities_org_created_idx").on(table.organizationId, table.createdAt) }));

export const tasks = pgTable("tasks", {
  id: serial("id").primaryKey(),
  organizationId: integer("organizationId").notNull(),
  contactId: integer("contactId"),
  catalogContactId: integer("catalogContactId"),
  assignedToId: integer("assignedToId"),
  title: varchar("title", { length: 180 }).notNull(),
  dueAt: timestamp("dueAt", { withTimezone: true, mode: "date" }),
  status: tasksStatus("status").default("pending").notNull(),
  createdAt: createdAt(),
});

export const opportunities = pgTable("opportunities", {
  id: serial("id").primaryKey(),
  organizationId: integer("organizationId").notNull(),
  contactId: integer("contactId").notNull(),
  catalogContactId: integer("catalogContactId"),
  ownerId: integer("ownerId"),
  title: varchar("title", { length: 180 }).notNull(),
  stage: opportunitiesStage("stage").default("new").notNull(),
  valueCents: integer("valueCents"),
  nextContactAt: timestamp("nextContactAt", { withTimezone: true, mode: "date" }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const subscriptions = pgTable("subscriptions", {
  id: serial("id").primaryKey(),
  organizationId: integer("organizationId").notNull(),
  plan: subscriptionsPlan("plan").default("essential").notNull(),
  billingPeriod: subscriptionsBillingPeriod("billingPeriod").default("monthly").notNull(),
  status: subscriptionsStatus("status").default("pending").notNull(),
  catalogAccess: boolean("catalogAccess").default(false).notNull(),
  catalogIncluded: boolean("catalogIncluded").default(false).notNull(),
  trialEndsAt: timestamp("trialEndsAt", { withTimezone: true, mode: "date" }),
  manualCatalogAccessUntil: timestamp("manualCatalogAccessUntil", { withTimezone: true, mode: "date" }),
  cancelAtPeriodEnd: boolean("cancelAtPeriodEnd").default(false).notNull(),
  maxContacts: integer("maxContacts").default(1000).notNull(),
  maxMembers: integer("maxMembers").default(3).notNull(),
  maxImports: integer("maxImports").default(10).notNull(),
  stripeCustomerId: varchar("stripeCustomerId", { length: 120 }),
  stripeSubscriptionId: varchar("stripeSubscriptionId", { length: 120 }),
  currentPeriodEnd: timestamp("currentPeriodEnd", { withTimezone: true, mode: "date" }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const catalogAccessGrants = pgTable("catalogAccessGrants", {
  id: serial("id").primaryKey(),
  organizationId: integer("organizationId").notNull(),
  grantedById: integer("grantedById").notNull(),
  status: catalogAccessGrantsStatus("status").default("active").notNull(),
  validUntil: timestamp("validUntil", { withTimezone: true, mode: "date" }).notNull(),
  reason: varchar("reason", { length: 500 }).notNull(),
  createdAt: createdAt(),
  revokedAt: timestamp("revokedAt", { withTimezone: true, mode: "date" }),
}, table => ({ orgStatusIdx: index("catalogAccessGrants_org_status_idx").on(table.organizationId, table.status) }));

export const catalogAuditLogs = pgTable("catalogAuditLogs", {
  id: serial("id").primaryKey(),
  adminUserId: integer("adminUserId").notNull(),
  catalogContactId: integer("catalogContactId"),
  batchId: integer("batchId"),
  action: varchar("action", { length: 120 }).notNull(),
  metadataJson: text("metadataJson"),
  createdAt: createdAt(),
}, table => ({ createdIdx: index("catalogAuditLogs_created_idx").on(table.createdAt) }));

export const auditLogs = pgTable("auditLogs", {
  id: serial("id").primaryKey(),
  organizationId: integer("organizationId").notNull(),
  userId: integer("userId"),
  action: varchar("action", { length: 120 }).notNull(),
  entityType: varchar("entityType", { length: 80 }).notNull(),
  entityId: integer("entityId"),
  metadataJson: text("metadataJson"),
  createdAt: createdAt(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type Organization = typeof organizations.$inferSelect;
export type Contact = typeof contacts.$inferSelect;
export type ContactPhone = typeof contactPhones.$inferSelect;
export type ImportBatch = typeof importBatches.$inferSelect;
