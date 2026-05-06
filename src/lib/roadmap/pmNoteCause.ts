/**
 * PM note classification stored in `epic_comment.movement_cause`.
 * Used for both movement-linked notes and general epic notes.
 *
 * Legacy rows may still be `Internal` or `External` only (RRV import).
 */
export const PM_NOTE_CAUSE_VALUES = [
  'Internal, Engineering',
  'Internal, Design',
  'Internal, Product',
  'Internal, GTM',
  'External, Third-party',
] as const;

export type PmNoteCauseNew = (typeof PM_NOTE_CAUSE_VALUES)[number];

export type PmNoteCauseLegacy = 'Internal' | 'External';

/** Any value we persist or read from the DB. */
export type PmNoteCause = PmNoteCauseNew | PmNoteCauseLegacy | null;

export const PM_NOTE_CAUSE_OPTIONS: { value: PmNoteCauseNew; label: string }[] =
  PM_NOTE_CAUSE_VALUES.map((value) => ({ value, label: value }));

export function isExternalCause(cause: string | null | undefined): boolean {
  if (!cause) return false;
  return cause.startsWith('External');
}
