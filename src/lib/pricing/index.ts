/**
 * Public pricing interface for the forecast engine's Pricing Agent (Phase 4/5).
 *
 * Behind this interface today: nothing wired to real cells yet — see CELL_MAP below. Once
 * filled in, callers (the Volume/Revenue calc, the assumptions UI) never change; only this
 * module's internals do. That's also the seam for eventually swapping to Salesforce CPQ.
 */

import { isPricingSheetConfigured, writeCells, readCells } from './sheetClient';

export interface PlatformPackageQuoteInput {
  packageKey: string; // e.g. "clearrecruit", "cleartalent" — see PACK - Prod tab
  employees: number;
  termMonths: number;
  discretionaryDiscount?: number; // 0.05 = 5%
}

export interface AddonQuoteInput {
  addonKey: string;
  quantity: number;
}

export interface PricingQuoteResult {
  listPriceUsd: number;
  discountedPriceUsd: number;
  effectivePepm: number;
}

/**
 * Maps this module's logical inputs to the duplicated sheet's actual input/output cells.
 *
 * NOT FILLED IN. Guessing these would risk silently wrong prices flowing into forecasts —
 * worse than not having this feature at all. To complete: duplicate "2026 Price Calculator"
 * (Google Drive file id 1nbwX8-5ygquoZYNyrgVAJmP-nBhTpAQsPeHZjb0RNb8) into a ClearGo-owned
 * copy, share it Editor with the service account, set PRICING_SHEET_ID, then inspect the
 * `PACK - Calcs` / `Quote` tabs' actual input cells (package selector, employee count, term,
 * discretionary discount) and output cells (list price, discounted price, effective PEPM) and
 * fill in the ranges below.
 */
const CELL_MAP = {
  packageInput: null as string | null, // e.g. "Quote!B3"
  employeesInput: null as string | null,
  termInput: null as string | null,
  discretionaryInput: null as string | null,
  listPriceOutput: null as string | null,
  discountedPriceOutput: null as string | null,
  effectivePepmOutput: null as string | null,
};

function requireCellMapConfigured(): void {
  const missing = Object.entries(CELL_MAP).filter(([, v]) => v === null).map(([k]) => k);
  if (missing.length > 0) {
    throw new Error(
      `Pricing sheet cell map is not configured (missing: ${missing.join(', ')}). ` +
      'See the CELL_MAP comment in src/lib/pricing/index.ts for setup steps.'
    );
  }
}

export async function getPackagePrice(input: PlatformPackageQuoteInput): Promise<PricingQuoteResult> {
  if (!isPricingSheetConfigured()) {
    throw new Error('Pricing sheet is not configured — see src/lib/pricing/sheetClient.ts.');
  }
  requireCellMapConfigured();

  await writeCells({
    [CELL_MAP.packageInput!]: input.packageKey,
    [CELL_MAP.employeesInput!]: input.employees,
    [CELL_MAP.termInput!]: input.termMonths,
    [CELL_MAP.discretionaryInput!]: input.discretionaryDiscount ?? 0,
  });

  const out = await readCells([
    CELL_MAP.listPriceOutput!,
    CELL_MAP.discountedPriceOutput!,
    CELL_MAP.effectivePepmOutput!,
  ]);

  return {
    listPriceUsd: Number(out[CELL_MAP.listPriceOutput!] ?? 0),
    discountedPriceUsd: Number(out[CELL_MAP.discountedPriceOutput!] ?? 0),
    effectivePepm: Number(out[CELL_MAP.effectivePepmOutput!] ?? 0),
  };
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function getAddonPrice(_input: AddonQuoteInput): Promise<PricingQuoteResult> {
  throw new Error('getAddonPrice is not yet implemented — needs the ADD - Main/Agents/BGC/Sourcing Max tab cell map.');
}
