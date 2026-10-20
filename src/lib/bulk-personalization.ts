export const bulkPersonalizationPolicy = {
  maxRows: 1_000,
  maxClientFileBytes: 256_000,
  maxNameLength: 80,
  maxDetailsLength: 160,
  minimumRowQuantity: 1,
  maximumRowQuantity: 10_000,
} as const;

export type BulkPersonalizationIssueCode =
  | "MISSING_NAME"
  | "NAME_TOO_LONG"
  | "DETAILS_TOO_LONG"
  | "INVALID_QUANTITY"
  | "COLUMN_COUNT"
  | "DUPLICATE_NAME";

export interface BulkPersonalizationIssue {
  code: BulkPersonalizationIssueCode;
  message: string;
  field?: "name" | "details" | "quantity" | "row";
  severity: "error" | "warning";
}

export interface BulkPersonalizationRow {
  rowNumber: number;
  name: string;
  details: string;
  quantity: number;
  issues: BulkPersonalizationIssue[];
}

export type BulkPersonalizationRowInput = Omit<BulkPersonalizationRow, "issues">;

export interface BulkPersonalizationParseResult {
  rows: BulkPersonalizationRow[];
  duplicateNames: string[];
  fileIssues: string[];
  validRowCount: number;
  invalidRowCount: number;
  totalQuantity: number;
}

interface CsvRecord {
  rowNumber: number;
  fields: string[];
}

interface TokenizedCsv {
  records: CsvRecord[];
  issues: string[];
}

const headerNames = new Set(["name", "details", "quantity"]);

export function normalizeBulkPersonalizationName(value: string) {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("en-IN");
}

function byteLength(value: string) {
  return new TextEncoder().encode(value).byteLength;
}

function tokenizeCsv(source: string): TokenizedCsv {
  const text = source.replace(/^\uFEFF/, "");
  const records: CsvRecord[] = [];
  const issues: string[] = [];
  let fields: string[] = [];
  let field = "";
  let inQuotes = false;
  let closedQuote = false;
  let rowNumber = 1;
  let recordStartRow = 1;

  const finishField = () => {
    fields.push(field);
    field = "";
    closedQuote = false;
  };
  const finishRecord = () => {
    finishField();
    records.push({ rowNumber: recordStartRow, fields });
    fields = [];
  };

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];

    if (inQuotes) {
      if (character === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          inQuotes = false;
          closedQuote = true;
        }
      } else {
        field += character;
        if (character === "\n") rowNumber += 1;
      }
      continue;
    }

    if (closedQuote && character !== "," && character !== "\r" && character !== "\n") {
      issues.push(`Unexpected character after a closing quote on row ${rowNumber}.`);
      closedQuote = false;
      field += character;
      continue;
    }

    if (character === '"') {
      if (field.length === 0) {
        inQuotes = true;
      } else {
        issues.push(`Unexpected quote in an unquoted field on row ${rowNumber}.`);
        field += character;
      }
      continue;
    }

    if (character === ",") {
      finishField();
      continue;
    }

    if (character === "\r" || character === "\n") {
      finishRecord();
      if (character === "\r" && text[index + 1] === "\n") index += 1;
      rowNumber += 1;
      recordStartRow = rowNumber;
      continue;
    }

    field += character;
  }

  if (inQuotes) {
    issues.push(`Unclosed quoted field beginning on row ${recordStartRow}.`);
  }
  if (field.length > 0 || fields.length > 0 || closedQuote) finishRecord();

  return { records, issues };
}

function errorIssue(
  code: BulkPersonalizationIssueCode,
  message: string,
  field: BulkPersonalizationIssue["field"],
): BulkPersonalizationIssue {
  return { code, message, field, severity: "error" };
}

function annotateDuplicateNames(rows: BulkPersonalizationRow[]) {
  const rowsByName = new Map<string, BulkPersonalizationRow[]>();
  for (const row of rows) {
    const normalizedName = normalizeBulkPersonalizationName(row.name);
    if (!normalizedName) continue;
    const matches = rowsByName.get(normalizedName) ?? [];
    matches.push(row);
    rowsByName.set(normalizedName, matches);
  }

  const duplicateNames: string[] = [];
  for (const matches of rowsByName.values()) {
    if (matches.length < 2) continue;
    duplicateNames.push(matches[0].name.replace(/\s+/g, " "));
    for (const row of matches) {
      row.issues.push({
        code: "DUPLICATE_NAME",
        message: "This name appears more than once in the CSV.",
        field: "name",
        severity: "warning",
      });
    }
  }
  return duplicateNames;
}

function summarizeRows(
  rows: BulkPersonalizationRow[],
  duplicateNames: string[],
  fileIssues: string[],
): BulkPersonalizationParseResult {
  return {
    rows,
    duplicateNames,
    fileIssues,
    validRowCount: rows.filter((row) => row.issues.every((issue) => issue.severity !== "error")).length,
    invalidRowCount: rows.filter((row) => row.issues.some((issue) => issue.severity === "error")).length,
    totalQuantity: rows.reduce(
      (total, row) =>
        Number.isSafeInteger(row.quantity) && row.quantity > 0 ? total + row.quantity : total,
      0,
    ),
  };
}

export function validateBulkPersonalizationRows(
  sourceRows: ReadonlyArray<BulkPersonalizationRowInput | BulkPersonalizationRow>,
): BulkPersonalizationParseResult {
  const fileIssues =
    sourceRows.length > bulkPersonalizationPolicy.maxRows
      ? [`Personalization is limited to ${bulkPersonalizationPolicy.maxRows} rows.`]
      : [];
  const rows = sourceRows.slice(0, bulkPersonalizationPolicy.maxRows).map((source) => {
    const name = source.name.trim();
    const details = source.details.trim();
    const issues: BulkPersonalizationIssue[] = [];
    if (!name) {
      issues.push(errorIssue("MISSING_NAME", "A name is required.", "name"));
    } else if (name.length > bulkPersonalizationPolicy.maxNameLength) {
      issues.push(
        errorIssue(
          "NAME_TOO_LONG",
          `Keep names within ${bulkPersonalizationPolicy.maxNameLength} characters.`,
          "name",
        ),
      );
    }
    if (details.length > bulkPersonalizationPolicy.maxDetailsLength) {
      issues.push(
        errorIssue(
          "DETAILS_TOO_LONG",
          `Keep details within ${bulkPersonalizationPolicy.maxDetailsLength} characters.`,
          "details",
        ),
      );
    }
    if (
      !Number.isSafeInteger(source.quantity) ||
      source.quantity < bulkPersonalizationPolicy.minimumRowQuantity ||
      source.quantity > bulkPersonalizationPolicy.maximumRowQuantity
    ) {
      issues.push(
        errorIssue(
          "INVALID_QUANTITY",
          `Quantity must be a whole number from ${bulkPersonalizationPolicy.minimumRowQuantity} to ${bulkPersonalizationPolicy.maximumRowQuantity}.`,
          "quantity",
        ),
      );
    }
    return {
      rowNumber: source.rowNumber,
      name,
      details,
      quantity: source.quantity,
      issues,
    };
  });
  return summarizeRows(rows, annotateDuplicateNames(rows), fileIssues);
}

export function parseBulkPersonalizationCsv(csvText: string): BulkPersonalizationParseResult {
  const emptyResult = (fileIssues: string[]): BulkPersonalizationParseResult => ({
    rows: [],
    duplicateNames: [],
    fileIssues,
    validRowCount: 0,
    invalidRowCount: 0,
    totalQuantity: 0,
  });

  if (byteLength(csvText) > bulkPersonalizationPolicy.maxClientFileBytes) {
    return emptyResult([
      `The CSV is larger than ${bulkPersonalizationPolicy.maxClientFileBytes} bytes.`,
    ]);
  }

  const tokenized = tokenizeCsv(csvText);
  const records = tokenized.records.filter(
    (record) => !record.fields.every((field) => field.trim() === ""),
  );
  if (records.length === 0) {
    return emptyResult([...tokenized.issues, "The CSV is empty."]);
  }

  const headers = records[0].fields.map((header) => header.trim().toLocaleLowerCase("en-IN"));
  const fileIssues = [...tokenized.issues];
  const seenHeaders = new Set<string>();
  for (const header of headers) {
    if (!headerNames.has(header)) fileIssues.push(`Unknown header "${header || "(blank)"}".`);
    if (seenHeaders.has(header)) fileIssues.push(`Duplicate header "${header || "(blank)"}".`);
    seenHeaders.add(header);
  }
  if (!seenHeaders.has("name")) fileIssues.push('The required "name" header is missing.');
  if (fileIssues.length > 0) return emptyResult([...new Set(fileIssues)]);

  const dataRecords = records.slice(1);
  if (dataRecords.length > bulkPersonalizationPolicy.maxRows) {
    fileIssues.push(`The CSV contains more than ${bulkPersonalizationPolicy.maxRows} data rows.`);
  }

  const nameIndex = headers.indexOf("name");
  const detailsIndex = headers.indexOf("details");
  const quantityIndex = headers.indexOf("quantity");
  const rows = dataRecords.slice(0, bulkPersonalizationPolicy.maxRows).map((record) => {
    const issues: BulkPersonalizationIssue[] = [];
    if (record.fields.length > headers.length) {
      issues.push(
        errorIssue("COLUMN_COUNT", "The row contains more columns than the header.", "row"),
      );
    }

    const name = (record.fields[nameIndex] ?? "").trim();
    const details = detailsIndex >= 0 ? (record.fields[detailsIndex] ?? "").trim() : "";
    const rawQuantity = quantityIndex >= 0 ? (record.fields[quantityIndex] ?? "").trim() : "";
    let quantity = 1;

    if (!name) {
      issues.push(errorIssue("MISSING_NAME", "A name is required.", "name"));
    } else if (name.length > bulkPersonalizationPolicy.maxNameLength) {
      issues.push(
        errorIssue(
          "NAME_TOO_LONG",
          `Keep names within ${bulkPersonalizationPolicy.maxNameLength} characters.`,
          "name",
        ),
      );
    }
    if (details.length > bulkPersonalizationPolicy.maxDetailsLength) {
      issues.push(
        errorIssue(
          "DETAILS_TOO_LONG",
          `Keep details within ${bulkPersonalizationPolicy.maxDetailsLength} characters.`,
          "details",
        ),
      );
    }
    if (rawQuantity) {
      const parsedQuantity = Number(rawQuantity);
      if (
        !/^\d+$/.test(rawQuantity) ||
        !Number.isSafeInteger(parsedQuantity) ||
        parsedQuantity < bulkPersonalizationPolicy.minimumRowQuantity ||
        parsedQuantity > bulkPersonalizationPolicy.maximumRowQuantity
      ) {
        issues.push(
          errorIssue(
            "INVALID_QUANTITY",
            `Quantity must be a whole number from ${bulkPersonalizationPolicy.minimumRowQuantity} to ${bulkPersonalizationPolicy.maximumRowQuantity}.`,
            "quantity",
          ),
        );
      } else {
        quantity = parsedQuantity;
      }
    }

    return { rowNumber: record.rowNumber, name, details, quantity, issues };
  });

  return summarizeRows(rows, annotateDuplicateNames(rows), fileIssues);
}
