import { describe, expect, it } from "vitest";
import { buildWhatsappUrl, detectMapping, mapRow, normalizePhone } from "./importer";
import { accumulatePublicationTotals, resolveTaskLink } from "./operations";

describe("AGROLINK importer", () => {
  it("detects the seven reference headers with Portuguese aliases", () => {
    const mapping = detectMapping([" NAME ", "Telefone", "WhatsApp", "E-mail", "Endereço", "Tags", "Notes"]);
    expect(mapping).toEqual({ name: " NAME ", phone: "Telefone", whatsapp: "WhatsApp", email: "E-mail", address: "Endereço", tags: "Tags", notes: "Notes" });
  });

  it("uses phone as the WhatsApp destination when the explicit column is empty", () => {
    const mapped = mapRow({ name: "Fazenda", phone: "(64) 99999-1234", whatsapp: "", email: "", address: "GO", tags: "soja", notes: "" }, detectMapping(["name", "phone", "whatsapp", "email", "address", "tags", "notes"]));
    expect(mapped.phones[0].normalized).toBe("5564999991234");
    expect(mapped.phones[0].isWhatsapp).toBe(true);
    expect(mapped.phones[0].isPreferred).toBe(true);
  });

  it("preserves a local number for review instead of inventing a DDD", () => {
    const phone = normalizePhone("99999-1234");
    expect(phone.normalized).toBe("999991234");
    expect(phone.validationStatus).toBe("incomplete");
    expect(phone.countryCode).toBeNull();
  });

  it("accepts a fixed line as a valid intended WhatsApp destination", () => {
    const phone = normalizePhone("(64) 3333-1234");
    expect(phone.normalized).toBe("556433331234");
    expect(phone.validationStatus).toBe("valid");
    expect(buildWhatsappUrl(phone, "Olá, João!\nPodemos falar?")).toContain("Ol%C3%A1");
  });

  it("treats true as a flag and never creates phone number 1", () => {
    const mapped = mapRow({ name: "Contato", phone: "(64) 99999-1111", whatsapp: "true" }, detectMapping(["name", "phone", "whatsapp"]));
    expect(mapped.phones).toHaveLength(1);
    expect(mapped.phones[0].normalized).toBe("5564999991111");
  });

  it("preserves city, state, company and product fields with an editable mapping", () => {
    const headers = ["Nome", "Empresa", "Telefone", "Cidade", "UF", "Produto"];
    const mapped = mapRow({ Nome: "Sítio Vale", Empresa: "Vale Rural", Telefone: "(64) 3333-1234", Cidade: "Rio Verde", UF: "go", Produto: "Soja" }, detectMapping(headers));
    expect(mapped.company).toBe("Vale Rural");
    expect(mapped.city).toBe("Rio Verde");
    expect(mapped.state).toBe("GO");
    expect(mapped.products).toBe("Soja");
  });

  it("keeps multiple phones without duplicating normalized values", () => {
    const mapped = mapRow({ name: "Cooperativa", phone: "(64) 3333-1234; (64) 3333-1234", whatsapp: "(64) 99999-1234" }, detectMapping(["name", "phone", "whatsapp"]));
    expect(mapped.phones).toHaveLength(2);
    expect(mapped.phones.filter(phone => phone.isWhatsapp)).toHaveLength(2);
    expect(mapped.phones.find(phone => phone.isPreferred)?.normalized).toBe("5564999991234");
  });

  it("preserves an explicit international number without adding Brazil's code", () => {
    const phone = normalizePhone("+1 202 555 0123");
    expect(phone.normalized).toBe("12025550123");
    expect(phone.countryCode).toBe("1");
    expect(phone.validationStatus).toBe("valid");
  });

  it("preserves a selected private task link when the other link is null", () => {
    expect(resolveTaskLink({ contactId: 42, catalogContactId: null })).toEqual({ contactId: 42, catalogContactId: null });
    expect(resolveTaskLink({ catalogContactId: 7, contactId: null })).toEqual({ catalogContactId: 7, contactId: null });
  });

  it("accumulates publication totals on repeated batch publication", () => {
    expect(accumulatePublicationTotals({ approvedRows: 10, publishedRows: 10 }, 0)).toEqual({ approvedRows: 10, publishedRows: 10 });
    expect(accumulatePublicationTotals({ approvedRows: 10, publishedRows: 10 }, 3)).toEqual({ approvedRows: 13, publishedRows: 13 });
  });
});
