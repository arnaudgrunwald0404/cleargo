/**
 * Low-level Google Sheets API client for the Pricing Agent.
 *
 * Deliberately does NOT reimplement the "2026 Price Calculator" workbook's pricing formulas
 * in code — that's exactly the trap Customer Hub's now-retired pricing_catalog POC fell into
 * (its own formula-tracing found a mislabeled column header and an unenforced discount cap
 * that a hand-reimplementation would have silently gotten wrong). Instead this drives a
 * ClearGo-owned DUPLICATE of the live sheet: write deal parameters into its input cells, read
 * back whatever the sheet itself computes. Google Sheets is the pricing engine; this is just
 * the wire.
 *
 * Auth: a Google service account (NOT the OAuth client used by Calendar integration —
 * server-to-server, no user consent flow). The service account must be shared as an Editor
 * on the ClearGo-owned duplicate sheet (never the original "2026 Price Calculator").
 */

import { google } from 'googleapis';

function getCredentials() {
  const email = process.env.PRICING_GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const privateKey = process.env.PRICING_GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.replace(/\\n/g, '\n');
  const sheetId = process.env.PRICING_SHEET_ID;
  return { email, privateKey, sheetId };
}

export function isPricingSheetConfigured(): boolean {
  const { email, privateKey, sheetId } = getCredentials();
  return Boolean(email && privateKey && sheetId);
}

function getSheetsClient() {
  const { email, privateKey } = getCredentials();
  if (!email || !privateKey) {
    throw new Error(
      'Pricing sheet is not configured. Set PRICING_GOOGLE_SERVICE_ACCOUNT_EMAIL and ' +
      'PRICING_GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY (a service account shared as Editor on the ' +
      'ClearGo-owned duplicate of "2026 Price Calculator"), and PRICING_SHEET_ID.'
    );
  }
  const auth = new google.auth.JWT({
    email,
    key: privateKey,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  return google.sheets({ version: 'v4', auth });
}

/** Writes a set of `{ range: value }` cells (A1 notation, e.g. "Quote!C4") in one batch call. */
export async function writeCells(values: Record<string, string | number>): Promise<void> {
  const { sheetId } = getCredentials();
  if (!sheetId) throw new Error('PRICING_SHEET_ID is not set.');
  const sheets = getSheetsClient();
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: sheetId,
    requestBody: {
      valueInputOption: 'USER_ENTERED',
      data: Object.entries(values).map(([range, value]) => ({ range, values: [[value]] })),
    },
  });
}

/** Reads a set of cells (A1 notation) after a write, returning `{ range: value }`. */
export async function readCells(ranges: string[]): Promise<Record<string, string | number | null>> {
  const { sheetId } = getCredentials();
  if (!sheetId) throw new Error('PRICING_SHEET_ID is not set.');
  const sheets = getSheetsClient();
  const res = await sheets.spreadsheets.values.batchGet({
    spreadsheetId: sheetId,
    ranges,
  });
  const out: Record<string, string | number | null> = {};
  (res.data.valueRanges ?? []).forEach((vr, i) => {
    out[ranges[i]] = vr.values?.[0]?.[0] ?? null;
  });
  return out;
}
