"use client";

import { Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Card, PageHeader } from "./AdminUI";
import styles from "./admin.module.css";

type Options = { printingServices: string[]; equipment: string[] };
const initial: Options = { printingServices: [], equipment: [] };

function OptionList({ label, values, onChange }: { label: string; values: string[]; onChange: (values: string[]) => void }) {
  const [draft, setDraft] = useState("");
  function add() { const value = draft.trim(); if (value && !values.some((item) => item.toLowerCase() === value.toLowerCase())) onChange([...values, value]); setDraft(""); }
  return <div className={styles.detailSection}><p className={styles.sectionCaption}>{label}</p><div className={styles.tagEditor}>{values.map((value) => <span key={value}>{value}<button aria-label={`Remove ${value}`} onClick={() => onChange(values.filter((item) => item !== value))} type="button"><Trash2 size={12} /></button></span>)}</div><div className={styles.inlineAdd}><input className={styles.input} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); add(); } }} placeholder={`Add ${label.toLowerCase()}`} value={draft} /><button className={styles.buttonSecondary} onClick={add} type="button"><Plus size={14} /> Add</button></div></div>;
}

export function VendorRegistrationOptionsPanel() {
  const [options, setOptions] = useState<Options>(initial); const [saving, setSaving] = useState(false); const [message, setMessage] = useState("");
  useEffect(() => { fetch("/api/admin/vendor-registration-options", { cache: "no-store" }).then((response) => response.json()).then((payload) => { if (payload?.data) setOptions(payload.data); }).catch(() => setMessage("Could not load vendor registration options.")); }, []);
  async function save() { setSaving(true); setMessage(""); try { const response = await fetch("/api/admin/vendor-registration-options", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(options) }); const payload = await response.json(); if (!response.ok) throw new Error(payload.error?.message || "Could not save options."); setOptions(payload.data); setMessage("Saved. New vendor registrations will use these choices immediately."); } catch (error) { setMessage(error instanceof Error ? error.message : "Could not save options."); } finally { setSaving(false); } }
  return <><PageHeader description="Control the standard service and equipment choices vendors can select during registration." eyebrow="Vendor onboarding" title="Registration options" /><Card><OptionList label="Printing services" values={options.printingServices} onChange={(printingServices) => setOptions((current) => ({ ...current, printingServices }))} /><OptionList label="Equipment" values={options.equipment} onChange={(equipment) => setOptions((current) => ({ ...current, equipment }))} />{message && <p className={styles.formError} role="status">{message}</p>}<button className={styles.buttonPrimary} disabled={saving || !options.printingServices.length || !options.equipment.length} onClick={save} type="button">{saving ? "Saving…" : "Save registration options"}</button></Card></>;
}
