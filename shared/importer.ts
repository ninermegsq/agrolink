export type RawRow = Record<string, unknown>;

export type PhoneCandidate = {
  original: string;
  normalized: string | null;
  countryCode: string | null;
  areaCode: string | null;
  validationStatus: "valid" | "incomplete" | "review" | "invalid";
  isWhatsapp: boolean;
  isPreferred: boolean;
  source: string;
};

export type MappedContact = {
  name: string;
  company: string | null;
  email: string | null;
  addressOriginal: string | null;
  city: string | null;
  state: string | null;
  products: string | null;
  tags: string[];
  notes: string | null;
  phones: PhoneCandidate[];
  category: string;
  pendingReasons: string[];
  raw: RawRow;
};

const aliases: Record<string, string[]> = {
  name: ["name", "nome", "nome do contato", "razao social", "razão social", "contato", "cliente", "produtor"],
  company: ["company", "empresa", "propriedade", "fazenda", "nome fantasia", "fantasia"],
  phone: ["phone", "telefone", "telefone principal", "celular", "fone", "contato 1", "whatsapp"],
  whatsapp: ["whatsapp", "whats app", "whatsapp principal", "whatsapp adicional"],
  email: ["email", "e mail", "e-mail", "correio eletrônico", "correio eletronico"],
  address: ["address", "endereco", "endereço", "endereço completo", "endereco completo", "logradouro"],
  city: ["city", "cidade", "municipio", "município"],
  state: ["state", "estado", "uf"],
  products: ["product", "products", "produto", "produtos", "atividade", "atividades", "culturas"],
  category: ["category", "categoria", "categorias", "tipo", "segmento"],
  tags: ["tags", "tag", "etiquetas", "etiqueta", "marcadores"],
  notes: ["notes", "nota", "notas", "observacoes", "observações", "comentarios", "comentários"],
};

export function cleanCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "number" && Number.isFinite(value)) return String(value).replace(/\.0$/, "");
  return String(value).trim();
}

export function normalizeHeader(value: unknown): string {
  return cleanCell(value).toLocaleLowerCase("pt-BR").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[._-]+/g, " ").replace(/\s+/g, " ").trim();
}

export function detectMapping(headers: string[]) {
  const normalized = headers.map(normalizeHeader);
  const mapping: Record<string, string | null> = {};
  for (const [field, choices] of Object.entries(aliases)) {
    const choiceSet = new Set(choices.map(normalizeHeader));
    const index = normalized.findIndex(header => choiceSet.has(header));
    if (index >= 0) mapping[field] = headers[index];
  }
  return mapping;
}

export const importFields = ["name", "company", "phone", "whatsapp", "email", "address", "city", "state", "products", "category", "tags", "notes"] as const;

function splitPhoneValues(value: string): string[] {
  if (!value) return [];
  return value.split(/[;,|/\n]+/g).map(item => item.trim()).filter(Boolean);
}

function looksLikeExplicitWhatsappFlag(value: string) {
  return ["sim", "true", "1", "yes", "s", "x"].includes(value.toLocaleLowerCase("pt-BR"));
}

function onlyDigits(value: string) { return value.replace(/\D/g, ""); }

export function normalizePhone(input: string, options?: { countryDialCode?: string; defaultAreaCode?: string }): PhoneCandidate {
  const original = cleanCell(input);
  const countryDialCode = options?.countryDialCode || "55";
  const raw = original.replace(/\.0$/, "").trim();
  const digits = onlyDigits(raw);
  if (!digits) return { original, normalized: null, countryCode: null, areaCode: null, validationStatus: "invalid", isWhatsapp: true, isPreferred: false, source: "import" };
  const hasPlus = /^\+/.test(raw);
  const explicitInternational = hasPlus || digits.startsWith(countryDialCode);
  let normalized = digits;
  let detectedCountry: string | null = explicitInternational ? (digits.startsWith(countryDialCode) ? countryDialCode : null) : null;
  let areaCode: string | null = null;
  let validationStatus: PhoneCandidate["validationStatus"] = "review";
  if (explicitInternational) {
    if (digits.startsWith(countryDialCode)) {
      const national = digits.slice(countryDialCode.length);
      if (national.length >= 10 && national.length <= 11) { areaCode = national.slice(0, 2); validationStatus = "valid"; }
      else if (national.length > 0) validationStatus = "incomplete";
      else validationStatus = "invalid";
    } else if (digits.length >= 10 && digits.length <= 15) {
      const countryLength = Math.max(1, digits.length - 10);
      detectedCountry = digits.slice(0, countryLength);
      validationStatus = "valid";
    } else validationStatus = digits.length > 0 ? "incomplete" : "invalid";
  } else if (digits.length === 10 || digits.length === 11) {
    detectedCountry = countryDialCode; areaCode = digits.slice(0, 2); normalized = `${countryDialCode}${digits}`; validationStatus = "valid";
  } else if (digits.length >= 8 && digits.length <= 9) {
    const ddd = options?.defaultAreaCode ? onlyDigits(options.defaultAreaCode) : "";
    if (ddd.length === 2) { detectedCountry = countryDialCode; areaCode = ddd; normalized = `${countryDialCode}${ddd}${digits}`; validationStatus = "valid"; }
    else { normalized = digits; validationStatus = "incomplete"; }
  } else if (digits.length >= 7 && digits.length <= 15) validationStatus = "review";
  else validationStatus = "invalid";
  return { original, normalized: normalized || null, countryCode: detectedCountry, areaCode, validationStatus, isWhatsapp: true, isPreferred: false, source: "import" };
}

export function mapRow(row: RawRow, mapping: Record<string, string | null>, options?: { category?: string; countryDialCode?: string; defaultAreaCode?: string; usePhonesAsWhatsapp?: boolean }): MappedContact {
  const get = (field: string) => cleanCell(mapping[field] ? row[mapping[field]!] : "");
  const name = get("name");
  const phoneValue = get("phone");
  const whatsappValue = get("whatsapp");
  const phoneInputs = [...splitPhoneValues(phoneValue)];
  const explicitWhatsappFlag = looksLikeExplicitWhatsappFlag(whatsappValue);
  if (whatsappValue && !explicitWhatsappFlag) phoneInputs.push(...splitPhoneValues(whatsappValue));
  const unique = new Map<string, PhoneCandidate>();
  for (const value of phoneInputs) {
    const candidate = normalizePhone(value, options);
    const key = candidate.normalized || candidate.original;
    if (!unique.has(key) && candidate.validationStatus !== "invalid") unique.set(key, candidate);
  }
  const phones = Array.from(unique.values());
  const explicitWhatsappNumber = whatsappValue && !explicitWhatsappFlag ? splitPhoneValues(whatsappValue)[0] : null;
  const explicitNormalized = explicitWhatsappNumber ? normalizePhone(explicitWhatsappNumber, options).normalized : null;
  phones.forEach(phone => { phone.isWhatsapp = options?.usePhonesAsWhatsapp !== false || Boolean(explicitWhatsappNumber); phone.isPreferred = explicitNormalized ? phone.normalized === explicitNormalized : false; });
  if (phones.length && !phones.some(phone => phone.isPreferred)) phones[0].isPreferred = true;
  const pendingReasons: string[] = [];
  if (!name) pendingReasons.push("Nome ausente");
  if (!phones.length) pendingReasons.push("Sem telefone");
  if (phones.some(phone => phone.validationStatus === "incomplete")) pendingReasons.push("Telefone sem DDD");
  if (phones.some(phone => phone.validationStatus === "review")) pendingReasons.push("Telefone precisa de revisão");
  const tags = get("tags").split(/[;,|]+/g).map(item => item.trim()).filter(Boolean);
  const category = get("category") || options?.category || "Produtor rural";
  return { name: name || "Contato sem nome", company: get("company") || null, email: get("email") || null, addressOriginal: get("address") || null, city: get("city") || null, state: get("state").toUpperCase() || null, products: get("products") || null, tags, notes: get("notes") || null, phones, category, pendingReasons, raw: row };
}

export function parsePastedList(text: string): RawRow[] { return text.split(/\r?\n/).map(line => line.trim()).filter(Boolean).map(line => ({ name: line })); }

export function interpolateMessage(body: string, values: Record<string, string | null | undefined>) { return body.replace(/\{([a-z_]+)\}/gi, (_, key: string) => values[key] || "").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim(); }

export function buildWhatsappUrl(phone: PhoneCandidate | { normalized: string | null }, message: string) { if (!phone.normalized) return null; return `https://wa.me/${phone.normalized}?text=${encodeURIComponent(message)}`; }
