"use client";

import { useState, type ReactNode } from "react";
import { BellRing, Building2, CreditCard, IndianRupee, Save, Shield, Truck, Users } from "lucide-react";
import { Card, PageHeader, StatusBadge } from "./AdminUI";
import styles from "./admin.module.css";

const tabs = [
  { id: "store", label: "Store profile", icon: Building2 },
  { id: "shipping", label: "Shipping", icon: Truck },
  { id: "payments", label: "Payments", icon: CreditCard },
  { id: "tax", label: "Tax & invoices", icon: IndianRupee },
  { id: "notifications", label: "Notifications", icon: BellRing },
  { id: "team", label: "Team & permissions", icon: Users },
] as const;

type TabId = (typeof tabs)[number]["id"];

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return <label className={styles.fieldGroup}><span className={styles.fieldLabel}>{label}{hint && <span className={styles.fieldHint}>{hint}</span>}</span>{children}</label>;
}

function SettingBlock({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return <div className={styles.settingsBlock}><div className={styles.settingsBlockHead}><div><h3>{title}</h3><p>{description}</p></div><div className={styles.settingsFields}>{children}</div></div></div>;
}

function ToggleSetting({ title, description, enabled = true }: { title: string; description: string; enabled?: boolean }) {
  const [on, setOn] = useState(enabled);
  return <div className={styles.toggleRow}><span className={styles.toggleCopy}><strong>{title}</strong><span>{description}</span></span><button aria-pressed={on} aria-label={`Toggle ${title}`} className={`${styles.switch} ${on ? styles.switchOn : ""}`} onClick={() => setOn((value) => !value)} type="button" /></div>;
}

export function SettingsPanel() {
  const [active, setActive] = useState<TabId>("store");
  const [saved, setSaved] = useState(false);

  function save() {
    setSaved(true);
    window.setTimeout(() => setSaved(false), 2400);
  }

  return (
    <>
      <PageHeader
        description="Configure the operational details behind accurate promises, safe payments, and consistent customer communication."
        eyebrow="Administration"
        title="Store settings"
      />

      <div className={styles.settingsLayout}>
        <Card className={styles.settingsNav}>
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return <button className={`${styles.settingsTab} ${active === tab.id ? styles.settingsTabActive : ""}`} key={tab.id} onClick={() => { setActive(tab.id); setSaved(false); }} type="button"><Icon size={14} />{tab.label}</button>;
          })}
        </Card>

        <Card className={styles.settingsSection}>
          <form className={styles.settingsForm} onSubmit={(event) => { event.preventDefault(); save(); }}>
            {active === "store" && (
              <>
                <SettingBlock description="Used across invoices, transactional emails, and your storefront identity." title="Business details">
                  <div className={styles.formGrid2}><Field label="Store name"><input className={styles.input} defaultValue="Naamly" /></Field><Field label="Support email"><input className={styles.input} defaultValue="care@naamly.in" type="email" /></Field></div>
                  <Field label="Business address"><textarea className={styles.textarea} defaultValue="Sector 17, Chandigarh, India" /></Field>
                </SettingBlock>
                <SettingBlock description="Choose how currency, time, and order references appear in admin." title="Regional preferences">
                  <div className={styles.formGrid2}><Field label="Currency"><select className={styles.select}><option>Indian Rupee (INR)</option></select></Field><Field label="Time zone"><select className={styles.select}><option>Asia/Kolkata (IST)</option></select></Field></div>
                  <Field label="Order ID prefix" hint="Shown before every order number"><input className={styles.input} defaultValue="NM-" /></Field>
                </SettingBlock>
              </>
            )}

            {active === "shipping" && (
              <>
                <SettingBlock description="Production time is added before carrier transit time is shown to customers." title="Production promise">
                  <div className={styles.formGrid2}><Field label="Minimum working days"><input className={styles.input} defaultValue="2" min="0" type="number" /></Field><Field label="Maximum working days"><input className={styles.input} defaultValue="4" min="0" type="number" /></Field></div>
                  <ToggleSetting description="Skip Sundays and configured holidays in dispatch estimates." title="Use business-day calculations" />
                </SettingBlock>
                <SettingBlock description="Set transparent shipping prices and enable only services you can fulfil." title="Delivery methods">
                  <ToggleSetting description="Configure a carrier and verified rate before enabling." enabled={false} title="Standard delivery" />
                  <ToggleSetting description="Shown only for serviceable PIN codes." enabled={false} title="Express delivery" />
                  <ToggleSetting description="Set a funded threshold before publishing this offer." enabled={false} title="Free-shipping threshold" />
                </SettingBlock>
              </>
            )}

            {active === "payments" && (
              <>
                <SettingBlock description="Payments are marked complete only after server verification." title="Payment gateway">
                  <div className={styles.detailHero}><span className={styles.metricIcon}><CreditCard size={16} /></span><div><h4>Razorpay</h4><p>Add merchant credentials and complete webhook verification.</p></div><StatusBadge tone="warning">Not connected</StatusBadge></div>
                  <ToggleSetting description="Accept only the payment methods enabled in your gateway account." enabled={false} title="Online payments" />
                  <ToggleSetting description="Available only to eligible PIN codes and basket values." enabled={false} title="Cash on delivery" />
                </SettingBlock>
                <SettingBlock description="These controls reduce accidental duplicate payments and inconsistent states." title="Payment safeguards">
                  <ToggleSetting description="Verify signatures before updating an order to paid." enabled={false} title="Webhook verification" />
                  <ToggleSetting description="Safely ignore repeated gateway callbacks." enabled={false} title="Idempotent processing" />
                </SettingBlock>
              </>
            )}

            {active === "tax" && (
              <>
                <SettingBlock description="Confirm tax treatment with your accountant before publishing." title="GST configuration">
                  <div className={styles.formGrid2}><Field label="GSTIN"><input className={styles.input} placeholder="Enter GSTIN" /></Field><Field label="Default tax rate"><select className={styles.select}><option>18%</option><option>12%</option><option>5%</option></select></Field></div>
                  <ToggleSetting description="Product prices on the storefront already include applicable tax." title="Prices include tax" />
                </SettingBlock>
                <SettingBlock description="Create sequential, auditable invoices after payment confirmation." title="Invoices">
                  <div className={styles.formGrid2}><Field label="Invoice prefix"><input className={styles.input} defaultValue="NMLY/26/" /></Field><Field label="Next number"><input className={styles.input} defaultValue="10483" /></Field></div>
                </SettingBlock>
              </>
            )}

            {active === "notifications" && (
              <>
                <SettingBlock description="Send only relevant, transactional updates through configured providers." title="Customer notifications">
                  <ToggleSetting description="Sent when payment and order creation are confirmed." title="Order confirmation email" />
                  <ToggleSetting description="Sent when tracking is attached and the parcel is handed over." title="Shipment update" />
                  <ToggleSetting description="Ask for feedback after confirmed delivery." title="Review request" />
                </SettingBlock>
                <SettingBlock description="Decide which operational changes should alert your team." title="Admin alerts">
                  <ToggleSetting description="Notify the operations inbox for each verified order." title="New paid order" />
                  <ToggleSetting description="Alert when inventory crosses a product threshold." title="Low stock" />
                  <ToggleSetting description="Flag artwork generation or production-output failures." title="Artwork failure" />
                </SettingBlock>
              </>
            )}

            {active === "team" && (
              <>
                <SettingBlock description="Invite staff with the smallest set of permissions they need." title="Staff access">
                  <div className={styles.detailRows}>
                    <div className={styles.detailRow}><span>Aashi Sharma · aashi@naamly.in</span><strong>Owner</strong></div>
                    <div className={styles.detailRow}><span>Production Desk · production@naamly.in</span><strong>Fulfillment</strong></div>
                    <div className={styles.detailRow}><span>Customer Care · care@naamly.in</span><strong>Support</strong></div>
                  </div>
                  <button className={styles.buttonSecondary} type="button"><Users size={13} /> Invite staff member</button>
                </SettingBlock>
                <SettingBlock description="Sensitive actions are recorded to support accountability." title="Security">
                  <ToggleSetting description="Require an additional sign-in factor for every staff member." title="Two-factor authentication" />
                  <div className={styles.detailHero}><span className={styles.metricIcon}><Shield size={16} /></span><div><h4>Audit log enabled</h4><p>Role, refund, payment and fulfillment changes are recorded.</p></div></div>
                </SettingBlock>
              </>
            )}

            <div className={styles.formFooter}>
              {saved && <span className={styles.savedNote}>Changes saved successfully.</span>}
              <button className={styles.buttonSecondary} type="button">Discard</button>
              <button className={styles.buttonPrimary} type="submit"><Save size={13} /> Save changes</button>
            </div>
          </form>
        </Card>
      </div>
    </>
  );
}
