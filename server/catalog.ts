import { createHash } from "node:crypto";
import { and, count, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import {
  catalogAccessGrants,
  catalogAuditLogs,
  catalogContactPhones,
  catalogContacts,
  catalogImportBatches,
  catalogImportRows,
  catalogLinks,
  organizations,
  subscriptions,
} from "../drizzle/schema";
import { mapRow, normalizePhone, type PhoneCandidate, type RawRow } from "../shared/importer";
import { accumulatePublicationTotals } from "../shared/operations";
import { getDb } from "./db";

type CatalogFilters = { search?: string; state?: string; city?: string; category?: string; product?: string; favoritesOnly?: boolean; limit: number; offset: number };

function safeList(value: string | null | undefined): string[] { try { return JSON.parse(value || "[]"); } catch { return []; } }
function chunks<T>(items: T[], size: number) { const result: T[][] = []; for (let i = 0; i < items.length; i += size) result.push(items.slice(i, i + size)); return result; }

export async function organizationHasCatalogAccess(organizationId: number) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");
  const now = new Date();
  const subscription = (await db.select({ plan: subscriptions.plan, status: subscriptions.status, catalogIncluded: subscriptions.catalogIncluded, catalogAccess: subscriptions.catalogAccess, manualCatalogAccessUntil: subscriptions.manualCatalogAccessUntil, currentPeriodEnd: subscriptions.currentPeriodEnd, trialEndsAt: subscriptions.trialEndsAt })
    .from(subscriptions).where(eq(subscriptions.organizationId, organizationId)).limit(1))[0];
  const planIncludesCatalog = Boolean(subscription && (subscription.plan === "essential" || subscription.catalogIncluded));
  const paidValidity = Boolean(subscription?.currentPeriodEnd && subscription.currentPeriodEnd > now);
  const subscriptionAuthorized = Boolean(subscription && (subscription.status === "active" || subscription.status === "cancelled") && paidValidity);
  const trialAuthorized = Boolean(subscription?.status === "trial" && subscription.trialEndsAt && subscription.trialEndsAt > now);
  const manualGrant = (await db.select({ id: catalogAccessGrants.id }).from(catalogAccessGrants).where(and(eq(catalogAccessGrants.organizationId, organizationId), eq(catalogAccessGrants.status, "active"), sql`${catalogAccessGrants.validUntil} > ${now}`)).limit(1)).length > 0;
  const legacyManualGrant = Boolean(subscription?.manualCatalogAccessUntil && subscription.manualCatalogAccessUntil > now && subscription.status === "active" && subscription.catalogAccess);
  return manualGrant || legacyManualGrant || (planIncludesCatalog && (subscriptionAuthorized || trialAuthorized));
}

export async function listCatalogContacts(organizationId: number, input: CatalogFilters) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");
  if (!(await organizationHasCatalogAccess(organizationId))) return { access: false as const, rows: [], total: 0, categories: [], states: [] };
  const filters = [eq(catalogContacts.reviewStatus, "published" as const)];
  const q = input.search?.trim();
  if (input.state) filters.push(eq(catalogContacts.state, input.state.toUpperCase()));
  if (input.city) filters.push(ilike(catalogContacts.city, `%${input.city.trim()}%`));
  if (input.category) filters.push(ilike(catalogContacts.categoriesJson, `%${input.category}%`));
  if (input.product) filters.push(ilike(catalogContacts.products, `%${input.product.trim()}%`));
  if (input.favoritesOnly) filters.push(sql`EXISTS (SELECT 1 FROM catalogLinks cl WHERE cl.organizationId = ${organizationId} AND cl.catalogContactId = ${catalogContacts.id} AND cl.favorite = true)`);
  if (q) {
    const query = `%${q}%`;
    const digits = q.replace(/\D/g, "");
    const phoneIds = digits.length >= 4 ? (await db.select({ catalogContactId: catalogContactPhones.catalogContactId }).from(catalogContactPhones).where(ilike(catalogContactPhones.normalized, `%${digits}%`))).map(row => row.catalogContactId) : [];
    filters.push(or(ilike(catalogContacts.name, query), ilike(catalogContacts.company, query), ilike(catalogContacts.email, query), ilike(catalogContacts.city, query), ilike(catalogContacts.state, query), ilike(catalogContacts.addressOriginal, query), ilike(catalogContacts.products, query), ilike(catalogContacts.categoriesJson, query), ...(phoneIds.length ? [inArray(catalogContacts.id, phoneIds)] : []))!);
  }
  const [rows, total] = await Promise.all([
    db.select().from(catalogContacts).where(and(...filters)).orderBy(desc(catalogContacts.updatedAt)).limit(input.limit).offset(input.offset),
    db.select({ value: count() }).from(catalogContacts).where(and(...filters)),
  ]);
  const ids = rows.map(row => row.id);
  const [phones, links] = ids.length ? await Promise.all([
    db.select().from(catalogContactPhones).where(inArray(catalogContactPhones.catalogContactId, ids)),
    db.select().from(catalogLinks).where(and(eq(catalogLinks.organizationId, organizationId), inArray(catalogLinks.catalogContactId, ids))),
  ]) : [[], []];
  return { access: true as const, rows: rows.map(row => ({ ...row, categories: safeList(row.categoriesJson), tags: safeList(row.tagsJson), phones: phones.filter(phone => phone.catalogContactId === row.id), private: links.find(link => link.catalogContactId === row.id) || null })), total: Number(total[0]?.value || 0), categories: [], states: [] };
}

export async function getCatalogSummary(organizationId: number) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");
  if (!(await organizationHasCatalogAccess(organizationId))) return { access: false as const, total: 0, categories: [], states: [] };
  const published = eq(catalogContacts.reviewStatus, "published" as const);
  const [total, categoryRows, stateRows] = await Promise.all([
    db.select({ value: count() }).from(catalogContacts).where(published),
    db.select({ categoriesJson: catalogContacts.categoriesJson }).from(catalogContacts).where(published),
    db.select({ state: catalogContacts.state }).from(catalogContacts).where(published).groupBy(catalogContacts.state).orderBy(desc(sql`count(*)`)),
  ]);
  const counts = new Map<string, number>();
  for (const row of categoryRows) for (const category of safeList(row.categoriesJson)) counts.set(category, (counts.get(category) || 0) + 1);
  return { access: true as const, total: Number(total[0]?.value || 0), categories: Array.from(counts, ([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value), states: stateRows.filter(row => row.state).map(row => row.state as string) };
}

export async function toggleCatalogFavorite(organizationId: number, catalogContactId: number, favorite: boolean, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");
  if (!(await organizationHasCatalogAccess(organizationId))) throw new Error("Seu acesso à Base AGROLINK está vencido ou não foi liberado");
  await db.insert(catalogLinks).values({ organizationId, catalogContactId, favorite, responsibleUserId: userId }).onConflictDoUpdate({ target: [catalogLinks.organizationId, catalogLinks.catalogContactId], set: { favorite, updatedAt: new Date() } });
  return { success: true } as const;
}

export async function saveCatalogNote(organizationId: number, catalogContactId: number, notes: string | null, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");
  if (!(await organizationHasCatalogAccess(organizationId))) throw new Error("Seu acesso à Base AGROLINK está vencido ou não foi liberado");
  await db.insert(catalogLinks).values({ organizationId, catalogContactId, notes, responsibleUserId: userId }).onConflictDoUpdate({ target: [catalogLinks.organizationId, catalogLinks.catalogContactId], set: { notes, updatedAt: new Date() } });
  return { success: true } as const;
}

export async function startCatalogImport(args: { userId: number; fileName?: string; sourceType: "xlsx" | "csv"; rows: RawRow[]; mapping: Record<string, string | null>; category: string; defaultAreaCode?: string }) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");
  const batch = await db.transaction(async tx => {
    const created = await tx.insert(catalogImportBatches).values({ createdById: args.userId, fileName: args.fileName || null, sourceType: args.sourceType, status: "processing", totalRows: args.rows.length, settingsJson: JSON.stringify({ mapping: args.mapping, category: args.category, defaultAreaCode: args.defaultAreaCode || null }) }).returning({ id: catalogImportBatches.id });
    const batchId = created[0]?.id;
    if (!batchId) throw new Error("Não foi possível criar o lote central");
    for (let offset = 0; offset < args.rows.length; offset += 500) { const part = args.rows.slice(offset, offset + 500); await tx.insert(catalogImportRows).values(part.map((row, index) => ({ batchId, rowNumber: offset + index + 1, fingerprint: createHash("sha1").update(JSON.stringify(row)).digest("hex"), rawJson: JSON.stringify(row), status: "pending" as const }))); }
    return batchId;
  });
  void processCatalogImport(batch, args).catch(error => console.error("[CatalogImport] failed", error));
  return { batchId: batch };
}

async function processCatalogImport(batchId: number, args: { userId: number; fileName?: string; sourceType: "xlsx" | "csv"; mapping: Record<string, string | null>; category: string; defaultAreaCode?: string }) {
  const db = await getDb();
  if (!db) return;
  const rows = await db.select().from(catalogImportRows).where(eq(catalogImportRows.batchId, batchId)).orderBy(catalogImportRows.rowNumber);
  let createdContacts = 0, duplicateRows = 0, reviewRows = 0, rejectedRows = 0;
  for (const [rowIndex, row] of rows.entries()) {
    try {
      const mapped = mapRow(JSON.parse(row.rawJson || "{}"), args.mapping, { category: args.category, defaultAreaCode: args.defaultAreaCode, usePhonesAsWhatsapp: true });
      if (!mapped.name || mapped.name === "Contato sem nome") throw new Error("Nome ausente");
      const normalizedNumbers = mapped.phones.map(phone => phone.normalized).filter(Boolean) as string[];
      const existing = normalizedNumbers.length ? await db.select({ id: catalogContactPhones.catalogContactId }).from(catalogContactPhones).where(inArray(catalogContactPhones.normalized, normalizedNumbers)).limit(3) : [];
      if (existing.length) {
        duplicateRows += 1;
        await db.update(catalogImportRows).set({ status: "duplicate", message: "Telefone normalizado já existe no catálogo" }).where(eq(catalogImportRows.id, row.id));
        continue;
      }
      const inserted = await db.insert(catalogContacts).values({ name: mapped.name, company: mapped.company, email: mapped.email, addressOriginal: mapped.addressOriginal, city: mapped.city, state: mapped.state, products: mapped.products, categoriesJson: JSON.stringify([mapped.category]), tagsJson: JSON.stringify(mapped.tags), origin: args.fileName || "importação administrativa", sourceFile: args.fileName || null, sourceRowNumber: row.rowNumber, rawJson: row.rawJson, reviewStatus: "pending" }).returning({ id: catalogContacts.id });
      const catalogContactId = inserted[0]?.id;
      if (!catalogContactId) throw new Error("Contato central não criado");
      if (mapped.phones.length) await db.insert(catalogContactPhones).values(mapped.phones.map(phone => ({ catalogContactId, original: phone.original, normalized: phone.normalized, countryCode: phone.countryCode, areaCode: phone.areaCode, validationStatus: phone.validationStatus, isWhatsapp: phone.isWhatsapp, isPreferred: phone.isPreferred })));
      createdContacts += 1;
      if (mapped.pendingReasons.length) reviewRows += 1;
      await db.update(catalogImportRows).set({ status: mapped.pendingReasons.length ? "review" : "created", message: mapped.pendingReasons.join(" · ") || null, catalogContactId }).where(eq(catalogImportRows.id, row.id));
    } catch (error) {
      rejectedRows += 1;
      await db.update(catalogImportRows).set({ status: "rejected", message: error instanceof Error ? error.message : "Erro de processamento" }).where(eq(catalogImportRows.id, row.id));
    }
    const processed = rowIndex + 1;
    if (processed % 25 === 0 || processed === rows.length) await db.update(catalogImportBatches).set({ processedRows: processed, createdContacts, duplicateRows, reviewRows, rejectedRows }).where(eq(catalogImportBatches.id, batchId));
  }
  await db.update(catalogImportBatches).set({ status: "completed", processedRows: rows.length, createdContacts, duplicateRows, reviewRows, rejectedRows, completedAt: new Date() }).where(eq(catalogImportBatches.id, batchId));
}

export async function listCatalogImports() {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");
  return db.select().from(catalogImportBatches).orderBy(desc(catalogImportBatches.createdAt)).limit(20);
}

export async function createManualCatalogContact(adminUserId: number, input: { name: string; company?: string | null; email?: string | null; city?: string | null; state?: string | null; products?: string | null; categories?: string[]; tags?: string[]; addressOriginal?: string | null; phones?: Array<{ original: string; isWhatsapp?: boolean; isPreferred?: boolean }> }) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");
  const created = await db.transaction(async tx => {
    const ids = await tx.insert(catalogContacts).values({ name: input.name.trim(), company: input.company || null, email: input.email || null, city: input.city || null, state: input.state?.toUpperCase() || null, products: input.products || null, categoriesJson: JSON.stringify(input.categories || []), tagsJson: JSON.stringify(input.tags || []), addressOriginal: input.addressOriginal || null, origin: "cadastro administrativo", reviewStatus: "pending" }).returning({ id: catalogContacts.id });
    const id = ids[0]?.id;
    if (!id) throw new Error("Não foi possível criar o contato central");
    const phones = (input.phones || []).map(item => ({ ...normalizePhone(item.original), isWhatsapp: item.isWhatsapp ?? true, isPreferred: Boolean(item.isPreferred) })).filter(item => item.validationStatus !== "invalid");
    if (phones.length && !phones.some(item => item.isPreferred)) phones[0].isPreferred = true;
    if (phones.length) await tx.insert(catalogContactPhones).values(phones.map(phone => ({ catalogContactId: id, original: phone.original, normalized: phone.normalized, countryCode: phone.countryCode, areaCode: phone.areaCode, validationStatus: phone.validationStatus, isWhatsapp: phone.isWhatsapp, isPreferred: phone.isPreferred, source: "admin" })));
    return id;
  });
  await audit(adminUserId, "catalog_contact_created", created);
  return { id: created } as const;
}

export async function listAdminCatalogContacts(input: { status?: "pending" | "reviewed" | "published" | "inactive"; limit: number; offset: number }) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");
  const filter = input.status ? eq(catalogContacts.reviewStatus, input.status) : undefined;
  const rows = await db.select().from(catalogContacts).where(filter).orderBy(desc(catalogContacts.updatedAt)).limit(input.limit).offset(input.offset);
  const total = await db.select({ value: count() }).from(catalogContacts).where(filter);
  const ids = rows.map(row => row.id);
  const phones = ids.length ? await db.select().from(catalogContactPhones).where(inArray(catalogContactPhones.catalogContactId, ids)) : [];
  return { rows: rows.map(row => ({ ...row, phones: phones.filter(phone => phone.catalogContactId === row.id), categories: safeList(row.categoriesJson), tags: safeList(row.tagsJson) })), total: Number(total[0]?.value || 0) };
}

async function audit(adminUserId: number, action: string, catalogContactId?: number, batchId?: number, metadata?: unknown) {
  const db = await getDb();
  if (!db) return;
  await db.insert(catalogAuditLogs).values({ adminUserId, action, catalogContactId: catalogContactId || null, batchId: batchId || null, metadataJson: metadata ? JSON.stringify(metadata) : null });
}

export async function updateCatalogContact(adminUserId: number, catalogContactId: number, input: { name?: string; company?: string | null; email?: string | null; city?: string | null; state?: string | null; products?: string | null; categories?: string[]; tags?: string[]; addressOriginal?: string | null; phones?: Array<{ original: string; isWhatsapp?: boolean; isPreferred?: boolean }> }) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");
  return db.transaction(async tx => {
    const current = (await tx.select().from(catalogContacts).where(eq(catalogContacts.id, catalogContactId)).limit(1))[0];
    if (!current) throw new Error("Registro central não encontrado");
    const needsReview = input.name !== undefined || input.city !== undefined || input.state !== undefined || input.products !== undefined || input.categories !== undefined || input.addressOriginal !== undefined || input.phones !== undefined;
    await tx.update(catalogContacts).set({ ...(input.name !== undefined ? { name: input.name } : {}), ...(input.company !== undefined ? { company: input.company } : {}), ...(input.email !== undefined ? { email: input.email } : {}), ...(input.city !== undefined ? { city: input.city } : {}), ...(input.state !== undefined ? { state: input.state?.toUpperCase() || null } : {}), ...(input.products !== undefined ? { products: input.products } : {}), ...(input.categories !== undefined ? { categoriesJson: JSON.stringify(input.categories) } : {}), ...(input.tags !== undefined ? { tagsJson: JSON.stringify(input.tags) } : {}), ...(input.addressOriginal !== undefined ? { addressOriginal: input.addressOriginal } : {}), ...(needsReview ? { reviewStatus: "pending", reviewedAt: null, reviewedById: null } : {}), updatedAt: new Date() }).where(eq(catalogContacts.id, catalogContactId));
    if (needsReview) await tx.update(catalogImportRows).set({ status: "review", message: "Registro alterado; requer nova revisão" }).where(eq(catalogImportRows.catalogContactId, catalogContactId));
    if (input.phones !== undefined) {
      await tx.delete(catalogContactPhones).where(eq(catalogContactPhones.catalogContactId, catalogContactId));
      const unique = new Map<string, PhoneCandidate>();
      for (const item of input.phones) {
        const candidate = normalizePhone(item.original);
        if (candidate.validationStatus !== "invalid") unique.set(candidate.normalized || candidate.original, { ...candidate, isWhatsapp: item.isWhatsapp ?? true, isPreferred: Boolean(item.isPreferred), source: "admin" });
      }
      const prepared = Array.from(unique.values());
      if (prepared.length && !prepared.some(phone => phone.isPreferred)) prepared[0].isPreferred = true;
      if (prepared.length) await tx.insert(catalogContactPhones).values(prepared.map(phone => ({ catalogContactId, original: phone.original, normalized: phone.normalized, countryCode: phone.countryCode, areaCode: phone.areaCode, validationStatus: phone.validationStatus, isWhatsapp: phone.isWhatsapp, isPreferred: phone.isPreferred, source: "admin" })));
    }
    await tx.insert(catalogAuditLogs).values({ adminUserId, catalogContactId, action: "catalog_contact_updated", metadataJson: JSON.stringify(input) });
    return { success: true } as const;
  });
}

export async function approveCatalogContacts(adminUserId: number, catalogContactIds: number[]) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");
  let approved = 0; const blocked: Array<{ id: number; reason: string }> = [];
  for (const id of catalogContactIds) {
    const contact = (await db.select().from(catalogContacts).where(eq(catalogContacts.id, id)).limit(1))[0];
    const phones = await db.select().from(catalogContactPhones).where(eq(catalogContactPhones.catalogContactId, id));
    const invalid = phones.some(phone => phone.validationStatus !== "valid");
    if (!contact || !contact.name || !phones.length || invalid) { blocked.push({ id, reason: !phones.length ? "Sem telefone" : "Telefone pendente de correção" }); continue; }
    await db.update(catalogContacts).set({ reviewStatus: "reviewed", reviewedAt: new Date(), reviewedById: adminUserId, updatedAt: new Date() }).where(eq(catalogContacts.id, id));
    await db.update(catalogImportRows).set({ status: "approved", message: "Aprovado administrativamente" }).where(eq(catalogImportRows.catalogContactId, id));
    await audit(adminUserId, "catalog_contact_approved", id);
    approved += 1;
  }
  return { approved, blocked };
}

export async function setCatalogContactStatus(adminUserId: number, catalogContactId: number, status: "pending" | "reviewed" | "published" | "inactive") {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");
  const current = (await db.select().from(catalogContacts).where(eq(catalogContacts.id, catalogContactId)).limit(1))[0];
  if (!current) throw new Error("Registro central não encontrado");
  if (status === "published" && current.reviewStatus !== "reviewed") throw new Error("Publique somente registros aprovados; a aprovação precisa ser explícita");
  if (status === "reviewed") {
    const validPhones = await db.select({ id: catalogContactPhones.id }).from(catalogContactPhones).where(and(eq(catalogContactPhones.catalogContactId, catalogContactId), eq(catalogContactPhones.validationStatus, "valid"))).limit(1);
    if (!validPhones.length) throw new Error("O registro precisa de ao menos um telefone válido antes da aprovação");
  }
  await db.update(catalogContacts).set({ reviewStatus: status, updatedAt: new Date() }).where(eq(catalogContacts.id, catalogContactId));
  await audit(adminUserId, `catalog_contact_${status}`, catalogContactId);
  return { success: true } as const;
}

export async function publishCatalogContacts(adminUserId: number, catalogContactIds: number[]) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");
  const reviewed = await db.select({ id: catalogContacts.id }).from(catalogContacts).where(and(inArray(catalogContacts.id, catalogContactIds), eq(catalogContacts.reviewStatus, "reviewed")));
  const ids = reviewed.map(row => row.id);
  if (ids.length) await db.update(catalogContacts).set({ reviewStatus: "published", reviewedAt: new Date(), reviewedById: adminUserId, updatedAt: new Date() }).where(and(inArray(catalogContacts.id, ids), eq(catalogContacts.reviewStatus, "reviewed")));
  for (const id of ids) await audit(adminUserId, "catalog_contact_published", id);
  return { published: ids.length, skipped: catalogContactIds.length - ids.length } as const;
}

export async function publishCatalogBatch(batchId: number, reviewedById: number) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");
  const batch = (await db.select().from(catalogImportBatches).where(eq(catalogImportBatches.id, batchId)).limit(1))[0];
  if (!batch) throw new Error("Lote central não encontrado");
  if (batch.status !== "completed") throw new Error("O lote ainda não terminou ou falhou; publicação bloqueada.");
  const approvedRows = await db.select({ rowId: catalogImportRows.id, contactId: catalogImportRows.catalogContactId }).from(catalogImportRows).innerJoin(catalogContacts, eq(catalogContacts.id, catalogImportRows.catalogContactId)).where(and(eq(catalogImportRows.batchId, batchId), eq(catalogImportRows.status, "approved"), eq(catalogContacts.reviewStatus, "reviewed"), sql`${catalogImportRows.catalogContactId} IS NOT NULL`));
  const ids = approvedRows.map(row => row.contactId).filter((id): id is number => Boolean(id));
  if (ids.length) await db.update(catalogContacts).set({ reviewStatus: "published", reviewedAt: new Date(), reviewedById, updatedAt: new Date() }).where(and(inArray(catalogContacts.id, ids), eq(catalogContacts.reviewStatus, "reviewed")));
  if (approvedRows.length) await db.update(catalogImportRows).set({ message: "Publicado após aprovação atual" }).where(inArray(catalogImportRows.id, approvedRows.map(row => row.rowId)));
  const totals = accumulatePublicationTotals(batch, ids.length);
  const publishedTotal = totals.publishedRows;
  const approvedTotal = totals.approvedRows;
  await db.update(catalogImportBatches).set({ approvedRows: approvedTotal, publishedRows: publishedTotal, publishedAt: ids.length ? new Date() : batch.publishedAt, publishedById: ids.length ? reviewedById : batch.publishedById }).where(eq(catalogImportBatches.id, batchId));
  await audit(reviewedById, "catalog_batch_published", undefined, batchId, { published: ids.length, publishedTotal, pending: Math.max(0, batch.totalRows - publishedTotal) });
  return { published: ids.length, publishedTotal, pending: Math.max(0, batch.totalRows - publishedTotal) };
}

export async function listCatalogAudit(limit = 100) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");
  return db.select().from(catalogAuditLogs).orderBy(desc(catalogAuditLogs.createdAt)).limit(limit);
}

export async function listCatalogAccessOrganizations() {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");
  const rows = await db.select({ organization: organizations, subscription: subscriptions }).from(organizations).leftJoin(subscriptions, eq(subscriptions.organizationId, organizations.id)).orderBy(desc(organizations.createdAt));
  const grants = await db.select().from(catalogAccessGrants).where(eq(catalogAccessGrants.status, "active"));
  return rows.map(row => ({ ...row, grant: grants.find(grant => grant.organizationId === row.organization.id) || null }));
}

export async function updateOrganizationSubscription(adminUserId: number, organizationId: number, input: { plan?: "essential" | "professional" | "enterprise"; status?: "trial" | "active" | "past_due" | "cancelled" | "pending"; catalogIncluded?: boolean; maxContacts?: number; maxMembers?: number; maxImports?: number }) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");
  const current = (await db.select({ id: subscriptions.id }).from(subscriptions).where(eq(subscriptions.organizationId, organizationId)).limit(1))[0];
  if (!current) throw new Error("Assinatura da organização não encontrada");
  await db.update(subscriptions).set({ ...input, updatedAt: new Date() }).where(eq(subscriptions.id, current.id));
  await audit(adminUserId, "subscription_updated", undefined, undefined, { organizationId, ...input });
  return { success: true } as const;
}

export async function setCatalogAccess(adminUserId: number, organizationId: number, action: "grant" | "revoke", validUntil?: Date, reason?: string) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");
  if (action === "grant") {
    if (!validUntil || validUntil <= new Date()) throw new Error("A liberação manual precisa de uma validade futura");
    await db.insert(catalogAccessGrants).values({ organizationId, grantedById: adminUserId, validUntil, reason: reason?.trim() || "Liberação manual auditada" });
    await audit(adminUserId, "catalog_access_granted", undefined, undefined, { organizationId, validUntil, reason });
  } else {
    await db.update(catalogAccessGrants).set({ status: "revoked", revokedAt: new Date() }).where(and(eq(catalogAccessGrants.organizationId, organizationId), eq(catalogAccessGrants.status, "active")));
    await audit(adminUserId, "catalog_access_revoked", undefined, undefined, { organizationId, reason });
  }
  return { success: true } as const;
}
