import { z } from "zod";
import { getMember, getOrganizationForUser, getDashboard, getImportBatch, listContacts, listTasks, listTaskCandidates, listTemplates, startImport, createActivity, listOrganizationMembers, updateOrganizationMember, exportOrganizationBackup, restoreOrganizationBackup, listPlatformUsers, createManualPlatformUser, updatePlatformUser, createLocalUser, getUserByEmail, getUserById, touchUserLogin } from "./db";
import { getCatalogSummary, listCatalogContacts, toggleCatalogFavorite, saveCatalogNote, startCatalogImport, listCatalogImports, publishCatalogBatch, publishCatalogContacts, listAdminCatalogContacts, createManualCatalogContact, updateCatalogContact, approveCatalogContacts, setCatalogContactStatus, listCatalogAudit, listCatalogAccessOrganizations, updateOrganizationSubscription, setCatalogAccess } from "./catalog";
import { archiveMessageTemplate, completeTask, updateTask, createPrivateContact, createTask, duplicateMessageTemplate, exportPrivateContacts, setDefaultMessageTemplate, updateMessageTemplate, updateOrganizationSettings, updatePrivateContact } from "./actions";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { hashPassword, signSession, verifyPassword, SESSION_MAX_AGE_MS } from "./_core/session";
import { adminProcedure, protectedProcedure, publicProcedure, router } from "./_core/trpc";
import type { User } from "../drizzle/schema";

/** Remove o hash da senha antes de enviar o usuario ao navegador. */
function toPublicUser(user: User) {
  const { passwordHash: _passwordHash, ...safe } = user;
  return safe;
}

async function organizationContext(userId: number, userName?: string | null) {
  const organization = await getOrganizationForUser(userId, userName);
  const member = organization ? await getMember(userId, organization.id) : undefined;
  if (!organization || !member) throw new Error("Organização não encontrada");
  return { organization, member };
}

const phoneInput = z.object({ original: z.string().min(1).max(80), isWhatsapp: z.boolean().optional(), isPreferred: z.boolean().optional(), defaultAreaCode: z.string().max(4).optional() });
const contactFields = {
  name: z.string().min(1).max(180), company: z.string().max(180).optional(), email: z.string().max(320).optional(), city: z.string().max(120).optional(), state: z.string().max(4).optional(), addressOriginal: z.string().max(5000).optional(), categories: z.array(z.string().max(120)).optional(), tags: z.array(z.string().max(80)).optional(), notes: z.string().max(5000).optional(), doNotContact: z.boolean().optional(), phones: z.array(phoneInput).max(20).optional(),
};

export const appRouter = router({
  system: router({ health: publicProcedure.query(() => ({ status: "ok", service: "agrolink" })) }),
  auth: router({
    me: publicProcedure.query(opts => (opts.ctx.user ? toPublicUser(opts.ctx.user) : null)),
    register: publicProcedure.input(z.object({ name: z.string().min(2).max(180), email: z.string().email().max(320), password: z.string().min(6).max(200) })).mutation(async ({ ctx, input }) => {
      const email = input.email.trim().toLowerCase();
      const { userId } = await createLocalUser({ name: input.name, email, passwordHash: hashPassword(input.password) });
      const user = await getUserById(userId);
      if (!user) throw new Error("Não foi possível concluir o cadastro");
      const token = await signSession({ userId: user.id, email: user.email ?? email, name: user.name });
      ctx.res.cookie(COOKIE_NAME, token, { ...getSessionCookieOptions(ctx.req), maxAge: SESSION_MAX_AGE_MS });
      return { user: toPublicUser(user) };
    }),
    login: publicProcedure.input(z.object({ email: z.string().email().max(320), password: z.string().min(1).max(200) })).mutation(async ({ ctx, input }) => {
      const user = await getUserByEmail(input.email);
      if (!user || !user.passwordHash || !verifyPassword(input.password, user.passwordHash)) throw new Error("E-mail ou senha inválidos");
      if (user.accessStatus === "blocked") throw new Error("Este acesso está bloqueado. Fale com o administrador.");
      if (user.accessStatus !== "active") throw new Error("Este acesso ainda não foi liberado pelo administrador.");
      await touchUserLogin(user.id);
      const token = await signSession({ userId: user.id, email: user.email ?? input.email, name: user.name });
      ctx.res.cookie(COOKIE_NAME, token, { ...getSessionCookieOptions(ctx.req), maxAge: SESSION_MAX_AGE_MS });
      return { user: toPublicUser(user) };
    }),
    logout: publicProcedure.mutation(({ ctx }) => { const cookieOptions = getSessionCookieOptions(ctx.req); ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 }); return { success: true } as const; }),
  }),
  organization: router({
    current: protectedProcedure.query(async ({ ctx }) => { const { organization, member } = await organizationContext(ctx.user.id, ctx.user.name); return { organization, member, user: toPublicUser(ctx.user) }; }),
    settings: protectedProcedure.query(async ({ ctx }) => { const { organization, member } = await organizationContext(ctx.user.id, ctx.user.name); return { organization, member }; }),
    updateSettings: protectedProcedure.input(z.object({ name: z.string().min(2).max(180).optional(), defaultAreaCode: z.string().max(4).nullable().optional(), usePhonesAsWhatsapp: z.boolean().optional(), openWhatsappDirectly: z.boolean().optional(), defaultMessage: z.string().max(5000).nullable().optional() })).mutation(async ({ ctx, input }) => { const { organization, member } = await organizationContext(ctx.user.id, ctx.user.name); if (member.role === "operator") throw new Error("Operadores não podem alterar configurações"); return updateOrganizationSettings(organization.id, input); }),
    members: protectedProcedure.query(async ({ ctx }) => { const { organization } = await organizationContext(ctx.user.id, ctx.user.name); return listOrganizationMembers(organization.id); }),
    updateMember: protectedProcedure.input(z.object({ memberId: z.number().int().positive(), role: z.enum(["owner", "admin", "operator"]).optional(), status: z.enum(["active", "invited", "suspended"]).optional() })).mutation(async ({ ctx, input }) => { const { organization, member } = await organizationContext(ctx.user.id, ctx.user.name); return updateOrganizationMember(organization.id, member.role, input.memberId, { role: input.role, status: input.status }); }),
    backup: protectedProcedure.query(async ({ ctx }) => { const { organization, member } = await organizationContext(ctx.user.id, ctx.user.name); if (member.role === "operator") throw new Error("Somente proprietário ou administrador pode exportar backup"); return exportOrganizationBackup(organization.id); }),
    restore: protectedProcedure.input(z.object({ backup: z.string().max(5000000) })).mutation(async ({ ctx, input }) => { const { organization, member } = await organizationContext(ctx.user.id, ctx.user.name); let parsed: unknown; try { parsed = JSON.parse(input.backup); } catch { throw new Error("Backup inválido: o conteúdo enviado não é um JSON válido."); } return restoreOrganizationBackup(organization.id, member.role, parsed); }),
  }),
  dashboard: router({ overview: protectedProcedure.query(async ({ ctx }) => { const { organization } = await organizationContext(ctx.user.id, ctx.user.name); return getDashboard(organization.id); }) }),
  catalog: router({
    summary: protectedProcedure.query(async ({ ctx }) => { const { organization } = await organizationContext(ctx.user.id, ctx.user.name); return getCatalogSummary(organization.id); }),
    list: protectedProcedure.input(z.object({ search: z.string().optional(), state: z.string().max(4).optional(), city: z.string().optional(), category: z.string().optional(), product: z.string().optional(), favoritesOnly: z.boolean().default(false), limit: z.number().min(1).max(100).default(25), offset: z.number().min(0).default(0) })).query(async ({ ctx, input }) => { const { organization } = await organizationContext(ctx.user.id, ctx.user.name); return listCatalogContacts(organization.id, input); }),
    favorite: protectedProcedure.input(z.object({ catalogContactId: z.number().int().positive(), favorite: z.boolean() })).mutation(async ({ ctx, input }) => { const { organization } = await organizationContext(ctx.user.id, ctx.user.name); return toggleCatalogFavorite(organization.id, input.catalogContactId, input.favorite, ctx.user.id); }),
    note: protectedProcedure.input(z.object({ catalogContactId: z.number().int().positive(), notes: z.string().max(5000).nullable() })).mutation(async ({ ctx, input }) => { const { organization } = await organizationContext(ctx.user.id, ctx.user.name); return saveCatalogNote(organization.id, input.catalogContactId, input.notes, ctx.user.id); }),
  }),
  contacts: router({
    list: protectedProcedure.input(z.object({ search: z.string().optional(), tag: z.string().optional(), status: z.enum(["active", "inactive", "archived"]).optional(), limit: z.number().min(1).max(100).default(25), offset: z.number().min(0).default(0) })).query(async ({ ctx, input }) => { const { organization } = await organizationContext(ctx.user.id, ctx.user.name); return listContacts(organization.id, input); }),
    create: protectedProcedure.input(z.object(contactFields)).mutation(async ({ ctx, input }) => { const { organization, member } = await organizationContext(ctx.user.id, ctx.user.name); if (member.role === "operator") throw new Error("Somente administradores podem cadastrar contatos particulares"); return createPrivateContact(organization.id, input); }),
    update: protectedProcedure.input(z.object({ contactId: z.number().int().positive(), ...contactFields, name: contactFields.name.optional(), company: contactFields.company.nullable().optional(), email: contactFields.email.nullable().optional(), city: contactFields.city.nullable().optional(), state: contactFields.state.nullable().optional(), addressOriginal: contactFields.addressOriginal.nullable().optional(), notes: contactFields.notes.nullable().optional(), doNotContact: z.boolean().optional(), favorite: z.boolean().optional(), status: z.enum(["active", "inactive", "archived"]).optional() })).mutation(async ({ ctx, input }) => { const { organization, member } = await organizationContext(ctx.user.id, ctx.user.name); const { contactId, ...values } = input; if (member.role === "operator" && Object.keys(values).some(key => key !== "favorite")) throw new Error("Somente administradores podem editar dados de contatos"); return updatePrivateContact(organization.id, contactId, values); }),
    export: protectedProcedure.mutation(async ({ ctx }) => { const { organization } = await organizationContext(ctx.user.id, ctx.user.name); return exportPrivateContacts(organization.id); }),
  }),
  imports: router({
    start: protectedProcedure.input(z.object({ fileName: z.string().max(255).optional(), sourceType: z.enum(["xlsx", "csv", "pasted", "vcard"]), rows: z.array(z.record(z.string(), z.unknown())).min(1).max(20000), mapping: z.record(z.string(), z.string().nullable()), category: z.string().min(1).max(120).default("Produtor rural"), countryDialCode: z.string().default("55"), defaultAreaCode: z.string().optional(), usePhonesAsWhatsapp: z.boolean().default(true) })).mutation(async ({ ctx, input }) => { const { organization, member } = await organizationContext(ctx.user.id, ctx.user.name); if (member.role === "operator") throw new Error("Somente administradores podem importar contatos particulares"); return startImport({ organizationId: organization.id, userId: ctx.user.id, ...input }); }),
    status: protectedProcedure.input(z.object({ batchId: z.number().int().positive() })).query(async ({ ctx, input }) => { const { organization } = await organizationContext(ctx.user.id, ctx.user.name); return getImportBatch(organization.id, input.batchId); }),
  }),
  templates: router({
    list: protectedProcedure.query(async ({ ctx }) => { const { organization } = await organizationContext(ctx.user.id, ctx.user.name); return listTemplates(organization.id, ctx.user.id); }),
    create: protectedProcedure.input(z.object({ name: z.string().min(2).max(140), body: z.string().min(2), categoryName: z.string().max(120).optional(), purpose: z.string().max(80).optional(), scope: z.enum(["organization", "personal"]).optional() })).mutation(async ({ ctx, input }) => { const { organization, member } = await organizationContext(ctx.user.id, ctx.user.name); if (member.role === "operator" && input.scope === "organization") throw new Error("Operadores não podem criar modelos da organização"); const { createTemplate } = await import("./db"); return createTemplate(organization.id, ctx.user.id, input); }),
    update: protectedProcedure.input(z.object({ templateId: z.number().int().positive(), name: z.string().min(2).max(140).optional(), body: z.string().min(2).optional(), categoryName: z.string().max(120).nullable().optional(), purpose: z.string().max(80).optional(), scope: z.enum(["organization", "personal"]).optional() })).mutation(async ({ ctx, input }) => { const { organization, member } = await organizationContext(ctx.user.id, ctx.user.name); const { templateId, ...values } = input; return updateMessageTemplate(organization.id, templateId, ctx.user.id, member.role, values); }),
    archive: protectedProcedure.input(z.object({ templateId: z.number().int().positive() })).mutation(async ({ ctx, input }) => { const { organization, member } = await organizationContext(ctx.user.id, ctx.user.name); return archiveMessageTemplate(organization.id, input.templateId, ctx.user.id, member.role); }),
    setDefault: protectedProcedure.input(z.object({ templateId: z.number().int().positive() })).mutation(async ({ ctx, input }) => { const { organization, member } = await organizationContext(ctx.user.id, ctx.user.name); return setDefaultMessageTemplate(organization.id, input.templateId, ctx.user.id, member.role); }),
    duplicate: protectedProcedure.input(z.object({ templateId: z.number().int().positive() })).mutation(async ({ ctx, input }) => { const { organization, member } = await organizationContext(ctx.user.id, ctx.user.name); return duplicateMessageTemplate(organization.id, input.templateId, ctx.user.id, member.role); }),
  }),
  activity: router({ whatsappOpened: protectedProcedure.input(z.object({ contactId: z.number().int().positive().optional(), catalogContactId: z.number().int().positive().optional(), phone: z.string().optional() })).mutation(async ({ ctx, input }) => { const { organization } = await organizationContext(ctx.user.id, ctx.user.name); await createActivity(organization.id, ctx.user.id, "whatsapp_opened", `Tentativa de abertura do WhatsApp${input.phone ? ` para ${input.phone}` : ""}`, input.contactId, input.catalogContactId); return { success: true } as const; }) }),
  tasks: router({
    list: protectedProcedure.input(z.object({ includeCompleted: z.boolean().default(false) }).optional()).query(async ({ ctx, input }) => { const { organization } = await organizationContext(ctx.user.id, ctx.user.name); return listTasks(organization.id, input?.includeCompleted ?? false); }),
    create: protectedProcedure.input(z.object({ title: z.string().min(2).max(180), dueAt: z.string().datetime().nullable().optional(), contactId: z.number().int().positive().nullable().optional(), catalogContactId: z.number().int().positive().nullable().optional() })).mutation(async ({ ctx, input }) => { const { organization } = await organizationContext(ctx.user.id, ctx.user.name); if (input.catalogContactId) { const { organizationHasCatalogAccess } = await import("./catalog"); if (!(await organizationHasCatalogAccess(organization.id))) throw new Error("A Base AGROLINK não está liberada para esta organização"); } return createTask(organization.id, ctx.user.id, { ...input, dueAt: input.dueAt ? new Date(input.dueAt) : null }); }),
    candidates: protectedProcedure.input(z.object({ search: z.string().optional() }).optional()).query(async ({ ctx, input }) => { const { organization } = await organizationContext(ctx.user.id, ctx.user.name); const { organizationHasCatalogAccess } = await import("./catalog"); return listTaskCandidates(organization.id, input?.search, await organizationHasCatalogAccess(organization.id)); }),
    update: protectedProcedure.input(z.object({ taskId: z.number().int().positive(), title: z.string().min(2).max(180).optional(), dueAt: z.string().datetime().nullable().optional(), contactId: z.number().int().positive().nullable().optional(), catalogContactId: z.number().int().positive().nullable().optional(), status: z.enum(["pending", "done", "cancelled"]).optional() })).mutation(async ({ ctx, input }) => { const { organization } = await organizationContext(ctx.user.id, ctx.user.name); const { taskId, ...values } = input; return updateTask(organization.id, taskId, { ...values, dueAt: values.dueAt === undefined ? undefined : values.dueAt ? new Date(values.dueAt) : null }); }),
    complete: protectedProcedure.input(z.object({ taskId: z.number().int().positive(), status: z.enum(["done", "cancelled"]).default("done") })).mutation(async ({ ctx, input }) => { const { organization } = await organizationContext(ctx.user.id, ctx.user.name); return completeTask(organization.id, input.taskId, input.status); }),
  }),
  admin: router({
    overview: adminProcedure.query(({ ctx }) => ({ user: toPublicUser(ctx.user), note: "A administração controla a Base AGROLINK, acessos e histórico de publicação." })),
    users: adminProcedure.query(() => listPlatformUsers()),
    createUser: adminProcedure.input(z.object({ name: z.string().min(2).max(180), email: z.string().email().max(320), organizationId: z.number().int().positive(), role: z.enum(["owner", "admin", "operator"]).default("operator") })).mutation(({ ctx, input }) => createManualPlatformUser(ctx.user.id, input)),
    updateUser: adminProcedure.input(z.object({ userId: z.number().int().positive(), accessStatus: z.enum(["pending", "active", "blocked"]).optional(), memberId: z.number().int().positive().optional(), role: z.enum(["owner", "admin", "operator"]).optional(), memberStatus: z.enum(["active", "invited", "suspended"]).optional() })).mutation(({ ctx, input }) => { const { userId, ...values } = input; return updatePlatformUser(ctx.user.id, userId, values); }),
    catalogImports: adminProcedure.query(() => listCatalogImports()),
    catalogContacts: adminProcedure.input(z.object({ status: z.enum(["pending", "reviewed", "published", "inactive"]).optional(), limit: z.number().min(1).max(100).default(50), offset: z.number().min(0).default(0) })).query(({ input }) => listAdminCatalogContacts(input)),
    createCatalogContact: adminProcedure.input(z.object({ name: z.string().min(1).max(180), company: z.string().max(180).nullable().optional(), email: z.string().max(320).nullable().optional(), city: z.string().max(120).nullable().optional(), state: z.string().max(4).nullable().optional(), products: z.string().max(5000).nullable().optional(), categories: z.array(z.string()).optional(), tags: z.array(z.string()).optional(), addressOriginal: z.string().max(5000).nullable().optional(), phones: z.array(phoneInput).optional() })).mutation(({ ctx, input }) => createManualCatalogContact(ctx.user.id, input)),
    importCatalog: adminProcedure.input(z.object({ fileName: z.string().max(255).optional(), sourceType: z.enum(["xlsx", "csv"]), rows: z.array(z.record(z.string(), z.unknown())).min(1).max(50000), mapping: z.record(z.string(), z.string().nullable()), category: z.string().min(1).max(120), defaultAreaCode: z.string().max(4).optional() })).mutation(({ ctx, input }) => startCatalogImport({ userId: ctx.user.id, ...input })),
    approveCatalog: adminProcedure.input(z.object({ catalogContactIds: z.array(z.number().int().positive()).min(1).max(500) })).mutation(({ ctx, input }) => approveCatalogContacts(ctx.user.id, input.catalogContactIds)),
    updateCatalog: adminProcedure.input(z.object({ catalogContactId: z.number().int().positive(), name: z.string().min(1).max(180).optional(), company: z.string().max(180).nullable().optional(), email: z.string().max(320).nullable().optional(), city: z.string().max(120).nullable().optional(), state: z.string().max(4).nullable().optional(), products: z.string().max(5000).nullable().optional(), categories: z.array(z.string()).optional(), tags: z.array(z.string()).optional(), addressOriginal: z.string().max(5000).nullable().optional(), phones: z.array(phoneInput).optional() })).mutation(({ ctx, input }) => { const { catalogContactId, ...values } = input; return updateCatalogContact(ctx.user.id, catalogContactId, values); }),
    setCatalogStatus: adminProcedure.input(z.object({ catalogContactId: z.number().int().positive(), status: z.enum(["pending", "reviewed", "published", "inactive"]) })).mutation(({ ctx, input }) => setCatalogContactStatus(ctx.user.id, input.catalogContactId, input.status)),
    publishCatalogContacts: adminProcedure.input(z.object({ catalogContactIds: z.array(z.number().int().positive()).min(1).max(500) })).mutation(({ ctx, input }) => publishCatalogContacts(ctx.user.id, input.catalogContactIds)),
    publishCatalogBatch: adminProcedure.input(z.object({ batchId: z.number().int().positive() })).mutation(({ ctx, input }) => publishCatalogBatch(input.batchId, ctx.user.id)),
    audit: adminProcedure.query(() => listCatalogAudit()),
    accessOrganizations: adminProcedure.query(() => listCatalogAccessOrganizations()),
    updateSubscription: adminProcedure.input(z.object({ organizationId: z.number().int().positive(), plan: z.enum(["essential", "professional", "enterprise"]).optional(), status: z.enum(["trial", "active", "past_due", "cancelled", "pending"]).optional(), catalogIncluded: z.boolean().optional(), maxContacts: z.number().int().positive().optional(), maxMembers: z.number().int().positive().optional(), maxImports: z.number().int().positive().optional() })).mutation(({ ctx, input }) => { const { organizationId, ...values } = input; return updateOrganizationSubscription(ctx.user.id, organizationId, values); }),
    setCatalogAccess: adminProcedure.input(z.object({ organizationId: z.number().int().positive(), action: z.enum(["grant", "revoke"]), validUntil: z.string().datetime().optional(), reason: z.string().max(500).optional() })).mutation(({ ctx, input }) => setCatalogAccess(ctx.user.id, input.organizationId, input.action, input.validUntil ? new Date(input.validUntil) : undefined, input.reason)),
  }),
});

export type AppRouter = typeof appRouter;
