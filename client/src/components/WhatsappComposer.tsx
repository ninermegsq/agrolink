import { useEffect, useMemo, useState } from "react";
import { MessageCircle, X } from "lucide-react";
import { buildWhatsappUrl, interpolateMessage } from "@shared/importer";
import { Button } from "@/components/ui/button";

type Phone = { id?: number; original: string; normalized: string | null; isPreferred?: boolean; isWhatsapp?: boolean; validationStatus?: string };
type Template = { id: number; name: string; body: string; isDefault?: boolean; purpose?: string };

type Props = {
  open: boolean;
  demo?: boolean;
  contact: any | null;
  templates: Template[];
  defaultMessage?: string | null;
  userName?: string | null;
  organizationName?: string | null;
  onClose: () => void;
  onOpened?: (phone: string) => void;
};

export function WhatsappComposer({ open, demo, contact, templates, defaultMessage, userName, organizationName, onClose, onOpened }: Props) {
  const phones = useMemo(() => (contact?.phones || []).filter((phone: Phone) => phone.normalized && phone.validationStatus !== "invalid" && phone.isWhatsapp !== false), [contact]);
  const [phoneId, setPhoneId] = useState<string>("");
  const [templateId, setTemplateId] = useState<string>("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!open) return;
    const preferred = phones.find((phone: Phone) => phone.isPreferred) || phones[0];
    const defaultTemplate = templates.find(template => template.isDefault) || templates[0];
    setPhoneId(preferred?.id ? String(preferred.id) : preferred?.normalized || "");
    setTemplateId(defaultTemplate?.id ? String(defaultTemplate.id) : "settings");
  }, [open, phones, templates]);

  useEffect(() => {
    if (!open || !contact) return;
    const template = templateId === "settings" ? null : templates.find(item => String(item.id) === templateId);
    const body = template?.body || defaultMessage || "Olá, {primeiro_nome}! Podemos conversar?";
    setMessage(interpolateMessage(body, {
      nome: contact.name,
      primeiro_nome: String(contact.name || "").split(" ")[0],
      empresa: contact.company,
      cidade: contact.city,
      estado: contact.state,
      produto: contact.products,
      nome_usuario: userName,
      nome_organizacao: organizationName,
    }));
  }, [open, contact, templateId, templates, defaultMessage, userName, organizationName]);

  if (!open || !contact) return null;
  const selected = phones.find((phone: Phone) => String(phone.id || phone.normalized) === phoneId) || phones[0];
  const selectedUrl = selected ? buildWhatsappUrl(selected, message) : null;
  const closeAfter = () => { onClose(); };
  const openWhatsapp = () => {
    if (demo) return closeAfter();
    if (contact.doNotContact) return;
    if (!selectedUrl) return;
    if (!window.confirm("O AGROLINK apenas abrirá o WhatsApp com este texto. O envio acontecerá dentro do WhatsApp. Continuar?")) return;
    window.open(selectedUrl, "_blank", "noopener,noreferrer");
    onOpened?.(selected.original);
    closeAfter();
  };

  return <div className="whatsapp-modal-backdrop" role="presentation" onMouseDown={event => event.target === event.currentTarget && closeAfter()}><section className="whatsapp-modal" role="dialog" aria-modal="true" aria-labelledby="whatsapp-title">
    <div className="modal-heading"><div><span className="eyebrow">REVISÃO ANTES DE ABRIR</span><h2 id="whatsapp-title"><MessageCircle size={20} /> WhatsApp para {contact.name}</h2></div><button className="icon-button" onClick={closeAfter} aria-label="Fechar"><X size={18} /></button></div>
    {demo && <div className="demo-note">A demonstração não abre números reais nem registra atividade.</div>}{contact.doNotContact && <div className="demo-note">Este contato está marcado como não contatar. A abertura foi bloqueada.</div>}
    <label><span>Telefone</span><select value={phoneId} onChange={event => setPhoneId(event.target.value)}>{phones.map((phone: Phone) => <option key={phone.id || phone.normalized} value={String(phone.id || phone.normalized)}>{phone.original}{phone.isPreferred ? " · preferencial" : ""}</option>)}</select></label>
    <label><span>Modelo de mensagem</span><select value={templateId} onChange={event => setTemplateId(event.target.value)}><option value="settings">Mensagem padrão das configurações</option>{templates.map(template => <option key={template.id} value={String(template.id)}>{template.name}{template.isDefault ? " · padrão" : ""}</option>)}</select></label>
    <label><span>Mensagem revisável</span><textarea value={message} onChange={event => setMessage(event.target.value)} rows={8} /></label>
    <div className="modal-footer"><small>O AGROLINK registra somente a tentativa de abertura, nunca envio, entrega ou resposta.</small><div><Button variant="outline" onClick={closeAfter}>Cancelar</Button><Button onClick={openWhatsapp} disabled={!selectedUrl || demo || contact.doNotContact}>Abrir no WhatsApp</Button></div></div>
  </section></div>;
}
