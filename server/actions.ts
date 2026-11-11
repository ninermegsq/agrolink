import { and, desc, eq, inArray } from "drizzle-orm";
import {
  auditLogs,
  contactPhones,
  contacts,
  catalogContacts,
  messageTemplates,
  organizations,
  tasks,
  type ContactPhone,
} from "../drizzle/schema";
import { resolveTaskLink } from "../shared/operations";
import { getDb } from "./db";
import { normalizePhone } from "../shared/importer";

type PhoneInput = {
  original: string;
  isWhatsapp?: boolean;
  isPreferred?: boolean;
  defaultAreaCode?: string;
};

type MemberRole = "owner" | "admin" | "operator";

function preparePhones(phones: PhoneInput[] | undefined, source: string) {
  if (!phones) return undefined;
  const unique = new Map<string, ReturnType<typeof normalizePhone>>();
  for (const input of phones) {
    const candidate = normalizePhone(input.original, { countryDialCode: "55", defaultAreaCode: input.defaultAreaCode });
    if (!candidate.original || candidate.validationStatus === "invalid") continue;
    const key = candidate.normalized || candidate.original;
    if (!unique.has(key)) {
      unique.set(key, {
        ...candidate,
        source,
        isWhatsapp: input.isWhatsapp ?? true,
        isPreferred: Boolean(input.isPreferred),
      });
    }
  }
  const result = Array.from(unique.values());
  if (result.length && !result.some(phone => phone.isPreferred)) result[0].isPreferred = true;
  return result;
}

async function replacePhones(tx: any, organizationId: number, contactId: number, phones: PhoneInput[] | undefined, source: string) {
  if (phones === undefined) return;
  await tx.delete(contactPhones).where(and(eq(contactPhones.organizationId, organizationId), eq(contactPhones.contactId, contactId)));
  const prepared = preparePhones(phones, source);
  if (prepared?.length) {
    await tx.insert(contactPhones).values(prepared.map(phone => ({
      organizationId,
      contactId,
      original: phone.original,
      normalized: phone.normalized,
      countryCode: phone.countryCode,
      areaCode: phone.areaCode,
      validationStatus: phone.validationStatus,
      source: phone.source,
      isWhatsapp: phone.isWhatsapp,
      isPreferred: phone.isPreferred,
    })));
  }
}

export async function createPrivateContact(organizationId: number, input: { name: string; company?: string; email?: string; city?: string; state?: string; addressOriginal?: string; categories?: string[]; tags?: string[]; notes?: string; doNotContact?: boolean; phones?: PhoneInput[]; }) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");
  return db.transaction(async tx => {
    const created = await tx.insert(contacts).values({
      organizationId,
      name: input.name.trim(),
      company: input.company || null,
      email: input.email || null,
      city: input.city || null,
      state: input.state?.toUpperCase() || null,
      addressOriginal: input.addressOriginal || null,
      categoriesJson: JSON.stringify(input.categories || []),
      tagsJson: JSON.stringify(input.tags || []),
      notes: input.notes || null,
      doNotContact: input.doNotContact ?? false,
      origin: "manual",
    }).returning({ id: contacts.id });
    const contactId = created[0]?.id;
    if (!contactId) throw new Error("Não foi possível criar o contato");
    await replacePhones(tx, organizationId, contactId, input.phones || [], "manual");
    return contactId;
  });
}

export async function updatePrivateContact(organizationId: number, contactId: number, input: { name?: string; company?: string | null; email?: string | null; city?: string | null; state?: string | null; addressOriginal?: string | null; categories?: string[]; tags?: string[]; notes?: string | null; doNotContact?: boolean; favorite?: boolean; status?: "active" | "inactive" | "archived"; phones?: PhoneInput[]; }) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");
  return db.transaction(async tx => {
    const current = await tx.select({ id: contacts.id }).from(contacts).where(and(eq(contacts.organizationId, organizationId), eq(contacts.id, contactId))).limit(1);
    if (!current.length) throw new Error("Contato particular não encontrado");
    await tx.update(contacts).set({
      ...(input.name !== undefined ? { name: input.name.trim() } : {}),
      ...(input.company !== undefined ? { company: input.company } : {}),
      ...(input.email !== undefined ? { email: input.email } : {}),
      ...(input.city !== undefined ? { city: input.city } : {}),
      ...(input.state !== undefined ? { state: input.state?.toUpperCase() || null } : {}),
      ...(input.addressOriginal !== undefined ? { addressOriginal: input.addressOriginal } : {}),
      ...(input.categories !== undefined ? { categoriesJson: JSON.stringify(input.categories) } : {}),
      ...(input.tags !== undefined ? { tagsJson: JSON.stringify(input.tags) } : {}),
      ...(input.notes !== undefined ? { notes: input.notes } : {}),
      ...(input.doNotContact !== undefined ? { doNotContact: input.doNotContact } : {}),
      ...(input.favorite !== undefined ? { favorite: input.favorite } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
      updatedAt: new Date(),
    }).where(and(eq(contacts.organizationId, organizationId), eq(contacts.id, contactId)));
    await replacePhones(tx, organizationId, contactId, input.phones, "manual");
    return { success: true } as const;
  });
}

export async function exportPrivateContacts(organizationId: number) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");
  const rows = await db.select().from(contacts).where(eq(contacts.organizationId, organizationId)).orderBy(desc(contacts.updatedAt));
  const ids = rows.map(row => row.id);
  const phones = ids.length ? await db.select().from(contactPhones).where(and(eq(contactPhones.organizationId, organizationId), inArray(contactPhones.contactId, ids))) : [];
  return rows.map(row => ({ ...row, phones: phones.filter(phone => phone.contactId === row.id) }));
}

export async function listFavoriteContacts(organizationId: number) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");
  return db.select().from(contacts).where(and(eq(contacts.organizationId, organizationId), eq(contacts.favorite, true))).orderBy(desc(contacts.updatedAt));
}

export async function createTask(organizationId: number, userId: number, input: { title: string; dueAt?: Date | null; contactId?: number | null; catalogContactId?: number | null }) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");
  const created = await db.insert(tasks).values({ organizationId, assignedToId: userId, title: input.title.trim(), dueAt: input.dueAt || null, contactId: input.contactId || null, catalogContactId: input.catalogContactId || null }).returning({ id: tasks.id });
  return created[0]?.id;
}

export async function completeTask(organizationId: number, taskId: number, status: "done" | "cancelled" = "done") {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");
  await db.update(tasks).set({ status }).where(and(eq(tasks.organizationId, organizationId), eq(tasks.id, taskId)));
  return { success: true } as const;
}

export async function updateTask(organizationId: number, taskId: number, input: { title?: string; dueAt?: Date | null; contactId?: number | null; catalogContactId?: number | null; status?: "pending" | "done" | "cancelled" }) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");
  const current = (await db.select().from(tasks).where(and(eq(tasks.organizationId, organizationId), eq(tasks.id, taskId))).limit(1))[0];
  if (!current) throw new Error("Tarefa não encontrada");
  if (input.contactId) {
    const found = await db.select({ id: contacts.id }).from(contacts).where(and(eq(contacts.organizationId, organizationId), eq(contacts.id, input.contactId))).limit(1);
    if (!found.length) throw new Error("Contato particular não encontrado");
  }
  if (input.catalogContactId) {
    const found = await db.select({ id: catalogContacts.id }).from(catalogContacts).where(and(eq(catalogContacts.id, input.catalogContactId), eq(catalogContacts.reviewStatus, "published"))).limit(1);
    if (!found.length) throw new Error("Contato central não publicado ou não encontrado");
  }
  const linkUpdate = resolveTaskLink(input);
  await db.update(tasks).set({ ...(input.title !== undefined ? { title: input.title.trim() } : {}), ...(input.dueAt !== undefined ? { dueAt: input.dueAt } : {}), ...linkUpdate, ...(input.status !== undefined ? { status: input.status } : {}) }).where(and(eq(tasks.organizationId, organizationId), eq(tasks.id, taskId)));
  return { success: true } as const;
}

async function assertTemplatePermission(organizationId: number, templateId: number, userId: number, role: MemberRole) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");
  const template = (await db.select().from(messageTemplates).where(and(eq(messageTemplates.organizationId, organizationId), eq(messageTemplates.id, templateId))).limit(1))[0];
  if (!template) throw new Error("Modelo não encontrado");
  if (template.scope === "organization" && role === "operator") throw new Error("Operadores só podem alterar modelos pessoais");
  if (template.scope === "personal" && template.ownerId !== userId) throw new Error("Você não pode alterar este modelo pessoal");
  return template;
}

export async function updateMessageTemplate(organizationId: number, templateId: number, userId: number, role: MemberRole, input: { name?: string; body?: string; categoryName?: string | null; purpose?: string; scope?: "organization" | "personal" }) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");
  await assertTemplatePermission(organizationId, templateId, userId, role);
  await db.update(messageTemplates).set({ ...input, updatedAt: new Date() }).where(and(eq(messageTemplates.id, templateId), eq(messageTemplates.organizationId, organizationId)));
  return { success: true } as const;
}

export async function archiveMessageTemplate(organizationId: number, templateId: number, userId: number, role: MemberRole) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");
  await assertTemplatePermission(organizationId, templateId, userId, role);
  await db.update(messageTemplates).set({ archived: true, isDefault: false, updatedAt: new Date() }).where(and(eq(messageTemplates.id, templateId), eq(messageTemplates.organizationId, organizationId)));
  return { success: true } as const;
}

export async function setDefaultMessageTemplate(organizationId: number, templateId: number, userId: number, role: MemberRole) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");
  const template = await assertTemplatePermission(organizationId, templateId, userId, role);
  return db.transaction(async tx => {
    await tx.update(messageTemplates).set({ isDefault: false, updatedAt: new Date() }).where(and(eq(messageTemplates.organizationId, organizationId), eq(messageTemplates.scope, template.scope)));
    await tx.update(messageTemplates).set({ isDefault: true, updatedAt: new Date() }).where(and(eq(messageTemplates.id, templateId), eq(messageTemplates.organizationId, organizationId)));
    return { success: true } as const;
  });
}

export async function duplicateMessageTemplate(organizationId: number, templateId: number, userId: number, role: MemberRole) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");
  const template = await assertTemplatePermission(organizationId, templateId, userId, role);
  const created = await db.insert(messageTemplates).values({ organizationId, ownerId: userId, name: `${template.name} (cópia)`, body: template.body, categoryName: template.categoryName, purpose: template.purpose, scope: template.scope, isDefault: false }).returning({ id: messageTemplates.id });
  return created[0]?.id;
}

export async function updateOrganizationSettings(organizationId: number, input: { name?: string; defaultAreaCode?: string | null; usePhonesAsWhatsapp?: boolean; openWhatsappDirectly?: boolean; defaultMessage?: string | null }) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");
  await db.update(organizations).set({
    ...(input.name !== undefined ? { name: input.name } : {}),
    ...(input.defaultAreaCode !== undefined ? { defaultAreaCode: input.defaultAreaCode || null } : {}),
    ...(input.usePhonesAsWhatsapp !== undefined ? { usePhonesAsWhatsapp: input.usePhonesAsWhatsapp } : {}),
    ...(input.openWhatsappDirectly !== undefined ? { openWhatsappDirectly: input.openWhatsappDirectly } : {}),
    ...(input.defaultMessage !== undefined ? { defaultMessage: input.defaultMessage } : {}),
    updatedAt: new Date(),
  }).where(eq(organizations.id, organizationId));
  return { success: true } as const;
}

export async function writeAudit(organizationId: number, userId: number | null, action: string, entityType: string, entityId: number | null, metadata?: unknown) {
  const db = await getDb();
  if (!db) return;
  await db.insert(auditLogs).values({ organizationId, userId, action, entityType, entityId, metadataJson: metadata ? JSON.stringify(metadata) : null });
}
