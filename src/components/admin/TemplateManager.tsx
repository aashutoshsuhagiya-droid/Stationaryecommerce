"use client";

import { useMemo, useState } from "react";
import { Copy, Grid2X2, Plus, Search, SlidersHorizontal, Sparkles } from "lucide-react";
import { templates } from "./admin-data";
import { Card, CardHeader, PageHeader, StatusBadge, statusTone } from "./AdminUI";
import styles from "./admin.module.css";

export function TemplateManager() {
  const [selectedId, setSelectedId] = useState<(typeof templates)[number]["id"]>(templates[0].id);
  const [query, setQuery] = useState("");
  const [sampleName, setSampleName] = useState("Aarav Mehta");
  const [autoScale, setAutoScale] = useState(true);

  const selected = templates.find((template) => template.id === selectedId) ?? templates[0];
  const visible = useMemo(() => templates.filter((template) => template.name.toLowerCase().includes(query.toLowerCase()) || template.collection.toLowerCase().includes(query.toLowerCase())), [query]);

  return (
    <>
      <PageHeader
        actions={
          <>
            <button className={styles.buttonSecondary} type="button"><Grid2X2 size={14} /> Collections</button>
            <button className={styles.buttonPrimary} type="button"><Plus size={14} /> New template</button>
          </>
        }
        description="Control exactly how names, artwork, and production rules come together across every personalized product."
        eyebrow="Personalization studio"
        title="Design templates"
      />

      <div className={styles.templateLayout}>
        <Card>
          <div className={styles.toolbar}>
            <label className={styles.localSearch}>
              <span className={styles.srOnly}>Search templates</span>
              <Search size={14} />
              <input className={styles.input} onChange={(event) => setQuery(event.target.value)} placeholder="Search templates or collections" type="search" value={query} />
            </label>
            <select aria-label="Template status" className={styles.select}><option>All statuses</option><option>Live</option><option>Draft</option></select>
            <button className={styles.buttonSecondary} type="button"><SlidersHorizontal size={13} /> Filters</button>
            <span className={styles.resultCount}>{visible.length} templates</span>
          </div>

          <div className={styles.templateGrid}>
            {visible.map((template) => (
              <article
                className={`${styles.templateCard} ${selectedId === template.id ? styles.templateSelected : ""}`}
                key={template.id}
                onClick={() => setSelectedId(template.id)}
              >
                <div className={styles.designPreview} data-bg={template.bg}><span className={styles.mockLabel}>{template.name}</span></div>
                <div className={styles.templateInfo}>
                  <div className={styles.templateInfoTop}><h3>{template.name}</h3><StatusBadge tone={statusTone(template.status)}>{template.status}</StatusBadge></div>
                  <p>{template.collection} · {template.products} products · {template.uses} uses</p>
                </div>
              </article>
            ))}
          </div>
        </Card>

        <Card className={styles.editorPanel}>
          <CardHeader
            action={<button aria-label="Duplicate template" className={styles.iconButton} type="button"><Copy size={14} /></button>}
            caption={`${selected.collection} collection`}
            title={selected.name}
          />
          <div className={styles.editorPreview}>
            <div className={styles.designPreview} data-bg={selected.bg}><span className={styles.mockLabel}>{sampleName || "Your name"}</span></div>
          </div>
          <div className={styles.editorFields}>
            <label className={styles.fieldGroup}>
              <span className={styles.fieldLabel}>Preview text <span className={styles.fieldHint}>{sampleName.length}/28</span></span>
              <input className={styles.input} maxLength={28} onChange={(event) => setSampleName(event.target.value)} value={sampleName} />
            </label>
            <div className={styles.fieldGrid}>
              <label className={styles.fieldGroup}><span className={styles.fieldLabel}>Font style</span><select className={styles.select}><option>Manrope Bold</option><option>Rounded Sans</option><option>Classic Serif</option></select></label>
              <label className={styles.fieldGroup}><span className={styles.fieldLabel}>Text colour</span><select className={styles.select}><option>Navy</option><option>Teal</option><option>Charcoal</option></select></label>
            </div>
            <div className={styles.fieldGrid}>
              <label className={styles.fieldGroup}><span className={styles.fieldLabel}>Output width</span><input className={styles.input} defaultValue="120 mm" /></label>
              <label className={styles.fieldGroup}><span className={styles.fieldLabel}>Resolution</span><input className={styles.input} defaultValue="300 DPI" /></label>
            </div>
            <div className={styles.toggleRow}>
              <span className={styles.toggleCopy}><strong>Auto-scale long names</strong><span>Keep text within the safe print area.</span></span>
              <button aria-pressed={autoScale} aria-label="Toggle auto scaling" className={`${styles.switch} ${autoScale ? styles.switchOn : ""}`} onClick={() => setAutoScale((value) => !value)} type="button" />
            </div>
            <button className={styles.buttonPrimary} type="button"><Sparkles size={13} /> Open full template editor</button>
          </div>
        </Card>
      </div>
    </>
  );
}
