/**
 * Port of n8n "Normalize Data" from the Weekly Roadmap Aha Snapshot workflow.
 * Flattens custom pivot cells to scalars; special-cases Epic progress bar and Epic key extraction.
 */

export interface AhaPivotCell {
  rich_value?: unknown;
  text_value?: string;
  html_value?: string;
  plain_value?: unknown;
}

export interface AhaPivotColumn {
  title?: string;
  table?: string;
  field?: string;
}

/** One page from GET /api/v1/bookmarks/custom_pivots/:id?view=list */
export interface AhaPivotListResponse {
  columns: AhaPivotColumn[];
  rows: AhaPivotCell[][];
  pagination?: Array<{ current_page: number; total_pages: number }>;
}

export type NormalizedPivotRow = Record<string, string | number | null>;

const INCLUDE_EMPTY_FIELDS = true;

function stripHtml(s: string): string | undefined {
  return typeof s === "string" ? s.replace(/<[^>]*>/g, "").trim() : undefined;
}

function parseProgressBar(htmlString: string): number | null {
  const stripped = stripHtml(htmlString);
  if (!stripped) return null;
  const match = stripped.match(/(\d+)%/);
  if (match?.[1]) return parseInt(match[1], 10);
  return null;
}

function fromObject(obj: Record<string, unknown>): string | null {
  for (const k of ["name", "label", "value", "text"]) {
    const v = obj[k];
    if (typeof v === "string" && v.trim() !== "") return v.trim();
  }
  for (const k of ["values", "choices", "options", "items"]) {
    const arr = obj[k];
    if (Array.isArray(arr)) {
      const picked = arr
        .map((v: unknown) =>
          typeof v === "string"
            ? v.trim()
            : typeof v === "object" && v !== null
              ? String((v as { name?: string }).name || (v as { label?: string }).label || (v as { value?: string }).value || "").trim()
              : ""
        )
        .filter(Boolean);
      if (picked.length) return picked.join(", ");
    }
  }
  for (const [, v] of Object.entries(obj)) {
    if (typeof v === "string" && v.trim() !== "") return v.trim();
  }
  return null;
}

export function pickValue(cell: AhaPivotCell | undefined, columnTitle: string): string | number | null {
  if (!cell) return null;

  if (columnTitle === "Epic progress bar") {
    if (cell.html_value) {
      const progress = parseProgressBar(cell.html_value as string);
      if (progress !== null) return progress;
    }
    if (typeof cell.text_value === "string") {
      const progress = parseProgressBar(cell.text_value);
      if (progress !== null) return progress;
    }
    return null;
  }

  if (cell.rich_value !== undefined && cell.rich_value !== null) {
    const rv = cell.rich_value as unknown;
    if (Array.isArray(rv)) {
      const arr = rv
        .map((x) =>
          typeof x === "string" ? x.trim() : fromObject(x as Record<string, unknown>)
        )
        .filter(Boolean) as string[];
      if (arr.length) return arr.join(", ");
    } else if (typeof rv === "object") {
      const v = fromObject(rv as Record<string, unknown>);
      if (v) return v;
    } else if (typeof rv === "string" && rv.trim() !== "") {
      return rv.trim();
    }
  }

  if (typeof cell.text_value === "string" && cell.text_value.trim() !== "") {
    return cell.text_value.trim();
  }

  const fromHtml = stripHtml(cell.html_value as string);
  if (fromHtml) return fromHtml;

  if (cell.plain_value !== undefined) return cell.plain_value as string | number;

  return null;
}

/**
 * Normalize one API response page into flat row objects (no `_pagination`; suitable for mapping to DB).
 */
export function normalizePivotApiResponse(input: AhaPivotListResponse): NormalizedPivotRow[] {
  const { columns, rows } = input;
  if (!columns?.length || !rows?.length) return [];

  return rows.map((row, rowIdx) => {
    const output: NormalizedPivotRow = {};

    row.forEach((cell, index) => {
      const col = columns[index];
      if (!col) return;

      const rawKey = col.title || `${col.table}.${col.field}` || `col_${index}`;
      const key = String(rawKey).replace(/\s+/g, " ").trim();

      const value = pickValue(cell, key);

      if (INCLUDE_EMPTY_FIELDS) {
        output[key] = value !== undefined ? value : null;
      } else if (value !== undefined && value !== null && value !== "") {
        output[key] = value;
      }

      if (index === 0 && cell?.html_value) {
        const match = String(cell.html_value).match(/\/epics\/([A-Z]+-[A-Z]+-\d+)/);
        if (match?.[1]) output["Epic key"] = match[1];
      }
    });

    if (process.env.DEBUG_AHA_PIVOT === "1" && rowIdx === 0) {
      console.log(
        "[pivotNormalizer] columns:",
        columns.map((c) => c.title || `${c.table}.${c.field}`).join(" | ")
      );
    }

    return output;
  });
}
