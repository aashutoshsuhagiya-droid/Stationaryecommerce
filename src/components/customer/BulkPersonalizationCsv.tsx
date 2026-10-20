"use client";

import { ChangeEvent, useMemo, useRef, useState } from "react";
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Download,
  FileSpreadsheet,
  Plus,
  Trash2,
  Upload,
  X,
} from "lucide-react";

import {
  bulkPersonalizationPolicy,
  parseBulkPersonalizationCsv,
  validateBulkPersonalizationRows,
  type BulkPersonalizationParseResult,
  type BulkPersonalizationRowInput,
} from "@/lib/bulk-personalization";

import styles from "./customer.module.css";

const PAGE_SIZE = 25;

export interface BulkPersonalizationSelection {
  rows: BulkPersonalizationRowInput[];
  allowDuplicateNames: boolean;
  isValid: boolean;
  totalQuantity: number;
}

const emptySelection: BulkPersonalizationSelection = {
  rows: [],
  allowDuplicateNames: false,
  isValid: true,
  totalQuantity: 0,
};

function toSelection(
  result: BulkPersonalizationParseResult | null,
  allowDuplicateNames: boolean,
  hasFileError = false,
): BulkPersonalizationSelection {
  if (!result) return { ...emptySelection, isValid: !hasFileError };
  return {
    rows: result.rows.map(({ rowNumber, name, details, quantity }) => ({
      rowNumber,
      name,
      details,
      quantity,
    })),
    allowDuplicateNames,
    isValid:
      !hasFileError &&
      result.fileIssues.length === 0 &&
      result.invalidRowCount === 0 &&
      (result.duplicateNames.length === 0 || allowDuplicateNames),
    totalQuantity: result.totalQuantity,
  };
}

export default function BulkPersonalizationCsv({
  onChange,
}: {
  onChange: (selection: BulkPersonalizationSelection) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [result, setResult] = useState<BulkPersonalizationParseResult | null>(null);
  const [fileName, setFileName] = useState("");
  const [fileIssues, setFileIssues] = useState<string[]>([]);
  const [allowDuplicateNames, setAllowDuplicateNames] = useState(false);
  const [reading, setReading] = useState(false);
  const [page, setPage] = useState(1);

  const pageCount = Math.max(1, Math.ceil((result?.rows.length ?? 0) / PAGE_SIZE));
  const visibleRows = useMemo(
    () => result?.rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE) ?? [],
    [page, result],
  );

  function publish(
    nextResult: BulkPersonalizationParseResult | null,
    nextAllowDuplicates = allowDuplicateNames,
    nextFileIssues = fileIssues,
  ) {
    onChange(toSelection(nextResult, nextAllowDuplicates, nextFileIssues.length > 0));
  }

  function clearImport() {
    setResult(null);
    setFileName("");
    setFileIssues([]);
    setAllowDuplicateNames(false);
    setPage(1);
    if (inputRef.current) inputRef.current.value = "";
    onChange(emptySelection);
  }

  async function importCsv(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    const issues: string[] = [];
    if (!file.name.toLocaleLowerCase("en-IN").endsWith(".csv")) {
      issues.push("Choose a .csv file created from the sample template.");
    }
    if (file.size > bulkPersonalizationPolicy.maxClientFileBytes) {
      issues.push(
        `Keep the CSV below ${Math.round(bulkPersonalizationPolicy.maxClientFileBytes / 1_000)} KB.`,
      );
    }
    setFileName(file.name);
    if (issues.length > 0) {
      setFileIssues(issues);
      publish(result, allowDuplicateNames, issues);
      return;
    }

    setReading(true);
    try {
      const parsed = parseBulkPersonalizationCsv(await file.text());
      if (parsed.fileIssues.length > 0) {
        setFileIssues(parsed.fileIssues);
        publish(result, allowDuplicateNames, parsed.fileIssues);
        return;
      }
      setFileIssues([]);
      setResult(parsed);
      setAllowDuplicateNames(false);
      setPage(1);
      publish(parsed, false, []);
    } catch {
      const readIssues = ["The CSV could not be read. Choose the file again."];
      setFileIssues(readIssues);
      publish(result, allowDuplicateNames, readIssues);
    } finally {
      setReading(false);
    }
  }

  function updateRow(
    rowNumber: number,
    field: "name" | "details" | "quantity",
    value: string,
  ) {
    if (!result) return;
    const nextRows = result.rows.map((row) =>
      row.rowNumber === rowNumber
        ? {
            rowNumber: row.rowNumber,
            name: field === "name" ? value : row.name,
            details: field === "details" ? value : row.details,
            quantity:
              field === "quantity"
                ? value.trim() === "" ? Number.NaN : Number(value)
                : row.quantity,
          }
        : row,
    );
    const next = validateBulkPersonalizationRows(nextRows);
    setResult(next);
    publish(next);
  }

  function removeRow(rowNumber: number) {
    if (!result) return;
    const next = validateBulkPersonalizationRows(
      result.rows.filter((row) => row.rowNumber !== rowNumber),
    );
    setResult(next);
    const nextPageCount = Math.max(1, Math.ceil(next.rows.length / PAGE_SIZE));
    setPage((current) => Math.min(current, nextPageCount));
    publish(next);
  }

  function addRow() {
    const currentRows = result?.rows ?? [];
    if (currentRows.length >= bulkPersonalizationPolicy.maxRows) return;
    const nextRowNumber = Math.max(1, ...currentRows.map((row) => row.rowNumber)) + 1;
    const next = validateBulkPersonalizationRows([
      ...currentRows,
      { rowNumber: nextRowNumber, name: "", details: "", quantity: 1 },
    ]);
    setResult(next);
    const nextPage = Math.max(1, Math.ceil(next.rows.length / PAGE_SIZE));
    setPage(nextPage);
    publish(next);
  }

  function changeDuplicatePolicy(checked: boolean) {
    setAllowDuplicateNames(checked);
    publish(result, checked);
  }

  function keepCurrentRows() {
    setFileIssues([]);
    setFileName(result ? fileName : "");
    if (inputRef.current) inputRef.current.value = "";
    publish(result, allowDuplicateNames, []);
  }

  const duplicateBlocked = Boolean(result?.duplicateNames.length) && !allowDuplicateNames;

  return (
    <section className={styles.csvImport} aria-labelledby="personalization-list-title">
      <div className={styles.csvHeading}>
        <div>
          <p className={styles.eyebrow}>Optional name list</p>
          <h3 id="personalization-list-title">Import personalization rows</h3>
          <p>Use one row per name. The quantity column is the number of items for that entry.</p>
        </div>
        <a
          className={styles.csvDownload}
          href="/templates/bulk-personalization-sample.csv"
          download
        >
          <Download aria-hidden="true" /> Sample CSV
        </a>
      </div>

      <label className={styles.csvDropzone}>
        <input
          ref={inputRef}
          type="file"
          accept=".csv,text/csv"
          onChange={importCsv}
          disabled={reading}
        />
        {reading ? <FileSpreadsheet className={styles.spin} aria-hidden="true" /> : <Upload aria-hidden="true" />}
        <span>
          <strong>{reading ? "Reading CSV..." : "Choose a CSV file"}</strong>
          <small>Required column: name. Optional: details and quantity.</small>
        </span>
      </label>

      {fileIssues.length > 0 && (
        <div className={styles.csvFileError} role="alert">
          <CircleAlert aria-hidden="true" />
          <div>
            <strong>{fileName || "CSV"} was not imported</strong>
            <ul>{fileIssues.map((issue) => <li key={issue}>{issue}</li>)}</ul>
            {result?.rows.length ? (
              <button type="button" onClick={keepCurrentRows}>Keep the current rows</button>
            ) : null}
          </div>
        </div>
      )}

      {result && (
        <>
          <div className={styles.csvSummary} aria-live="polite">
            <span className={result.invalidRowCount ? styles.csvSummaryError : styles.csvSummarySuccess}>
              {result.invalidRowCount ? <CircleAlert aria-hidden="true" /> : <CheckCircle2 aria-hidden="true" />}
              <strong>{result.validRowCount}</strong> valid
            </span>
            <span><strong>{result.invalidRowCount}</strong> need fixes</span>
            <span><strong>{result.totalQuantity}</strong> total quantity</span>
            <button type="button" onClick={clearImport} title="Clear imported rows">
              <X aria-hidden="true" /> Clear
            </button>
          </div>

          {result.duplicateNames.length > 0 && (
            <label className={`${styles.consentRow} ${styles.csvDuplicatePolicy}`}>
              <input
                type="checkbox"
                checked={allowDuplicateNames}
                onChange={(event) => changeDuplicatePolicy(event.target.checked)}
              />
              <span>
                Keep duplicate names as separate entries. Found: {result.duplicateNames.join(", ")}.
              </span>
            </label>
          )}

          <div className={styles.csvTableWrap}>
            <table className={styles.csvTable}>
              <thead>
                <tr><th>CSV row</th><th>Name</th><th>Details</th><th>Quantity</th><th>Status</th><th><span className={styles.srOnly}>Actions</span></th></tr>
              </thead>
              <tbody>
                {visibleRows.map((row) => {
                  const errors = row.issues.filter((issue) => issue.severity === "error");
                  const warnings = row.issues.filter((issue) => issue.severity === "warning");
                  return (
                    <tr key={row.rowNumber} className={errors.length ? styles.csvInvalidRow : ""}>
                      <td>{row.rowNumber}</td>
                      <td><input aria-label={`Name on CSV row ${row.rowNumber}`} value={row.name} maxLength={bulkPersonalizationPolicy.maxNameLength + 20} onChange={(event) => updateRow(row.rowNumber, "name", event.target.value)} /></td>
                      <td><input aria-label={`Details on CSV row ${row.rowNumber}`} value={row.details} maxLength={bulkPersonalizationPolicy.maxDetailsLength + 20} onChange={(event) => updateRow(row.rowNumber, "details", event.target.value)} /></td>
                      <td><input aria-label={`Quantity on CSV row ${row.rowNumber}`} type="number" inputMode="numeric" min={bulkPersonalizationPolicy.minimumRowQuantity} max={bulkPersonalizationPolicy.maximumRowQuantity} value={Number.isFinite(row.quantity) ? row.quantity : ""} onChange={(event) => updateRow(row.rowNumber, "quantity", event.target.value)} /></td>
                      <td>
                        {errors.length ? <span className={styles.csvRowIssue} title={errors.map((issue) => issue.message).join(" ")}><CircleAlert aria-hidden="true" /> {errors[0].message}</span>
                          : warnings.length ? <span className={styles.csvRowWarning} title={warnings.map((issue) => issue.message).join(" ")}><CircleAlert aria-hidden="true" /> Duplicate</span>
                            : <span className={styles.csvRowValid}><CheckCircle2 aria-hidden="true" /> Ready</span>}
                      </td>
                      <td><button type="button" onClick={() => removeRow(row.rowNumber)} title={`Remove CSV row ${row.rowNumber}`}><Trash2 aria-hidden="true" /><span className={styles.srOnly}>Remove CSV row {row.rowNumber}</span></button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className={styles.csvTableFooter}>
            <button type="button" className={styles.csvAddRow} onClick={addRow} disabled={result.rows.length >= bulkPersonalizationPolicy.maxRows}><Plus aria-hidden="true" /> Add row</button>
            {pageCount > 1 && (
              <div className={styles.csvPagination}>
                <button type="button" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page === 1} title="Previous rows"><ChevronLeft aria-hidden="true" /></button>
                <span>Page {page} of {pageCount}</span>
                <button type="button" onClick={() => setPage((current) => Math.min(pageCount, current + 1))} disabled={page === pageCount} title="Next rows"><ChevronRight aria-hidden="true" /></button>
              </div>
            )}
          </div>

          {(result.invalidRowCount > 0 || duplicateBlocked) && (
            <p className={styles.csvBlockingMessage} role="alert">
              Fix invalid rows{duplicateBlocked ? " and confirm the duplicate-name policy" : ""} before submitting.
            </p>
          )}
        </>
      )}
    </section>
  );
}
