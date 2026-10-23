"use client";

import { AlertCircle, CheckCircle2, LoaderCircle, Save, Settings2, ShieldCheck } from "lucide-react";
import { useCallback, useEffect, useState, type FormEvent } from "react";

import { Card, CardHeader, StatusBadge } from "./AdminUI";
import styles from "./admin.module.css";

interface MarketplaceSettings {
  maxVendorsPerOrder: number;
  source: "database" | "environment" | "default";
  limits: { minimum: number; maximum: number };
  updatedAt: string | null;
}

function responseError(body: unknown) {
  if (typeof body === "object" && body !== null && "error" in body) {
    const error = (body as { error?: { message?: unknown } }).error;
    if (typeof error?.message === "string") return error.message;
  }
  return "The marketplace setting could not be loaded.";
}

function sourceLabel(source: MarketplaceSettings["source"]) {
  if (source === "database") return "Admin override";
  if (source === "environment") return "Environment fallback";
  return "Default fallback";
}

export function MarketplaceSettingsPanel() {
  const [settings, setSettings] = useState<MarketplaceSettings | null>(null);
  const [value, setValue] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/marketplace-settings", {
        credentials: "same-origin",
        headers: { Accept: "application/json" },
      });
      const body: unknown = await response.json();
      if (!response.ok) throw new Error(responseError(body));
      const next = (body as { data: MarketplaceSettings }).data;
      setSettings(next);
      setValue(String(next.maxVendorsPerOrder));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "The marketplace setting could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!settings) return;
    const maximum = Number(value);
    if (!Number.isInteger(maximum) || maximum < settings.limits.minimum || maximum > settings.limits.maximum) {
      setError(`Enter a whole number from ${settings.limits.minimum} to ${settings.limits.maximum}.`);
      setSaved(false);
      return;
    }

    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const response = await fetch("/api/admin/marketplace-settings", {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ maxVendorsPerOrder: maximum }),
      });
      const body: unknown = await response.json();
      if (!response.ok) throw new Error(responseError(body));
      const next = (body as { data: MarketplaceSettings }).data;
      setSettings(next);
      setValue(String(next.maxVendorsPerOrder));
      setSaved(true);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "The marketplace setting could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className={styles.marketplaceSettingsCard}>
      <CardHeader
        action={settings ? <StatusBadge tone={settings.source === "database" ? "success" : "muted"}>{sourceLabel(settings.source)}</StatusBadge> : undefined}
        caption="Control the size of each first-come vendor offer batch. Changes apply to future dispatch attempts."
        title="Marketplace offer policy"
      />
      {loading ? (
        <div aria-busy="true" className={styles.marketplaceSettingsState} role="status">
          <LoaderCircle aria-hidden="true" className={styles.spin} size={20} /> Loading policy
        </div>
      ) : !settings ? (
        <div className={styles.marketplaceSettingsState} role="alert">
          <AlertCircle aria-hidden="true" size={20} />
          <span>{error ?? "The marketplace setting could not be loaded."}</span>
          <button className={styles.buttonSecondary} onClick={() => void load()} type="button">Try again</button>
        </div>
      ) : (
        <form className={styles.marketplaceSettingsForm} onSubmit={save}>
          <div className={styles.marketplaceSettingsIcon} aria-hidden="true"><Settings2 size={20} /></div>
          <div className={styles.marketplaceSettingsCopy}>
            <label className={styles.fieldLabel} htmlFor="max-vendors-per-order">Maximum vendors per order</label>
            <p id="max-vendors-help">Only the first eligible vendors up to this limit receive an offer. The first valid acceptance still wins.</p>
            <div className={styles.marketplaceSettingsControl}>
              <input
                aria-describedby="max-vendors-help"
                className={styles.input}
                id="max-vendors-per-order"
                inputMode="numeric"
                max={settings.limits.maximum}
                min={settings.limits.minimum}
                onChange={(event) => { setValue(event.target.value); setSaved(false); }}
                required
                step="1"
                type="number"
                value={value}
              />
              <button className={styles.buttonPrimary} disabled={saving} type="submit">
                {saving ? <LoaderCircle aria-hidden="true" className={styles.spin} size={14} /> : <Save aria-hidden="true" size={14} />}
                {saving ? "Saving" : "Save policy"}
              </button>
            </div>
          </div>
          <div className={styles.marketplaceSettingsSecurity}>
            <ShieldCheck aria-hidden="true" size={16} />
            <span><strong>Super Admin only</strong> Every change is written to the audit log.</span>
          </div>
          <div aria-live="polite" className={styles.marketplaceSettingsFeedback}>
            {error && <span className={styles.marketplaceSettingsError}><AlertCircle aria-hidden="true" size={14} /> {error}</span>}
            {saved && <span className={styles.marketplaceSettingsSuccess}><CheckCircle2 aria-hidden="true" size={14} /> Policy saved and audited.</span>}
          </div>
        </form>
      )}
    </Card>
  );
}
