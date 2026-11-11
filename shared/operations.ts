export function resolveTaskLink(input: { contactId?: number | null; catalogContactId?: number | null }) {
  if (input.contactId && input.catalogContactId) throw new Error("Escolha um único contato para vincular à tarefa");
  if (input.contactId) return { contactId: input.contactId, catalogContactId: null };
  if (input.catalogContactId) return { catalogContactId: input.catalogContactId, contactId: null };
  return {};
}

export function accumulatePublicationTotals(current: { approvedRows?: number | null; publishedRows?: number | null }, newlyPublished: number) {
  const publishedRows = Number(current.publishedRows || 0) + newlyPublished;
  return { approvedRows: Math.max(Number(current.approvedRows || 0), publishedRows), publishedRows };
}
