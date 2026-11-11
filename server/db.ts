import { createHash } from "node:crypto";
import { and, count, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import {
  activities,
  catalogContactPhones,
  catalogContacts,
  catalogImportBatches,
  catalogImportRows,
  catalogLinks,
  categories,
  contactPhones,
  contacts,
  importBatches,
  importRows,
  messageTemplates,
  opportunities,
  organizationMembers,
  organizations,
  subscriptions,
  tags,
  tasks,
  type InsertUser,
  users,
} from "../drizzle/schema";
import { mapRow, type RawRow } from "../shared/importer";
import { ENV } from "./_core/env";
import { createLocalOpenId } from "./_core/session";

let _db: ReturnType<typeof drizzle> | null = null;
let _client: ReturnType<typeof postgres> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _client = postgres(process.env.DATABASE_URL, { max: 10, onnotice: () => {} });
      _db = drizzle(_client);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function getUserById(userId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  return result[0];
}

export async function getUserByEmail(email: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.email, email.trim().toLowerCase())).limit(1);
  return result[0];
}

export async function countAdminUsers() {
  const db = await getDb();
  if (!db) return 0;
  const rows = await db.select({ value: count() }).from(users).where(eq(users.role, "admin"));
  return Number(rows[0]?.value || 0);
}

export async function touchUserLogin(userId: number) {
  const db = await getDb();
  if (!db) return;
  await db.update(users).set({ lastSignedIn: new Date(), updatedAt: new Date() }).where(eq(users.id, userId));
}

/**
 * Cria (ou vincula) um usuario local com login por senha.
 * Convites feitos pelo admin nao possuem senha: o primeiro cadastro com o
 * mesmo e-mail assume a conta, ativa o acesso e libera a organizacao.
 */
export async function createLocalUser(input: { name: string; email: string; passwordHash: string }) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");
  const email = input.email.trim().toLowerCase();
  const existing = await getUserByEmail(email);

  if (existing) {
    if (existing.passwordHash) throw new Error("Já existe uma conta com este e-mail");
    const firstAdmin = existing.role !== "admin" && (await countAdminUsers()) === 0;
    const role = ENV.adminEmails.includes(email) || firstAdmin ? ("admin" as const) : existing.role;
    await db.update(users).set({
      passwordHash: input.passwordHash,
      name: input.name.trim() || existing.name,
      loginMethod: "password",
      role,
      accessStatus: "active",
      lastSignedIn: new Date(),
      updatedAt: new Date(),
    }).where(eq(users.id, existing.id));
    await db.update(organizationMembers).set({ status: "active" }).where(and(eq(organizationMembers.userId, existing.id), eq(organizationMembers.status, "invited")));
    return { userId: existing.id, role } as const;
  }

  const firstAdmin = (await countAdminUsers()) === 0;
  const role = ENV.adminEmails.includes(email) || firstAdmin ? ("admin" as const) : ("user" as const);
  const created = await db.insert(users).values({
    openId: createLocalOpenId(),
    name: input.name.trim(),
    email,
    passwordHash: input.passwordHash,
    loginMethod: "password",
    role,
    accessStatus: "active",
    lastSignedIn: new Date(),
  }).returning({ id: users.id });
  const userId = created[0]?.id;
  if (!userId) throw new Error("Não foi possível criar o usuário");
  return { userId, role } as const;
}

export async function listPlatformUsers() {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");
  const rows = await db.select({ user: users, member: organizationMembers, organization: organizations })
    .from(users)
    .leftJoin(organizationMembers, eq(organizationMembers.userId, users.id))
    .leftJoin(organizations, eq(organizations.id, organizationMembers.organizationId))
    .orderBy(desc(users.createdAt));
  const grouped = new Map<number, { user: typeof rows[number]["user"]; organizations: Array<{ membership: typeof rows[number]["member"]; organization: typeof rows[number]["organization"] }> }>();
  for (const row of rows) {
    const current = grouped.get(row.user.id) || { user: row.user, organizations: [] };
    if (row.member && row.organization) current.organizations.push({ membership: row.member, organization: row.organization });
    grouped.set(row.user.id, current);
  }
  return Array.from(grouped.values());
}

export async function createManualPlatformUser(adminUserId: number, input: { name: string; email: string; organizationId: number; role: "owner" | "admin" | "operator" }) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");
  const email = input.email.trim().toLowerCase();
  const existing = (await db.select().from(users).where(eq(users.email, email)).limit(1))[0];
  if (existing) throw new Error("Já existe um usuário com este e-mail");
  const created = await db.insert(users).values({ openId: `manual:${Date.now()}:${Math.random().toString(36).slice(2)}`.slice(0, 64), name: input.name.trim(), email, loginMethod: "manual", role: "user", accessStatus: "pending" }).returning({ id: users.id });
  const userId = created[0]?.id;
  if (!userId) throw new Error("Não foi possível criar o usuário");
  await db.insert(organizationMembers).values({ organizationId: input.organizationId, userId, role: input.role, status: "invited" });
  return { userId } as const;
}

export async function updatePlatformUser(adminUserId: number, userId: number, input: { accessStatus?: "pending" | "active" | "blocked"; memberId?: number; role?: "owner" | "admin" | "operator"; memberStatus?: "active" | "invited" | "suspended" }) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");
  if (input.accessStatus) await db.update(users).set({ accessStatus: input.accessStatus }).where(eq(users.id, userId));
  if (input.memberId) await db.update(organizationMembers).set({ ...(input.role ? { role: input.role } : {}), ...(input.memberStatus ? { status: input.memberStatus } : {}) }).where(and(eq(organizationMembers.id, input.memberId), eq(organizationMembers.userId, userId)));
  return { success: true } as const;
}

function slugify(value: string) {
  return value.toLocaleLowerCase("pt-BR").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 90) || "organizacao";
}

export async function getOrganizationForUser(userId: number, userName?: string | null) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");
  const existing = await db.select({ organization: organizations, member: organizationMembers })
    .from(organizationMembers)
    .innerJoin(organizations, eq(organizationMembers.organizationId, organizations.id))
    .where(and(eq(organizationMembers.userId, userId), eq(organizationMembers.status, "active")))
    .limit(1);
  if (existing[0]) return existing[0].organization;

  const baseName = userName ? `${userName.split(" ")[0]} Agro` : "Minha organização";
  const slug = `${slugify(baseName)}-${userId}`;
  const created = await db.transaction(async tx => {
    const existingOwner = (await tx.select().from(organizations).where(eq(organizations.ownerId, userId)).limit(1))[0];
    const existingSlug = existingOwner || (await tx.select().from(organizations).where(eq(organizations.slug, slug)).limit(1))[0];
    if (existingSlug) {
      const membership = (await tx.select().from(organizationMembers).where(and(eq(organizationMembers.organizationId, existingSlug.id), eq(organizationMembers.userId, userId))).limit(1))[0];
      if (membership) {
        if (membership.status !== "active" || membership.role !== "owner") await tx.update(organizationMembers).set({ status: "active", role: "owner" }).where(eq(organizationMembers.id, membership.id));
      } else {
        await tx.insert(organizationMembers).values({ organizationId: existingSlug.id, userId, role: "owner", status: "active" });
      }
      return existingSlug.id;
    }
    const orgResult = await tx.insert(organizations).values({ name: baseName, slug, ownerId: userId }).returning({ id: organizations.id });
    const organizationId = orgResult[0]?.id;
    if (!organizationId) throw new Error("Não foi possível criar a organização");
    await tx.insert(organizationMembers).values({ organizationId, userId, role: "owner", status: "active" });
    await tx.insert(categories).values([
      { organizationId, name: "Produtor rural", color: "green" },
      { organizationId, name: "Comprador", color: "gold" },
      { organizationId, name: "Transportadora", color: "blue" },
      { organizationId, name: "Cooperativa", color: "purple" },
    ]);
    await tx.insert(tags).values([
      { organizationId, name: "Novo contato", color: "sage" },
      { organizationId, name: "Revisar telefone", color: "amber" },
    ]);
    await tx.insert(messageTemplates).values({
      organizationId,
      ownerId: userId,
      name: "Primeiro contato",
      body: "Olá, {primeiro_nome}! Aqui é {nome_usuario}, da {nome_organizacao}. Gostaria de conversar sobre oportunidades comerciais na sua região. Podemos falar?",
      purpose: "primeiro contato",
      scope: "organization",
      isDefault: true,
    });
    await tx.insert(subscriptions).values({ organizationId, plan: "essential", billingPeriod: "monthly", status: "pending", maxContacts: 1000, maxMembers: 3, maxImports: 10, catalogIncluded: true });
    return organizationId;
  });
  return (await db.select().from(organizations).where(eq(organizations.id, created)).limit(1))[0];
}

export async function getMember(userId: number, organizationId: number) {
  const db = await getDb();
  if (!db) return undefined;
  return (await db.select().from(organizationMembers).where(and(eq(organizationMembers.userId, userId), eq(organizationMembers.organizationId, organizationId))).limit(1))[0];
}

export async function listContacts(organizationId: number, input: { search?: string; tag?: string; status?: "active" | "inactive" | "archived"; limit: number; offset: number }) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");
  const q = input.search?.trim();
  const filters = [eq(contacts.organizationId, organizationId)];
  if (input.status) filters.push(eq(contacts.status, input.status));
  if (input.tag?.trim()) filters.push(ilike(contacts.tagsJson, `%${input.tag.trim()}%`));
  if (q) {
    const query = `%${q}%`;
    const digits = q.replace(/\D/g, "");
    const phoneContactIds = digits.length >= 4
      ? (await db.select({ contactId: contactPhones.contactId }).from(contactPhones).where(and(eq(contactPhones.organizationId, organizationId), ilike(contactPhones.normalized, `%${digits}%`)))).map(row => row.contactId)
      : [];
    filters.push(or(
      ilike(contacts.name, query),
      ilike(contacts.company, query),
      ilike(contacts.email, query),
      ilike(contacts.city, query),
      ilike(contacts.state, query),
      ilike(contacts.addressOriginal, query),
      ilike(contacts.products, query),
      ilike(contacts.tagsJson, query),
      ilike(contacts.notes, query),
      ...(phoneContactIds.length ? [inArray(contacts.id, phoneContactIds)] : []),
    )!);
  }
  const rows = await db.select().from(contacts).where(and(...filters)).orderBy(desc(contacts.updatedAt)).limit(input.limit).offset(input.offset);
  const ids = rows.map(row => row.id);
  const phones = ids.length ? await db.select().from(contactPhones).where(and(eq(contactPhones.organizationId, organizationId), inArray(contactPhones.contactId, ids))) : [];
  const total = await db.select({ value: count() }).from(contacts).where(and(...filters));
  return { rows: rows.map(row => ({ ...row, phones: phones.filter(phone => phone.contactId === row.id) })), total: Number(total[0]?.value || 0) };
}

export async function getDashboard(organizationId: number) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");
  const [total, withoutPhone, pendingPhones, recentImports, pendingTasks, opportunitiesCount, whatsappOpens, favoriteContacts, privateContacts] = await Promise.all([
    db.select({ value: count() }).from(contacts).where(and(eq(contacts.organizationId, organizationId), eq(contacts.status, "active"))),
    db.select({ value: count() }).from(contacts).leftJoin(contactPhones, eq(contacts.id, contactPhones.contactId)).where(and(eq(contacts.organizationId, organizationId), sql`${contactPhones.id} IS NULL`)),
    db.select({ value: count() }).from(contactPhones).where(and(eq(contactPhones.organizationId, organizationId), eq(contactPhones.validationStatus, "incomplete"))),
    db.select().from(importBatches).where(eq(importBatches.organizationId, organizationId)).orderBy(desc(importBatches.createdAt)).limit(4),
    db.select({ value: count() }).from(tasks).where(and(eq(tasks.organizationId, organizationId), eq(tasks.status, "pending"))),
    db.select({ value: count() }).from(opportunities).where(eq(opportunities.organizationId, organizationId)),
    db.select({ value: count() }).from(activities).where(and(eq(activities.organizationId, organizationId), eq(activities.type, "whatsapp_opened"))),
    db.select({ value: count() }).from(contacts).where(and(eq(contacts.organizationId, organizationId), eq(contacts.favorite, true), eq(contacts.status, "active"))),
    db.select({ value: count() }).from(contacts).where(and(eq(contacts.organizationId, organizationId), eq(contacts.status, "active"))),
  ]);
  const categoriesData = await db.select({ categoriesJson: contacts.categoriesJson }).from(contacts).where(eq(contacts.organizationId, organizationId)).limit(2000);
  const categoryCounts = new Map<string, number>();
  for (const row of categoriesData) {
    try { for (const category of JSON.parse(row.categoriesJson || "[]")) categoryCounts.set(category, (categoryCounts.get(category) || 0) + 1); } catch {}
  }
  return {
    totalContacts: Number(total[0]?.value || 0),
    withoutPhone: Number(withoutPhone[0]?.value || 0),
    pendingPhones: Number(pendingPhones[0]?.value || 0),
    recentImports,
    pendingTasks: Number(pendingTasks[0]?.value || 0),
    opportunities: Number(opportunitiesCount[0]?.value || 0),
    whatsappOpens: Number(whatsappOpens[0]?.value || 0),
    favoriteContacts: Number(favoriteContacts[0]?.value || 0),
    privateContacts: Number(privateContacts[0]?.value || 0),
    categoryCounts: Array.from(categoryCounts.entries()).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, 5),
  };
}

export async function listOrganizationMembers(organizationId: number) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");
  return db.select({ member: organizationMembers, user: users }).from(organizationMembers).innerJoin(users, eq(users.id, organizationMembers.userId)).where(eq(organizationMembers.organizationId, organizationId)).orderBy(organizationMembers.createdAt);
}

export async function updateOrganizationMember(organizationId: number, actorRole: "owner" | "admin" | "operator", memberId: number, input: { role?: "owner" | "admin" | "operator"; status?: "active" | "invited" | "suspended" }) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");
  if (actorRole !== "owner" && actorRole !== "admin") throw new Error("Somente proprietário ou administrador pode gerir a equipe");
  const current = (await db.select().from(organizationMembers).where(and(eq(organizationMembers.organizationId, organizationId), eq(organizationMembers.id, memberId))).limit(1))[0];
  if (!current) throw new Error("Membro não encontrado");
  if (input.role === "owner" && actorRole !== "owner") throw new Error("Somente o proprietário pode transferir a propriedade");
  await db.update(organizationMembers).set(input).where(and(eq(organizationMembers.organizationId, organizationId), eq(organizationMembers.id, memberId)));
  return { success: true } as const;
}

export async function exportOrganizationBackup(organizationId: number) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");
  const organization = (await db.select().from(organizations).where(eq(organizations.id, organizationId)).limit(1))[0];
  const [members, contactRows, phoneRows, templateRows, taskRows] = await Promise.all([
    db.select().from(organizationMembers).where(eq(organizationMembers.organizationId, organizationId)),
    db.select().from(contacts).where(eq(contacts.organizationId, organizationId)),
    db.select().from(contactPhones).where(eq(contactPhones.organizationId, organizationId)),
    db.select().from(messageTemplates).where(eq(messageTemplates.organizationId, organizationId)),
    db.select().from(tasks).where(eq(tasks.organizationId, organizationId)),
  ]);
  return { version: 1, exportedAt: new Date().toISOString(), organization: { id: organization?.id, name: organization?.name, slug: organization?.slug }, members, contacts: contactRows, phones: phoneRows, templates: templateRows, tasks: taskRows };
}

export async function restoreOrganizationBackup(organizationId: number, actorRole: "owner" | "admin" | "operator", backup: unknown) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");
  if (actorRole !== "owner" && actorRole !== "admin") throw new Error("Somente proprietário ou administrador pode restaurar um backup");
  if (!backup || typeof backup !== "object") throw new Error("Backup inválido");
  const data = backup as { version?: number; contacts?: Array<Record<string, unknown>>; phones?: Array<Record<string, unknown>>; templates?: Array<Record<string, unknown>> };
  if (data.version !== 1 || !Array.isArray(data.contacts) || !Array.isArray(data.phones) || !Array.isArray(data.templates)) throw new Error("Formato de backup não suportado");
  const contactsData = data.contacts; const phonesData = data.phones; const templatesData = data.templates;
  let restoredContacts = 0; let restoredTemplates = 0;
  await db.transaction(async tx => {
    const idMap = new Map<number, number>();
    for (const raw of contactsData.slice(0, 50000)) {
      const name = typeof raw.name === "string" ? raw.name.trim() : "";
      if (!name) continue;
      const created = await tx.insert(contacts).values({ organizationId, name, company: typeof raw.company === "string" ? raw.company : null, email: typeof raw.email === "string" ? raw.email : null, city: typeof raw.city === "string" ? raw.city : null, state: typeof raw.state === "string" ? raw.state : null, addressOriginal: typeof raw.addressOriginal === "string" ? raw.addressOriginal : null, products: typeof raw.products === "string" ? raw.products : null, categoriesJson: typeof raw.categoriesJson === "string" ? raw.categoriesJson : "[]", tagsJson: typeof raw.tagsJson === "string" ? raw.tagsJson : "[]", notes: typeof raw.notes === "string" ? raw.notes : null, doNotContact: raw.doNotContact === true, favorite: raw.favorite === true, origin: "backup", status: "active" }).returning({ id: contacts.id });
      const newId = created[0]?.id; if (newId) { const oldId = Number(raw.id); if (oldId) idMap.set(oldId, newId); restoredContacts += 1; }
    }
    for (const raw of phonesData.slice(0, 100000)) { const newContactId = idMap.get(Number(raw.contactId)); if (!newContactId || typeof raw.original !== "string") continue; await tx.insert(contactPhones).values({ organizationId, contactId: newContactId, original: raw.original, normalized: typeof raw.normalized === "string" ? raw.normalized : null, countryCode: typeof raw.countryCode === "string" ? raw.countryCode : null, areaCode: typeof raw.areaCode === "string" ? raw.areaCode : null, validationStatus: ["valid", "incomplete", "review", "invalid"].includes(String(raw.validationStatus)) ? raw.validationStatus as "valid" | "incomplete" | "review" | "invalid" : "review", source: "backup", isWhatsapp: raw.isWhatsapp !== false, isPreferred: raw.isPreferred === true }); }
    for (const raw of templatesData.slice(0, 1000)) { if (typeof raw.name !== "string" || typeof raw.body !== "string") continue; await tx.insert(messageTemplates).values({ organizationId, ownerId: null, name: raw.name.slice(0, 140), body: raw.body, categoryName: typeof raw.categoryName === "string" ? raw.categoryName : null, purpose: typeof raw.purpose === "string" ? raw.purpose : "geral", scope: "organization", isDefault: false, archived: false }); restoredTemplates += 1; }
  });
  return { restoredContacts, restoredTemplates } as const;
}

export async function listTemplates(organizationId: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");
  return db.select().from(messageTemplates).where(and(eq(messageTemplates.organizationId, organizationId), eq(messageTemplates.archived, false), or(eq(messageTemplates.scope, "organization"), and(eq(messageTemplates.scope, "personal"), eq(messageTemplates.ownerId, userId))))).orderBy(desc(messageTemplates.updatedAt));
}

export async function listTasks(organizationId: number, includeCompleted = false) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");
  return db.select().from(tasks).where(includeCompleted ? eq(tasks.organizationId, organizationId) : and(eq(tasks.organizationId, organizationId), eq(tasks.status, "pending"))).orderBy(tasks.dueAt).limit(500);
}

export async function listTaskCandidates(organizationId: number, search?: string, includeCatalog = false) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");
  const q = search?.trim();
  const privateRows = await db.select({ id: contacts.id, name: contacts.name, company: contacts.company }).from(contacts).where(and(eq(contacts.organizationId, organizationId), eq(contacts.status, "active"), q ? or(ilike(contacts.name, `%${q}%`), ilike(contacts.company, `%${q}%`)) : undefined)).orderBy(contacts.name).limit(250);
  const centralRows = includeCatalog ? await db.select({ id: catalogContacts.id, name: catalogContacts.name, company: catalogContacts.company }).from(catalogContacts).where(and(eq(catalogContacts.reviewStatus, "published"), q ? or(ilike(catalogContacts.name, `%${q}%`), ilike(catalogContacts.company, `%${q}%`)) : undefined)).orderBy(catalogContacts.name).limit(250) : [];
  return { private: privateRows, catalog: centralRows };
}

export async function startImport(args: { organizationId: number; userId: number; fileName?: string; sourceType: "xlsx" | "csv" | "pasted" | "vcard"; rows: RawRow[]; mapping: Record<string, string | null>; category: string; countryDialCode: string; defaultAreaCode?: string; usePhonesAsWhatsapp: boolean }) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");
  const subscription = (await db.select().from(subscriptions).where(eq(subscriptions.organizationId, args.organizationId)).limit(1))[0];
  const fingerprints = args.rows.map(row => createHash("sha1").update(JSON.stringify(row)).digest("hex"));
  const alreadyImported = fingerprints.length ? await db.select({ fingerprint: importRows.fingerprint }).from(importRows).where(and(eq(importRows.organizationId, args.organizationId), inArray(importRows.fingerprint, fingerprints))).limit(fingerprints.length) : [];
  if (fingerprints.length > 0 && alreadyImported.length === fingerprints.length) throw new Error("Este lote já foi processado integralmente. Revise o histórico antes de reenviar para evitar duplicidade.");
  const current = await db.select({ value: count() }).from(contacts).where(eq(contacts.organizationId, args.organizationId));
  const currentCount = Number(current[0]?.value || 0);
  const limit = subscription?.maxContacts ?? 1000;
  if (currentCount + args.rows.length > limit) {
    throw new Error(`O lote tem ${args.rows.length.toLocaleString("pt-BR")} linhas, mas o plano permite até ${limit.toLocaleString("pt-BR")} contatos. Ajuste o lote ou o plano antes de importar.`);
  }
  const settings = JSON.stringify({ mapping: args.mapping, category: args.category, countryDialCode: args.countryDialCode, defaultAreaCode: args.defaultAreaCode || null, usePhonesAsWhatsapp: args.usePhonesAsWhatsapp });
  const batch = await db.transaction(async tx => {
    const created = await tx.insert(importBatches).values({ organizationId: args.organizationId, createdById: args.userId, fileName: args.fileName || null, sourceType: args.sourceType, status: "queued", totalRows: args.rows.length, settingsJson: settings }).returning({ id: importBatches.id });
    const batchId = created[0]?.id;
    if (!batchId) throw new Error("Não foi possível criar o lote");
    if (args.rows.length) {
      await tx.insert(importRows).values(args.rows.map((row, index) => ({ organizationId: args.organizationId, batchId, rowNumber: index + 1, fingerprint: createHash("sha1").update(JSON.stringify(row)).digest("hex"), rawJson: JSON.stringify(row), status: "pending" as const })));
    }
    return batchId;
  });
  void processImportBatch(batch).catch(error => console.error("[Import] batch failed", error));
  return { batchId: batch };
}

async function processImportBatch(batchId: number) {
  const db = await getDb();
  if (!db) return;
  const batch = (await db.select().from(importBatches).where(eq(importBatches.id, batchId)).limit(1))[0];
  if (!batch) return;
  await db.update(importBatches).set({ status: "processing" }).where(eq(importBatches.id, batchId));
  const settings = JSON.parse(batch.settingsJson || "{}");
  const rows = await db.select().from(importRows).where(eq(importRows.batchId, batchId)).orderBy(importRows.rowNumber);
  let createdContacts = 0, updatedContacts = 0, ignoredDuplicates = 0, pendingRows = 0, rejectedRows = 0;
  for (const [rowIndex, row] of rows.entries()) {
    try {
      const mapped = mapRow(JSON.parse(row.rawJson || "{}"), settings.mapping || {}, settings);
      if (!mapped.name || mapped.name === "Contato sem nome") {
        rejectedRows += 1;
        await db.update(importRows).set({ status: "rejected", message: "Nome ausente" }).where(eq(importRows.id, row.id));
        continue;
      }
      // Duplicidade: um contato so e criado quando nao existe nenhum registro
      // com o mesmo e-mail OU com um dos telefones normalizados. Sem isso a
      // importacao criava linhas repetidas e o contador "ignorados" mentia.
      const normalizedPhones = mapped.phones
        .map(phone => phone.normalized)
        .filter((value): value is string => Boolean(value));
      const phoneMatches = normalizedPhones.length
        ? await db.select({ contactId: contactPhones.contactId })
            .from(contactPhones)
            .where(and(eq(contactPhones.organizationId, batch.organizationId), inArray(contactPhones.normalized, normalizedPhones)))
            .limit(5)
        : [];
      const phoneContactIds = Array.from(new Set(phoneMatches.map(row => row.contactId)));
      const emailMatches = mapped.email
        ? await db.select({ id: contacts.id })
            .from(contacts)
            .where(and(eq(contacts.organizationId, batch.organizationId), eq(contacts.email, mapped.email)))
            .limit(2)
        : [];

      let contactId: number;
      let rowStatus: "created" | "updated" | "duplicate" | "review";

      if (emailMatches.length > 1) {
        // E-mail repetido em mais de um contato: nao criamos nem alteramos
        // nada para nao escolher o registro errado automaticamente.
        rowStatus = "review";
        rejectedRows += 1;
        await db.update(importRows).set({ status: "review", message: "E-mail repetido em mais de um contato" }).where(eq(importRows.id, row.id));
        continue;
      }

      const targetId = emailMatches.length === 1 ? emailMatches[0].id : phoneContactIds[0];
      if (targetId !== undefined) {
        contactId = targetId;
        const current = (await db.select().from(contacts).where(eq(contacts.id, contactId)).limit(1))[0];
        await db.update(contacts).set({
          name: current?.name || mapped.name,
          company: mapped.company || current?.company || null,
          email: mapped.email || current?.email || null,
          addressOriginal: mapped.addressOriginal || current?.addressOriginal || null,
          city: mapped.city || current?.city || null,
          state: mapped.state || current?.state || null,
          products: mapped.products || current?.products || null,
          notes: mapped.notes || current?.notes || null,
          categoriesJson: JSON.stringify([mapped.category]),
          tagsJson: JSON.stringify(mapped.tags),
          updatedAt: new Date(),
        }).where(eq(contacts.id, contactId));
        for (const phone of mapped.phones) {
          if (!phone.normalized) continue;
          const already = await db.select({ id: contactPhones.id }).from(contactPhones).where(and(eq(contactPhones.organizationId, batch.organizationId), eq(contactPhones.contactId, contactId), eq(contactPhones.normalized, phone.normalized))).limit(1);
          if (!already.length) await db.insert(contactPhones).values({ organizationId: batch.organizationId, contactId, original: phone.original, normalized: phone.normalized, countryCode: phone.countryCode, areaCode: phone.areaCode, validationStatus: phone.validationStatus, source: "import", isWhatsapp: phone.isWhatsapp, isPreferred: phone.isPreferred });
          if (phone.validationStatus === "incomplete" || phone.validationStatus === "review") pendingRows += 1;
        }
        if (phoneContactIds.length) ignoredDuplicates += 1;
        else updatedContacts += 1;
        rowStatus = phoneContactIds.length ? "duplicate" : "updated";
      } else {
        const created = await db.insert(contacts).values({ organizationId: batch.organizationId, name: mapped.name, company: mapped.company, email: mapped.email, addressOriginal: mapped.addressOriginal, city: mapped.city, state: mapped.state, products: mapped.products, notes: mapped.notes, categoriesJson: JSON.stringify([mapped.category]), tagsJson: JSON.stringify(mapped.tags), origin: "import", importBatchId: batchId, responsibleUserId: batch.createdById }).returning({ id: contacts.id });
        contactId = created[0]?.id || 0;
        createdContacts += 1;
        for (const phone of mapped.phones) {
          await db.insert(contactPhones).values({ organizationId: batch.organizationId, contactId, original: phone.original, normalized: phone.normalized, countryCode: phone.countryCode, areaCode: phone.areaCode, validationStatus: phone.validationStatus, source: "import", isWhatsapp: phone.isWhatsapp, isPreferred: phone.isPreferred });
          if (phone.validationStatus === "incomplete" || phone.validationStatus === "review") pendingRows += 1;
        }
        rowStatus = "created";
      }
      const status = mapped.pendingReasons.length ? "review" : rowStatus;
      await db.update(importRows).set({ status, message: mapped.pendingReasons.join(" · ") || null, contactId }).where(eq(importRows.id, row.id));
    } catch (error) {
      rejectedRows += 1;
      await db.update(importRows).set({ status: "rejected", message: error instanceof Error ? error.message : "Erro de processamento" }).where(eq(importRows.id, row.id));
    }
    const processed = rowIndex + 1;
    if (processed % 25 === 0 || processed === rows.length) {
      await db.update(importBatches).set({ processedRows: Math.min(processed, rows.length), createdContacts, updatedContacts, ignoredDuplicates, pendingRows, rejectedRows }).where(eq(importBatches.id, batchId));
    }
  }
  await db.update(importBatches).set({ status: "completed", processedRows: rows.length, createdContacts, updatedContacts, ignoredDuplicates, pendingRows, rejectedRows, completedAt: new Date() }).where(eq(importBatches.id, batchId));
}

export async function getImportBatch(organizationId: number, batchId: number) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");
  return (await db.select().from(importBatches).where(and(eq(importBatches.organizationId, organizationId), eq(importBatches.id, batchId))).limit(1))[0];
}

export async function createActivity(organizationId: number, userId: number, type: string, description: string, contactId?: number, catalogContactId?: number) {
  const db = await getDb();
  if (!db) return;
  if (!contactId && !catalogContactId) throw new Error("A atividade precisa estar vinculada a um contato");
  if (contactId) {
    const owned = await db.select({ id: contacts.id }).from(contacts).where(and(eq(contacts.id, contactId), eq(contacts.organizationId, organizationId))).limit(1);
    if (!owned.length) throw new Error("Contato particular fora da organização");
    const blocked = await db.select({ doNotContact: contacts.doNotContact }).from(contacts).where(eq(contacts.id, contactId)).limit(1);
    if (type === "whatsapp_opened" && blocked[0]?.doNotContact) throw new Error("Este contato está marcado como não contatar");
  }
  if (catalogContactId) {
    const exists = await db.select({ id: catalogContacts.id }).from(catalogContacts).where(eq(catalogContacts.id, catalogContactId)).limit(1);
    if (!exists.length) throw new Error("Contato central não encontrado");
  }
  await db.insert(activities).values({ organizationId, userId, type, description, contactId: contactId || null, catalogContactId: catalogContactId || null });
}

export async function createTemplate(organizationId: number, ownerId: number, input: { name: string; body: string; categoryName?: string; purpose?: string; scope?: "organization" | "personal" }) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");
  const result = await db.insert(messageTemplates).values({ organizationId, ownerId, name: input.name, body: input.body, categoryName: input.categoryName || null, purpose: input.purpose || "geral", scope: input.scope || "organization" }).returning({ id: messageTemplates.id });
  return result[0]?.id;
}
