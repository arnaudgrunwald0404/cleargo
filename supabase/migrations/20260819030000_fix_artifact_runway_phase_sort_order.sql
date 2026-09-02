-- 20260819000000 originally named the runway phase 'Phase 0: Artifact Runway',
-- asserting it would sort after 'Phase 00:' because '0' < ':'. That holds only
-- for codepoint comparison. Postgres's default collation and JS localeCompare
-- both de-prioritise punctuation and sort 'Phase 0:' BEFORE 'Phase 00:',
-- putting the artifact runway ahead of the commercialization gate that blocks
-- it -- visible in the admin criteria list, which orders by phase in SQL.
--
-- 20260819000000 now seeds 'Phase 01:' directly; this migration repairs any
-- database that already received the old name.
UPDATE public.criterion
   SET phase = 'Phase 01: Artifact Runway'
 WHERE context = 'launch'
   AND phase = 'Phase 0: Artifact Runway';
