/**
 * One-off comparison: production-style "old" epic due dates vs current branch computedStageEndDates.
 * Stages match default traditional release schedule (calendar-day durations in DB).
 *
 * Anchor date: Cohort 1 / target launch — inferred from production sample where rating_timing=2
 * rows often show condition_due_date 2026-03-02 (start of GTM) → target ≈ 2026-04-06 (+35 cal days).
 */

const TARGET_LAUNCH = "2026-04-06"; // Cohort 1 start

const stages = [
  { id: 1, sort_order: 1, duration_days: 31, name: "Product Definition Complete" },
  { id: 2, sort_order: 2, duration_days: 14, name: "GTM Access and Prep" },
  { id: 3, sort_order: 3, duration_days: 21, name: "Internal Readiness" },
  { id: 4, sort_order: 4, duration_days: 28, name: "Cohort 1 Live" },
  { id: 5, sort_order: 5, duration_days: null, name: "GA · Cohort 2" },
];

function parseLocal(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function toIso(d) {
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${mo}-${day}`;
}

// ─── OLD (origin/main epic page): calculatedDaysBeforeLaunch / After + calendar setDate ───
function buildOldMaps(fetchedReleaseStages) {
  const calculatedDaysBeforeLaunch = new Map();
  const calculatedDaysAfterLaunch = new Map();

  const lastPreLaunchStage = fetchedReleaseStages
    .filter((stage) => stage.duration_days !== null && stage.sort_order <= 3)
    .sort((a, b) => b.sort_order - a.sort_order)[0];
  const lastPreLaunchSortOrder = lastPreLaunchStage?.sort_order ?? 3;

  fetchedReleaseStages.forEach((stage) => {
    if (stage.sort_order <= lastPreLaunchSortOrder && stage.duration_days !== null) {
      const targetStageDuration = stage.duration_days || 0;
      const stagesAfterTarget = fetchedReleaseStages.filter(
        (s) =>
          s.sort_order > stage.sort_order &&
          s.sort_order <= lastPreLaunchSortOrder &&
          s.duration_days !== null
      );
      const totalDaysBefore =
        targetStageDuration + stagesAfterTarget.reduce((sum, s) => sum + (s.duration_days || 0), 0);
      calculatedDaysBeforeLaunch.set(stage.id, totalDaysBefore);
    } else if (stage.sort_order > lastPreLaunchSortOrder && stage.duration_days !== null) {
      const stagesFromPreLaunchToTarget = fetchedReleaseStages.filter(
        (s) =>
          s.sort_order > lastPreLaunchSortOrder &&
          s.sort_order <= stage.sort_order &&
          s.duration_days !== null
      );
      const totalDaysAfter = stagesFromPreLaunchToTarget.reduce((sum, s) => sum + (s.duration_days || 0), 0);
      calculatedDaysAfterLaunch.set(stage.id, totalDaysAfter);
    }
  });

  return { calculatedDaysBeforeLaunch, calculatedDaysAfterLaunch };
}

function oldDueDate(targetDateStr, effectiveId, maps) {
  const { calculatedDaysBeforeLaunch, calculatedDaysAfterLaunch } = maps;
  const targetDate = parseLocal(targetDateStr);
  const daysBefore = calculatedDaysBeforeLaunch.get(effectiveId);
  const daysAfter = calculatedDaysAfterLaunch.get(effectiveId);
  const dueDate = new Date(targetDate);
  if (daysBefore !== undefined) {
    dueDate.setDate(dueDate.getDate() - daysBefore);
  } else if (daysAfter !== undefined) {
    dueDate.setDate(dueDate.getDate() + daysAfter);
  } else {
    return null;
  }
  return toIso(dueDate);
}

// ─── NEW (current branch): business-day walk — same as page.tsx computedStageEndDates ───
function subtractBiz(end, days) {
  const d = new Date(end);
  let rem = days;
  while (rem > 0) {
    d.setDate(d.getDate() - 1);
    if (d.getDay() !== 0 && d.getDay() !== 6) rem--;
  }
  return d;
}

function addBiz(start, days) {
  const d = new Date(start);
  let rem = days;
  while (rem > 0) {
    d.setDate(d.getDate() + 1);
    if (d.getDay() !== 0 && d.getDay() !== 6) rem--;
  }
  return d;
}

function buildNewStageEndDates(fetchedReleaseStages, targetDateStr) {
  const sorted = [...fetchedReleaseStages].sort((a, b) => a.sort_order - b.sort_order);
  const getEffectiveDuration = (s) => s.duration_days ?? 0;
  const totalPreLaunchBizDays = sorted
    .filter((s) => s.sort_order < (sorted[sorted.length - 1]?.sort_order ?? 0))
    .reduce((sum, s) => sum + (getEffectiveDuration(s) ?? 0), 0);

  const anchorDate = parseLocal(targetDateStr);
  const startDate = subtractBiz(anchorDate, totalPreLaunchBizDays);
  let cursor = new Date(startDate);
  const stageStarts = [];
  for (const stage of sorted) {
    const dur = getEffectiveDuration(stage) ?? 0;
    stageStarts.push({ id: stage.id, date: new Date(cursor) });
    cursor = dur > 0 ? addBiz(cursor, dur) : new Date(cursor);
  }
  const computed = new Map();
  for (let i = 0; i < stageStarts.length; i++) {
    const endDate =
      i < stageStarts.length - 1 ? stageStarts[i + 1].date : anchorDate;
    computed.set(stageStarts[i].id, toIso(endDate));
  }
  return { computed, stageStarts, totalPreLaunchBizDays };
}

// ─── Chart traditional (ReleaseStagesChart useTimelineData): calendar walk ───
function buildChartTraditionalEnds(stages, releaseDateStr) {
  const sortedStages = [...stages].sort((a, b) => a.sort_order - b.sort_order);
  const cohort1Stage = sortedStages.find((s) => s.name.toLowerCase().includes("cohort 1"));
  const preLaunchDays = cohort1Stage
    ? sortedStages
        .filter((s) => s.sort_order < cohort1Stage.sort_order && s.duration_days != null)
        .reduce((sum, s) => sum + (s.duration_days ?? 0), 0)
    : 0;
  const anchorDate = parseLocal(releaseDateStr);
  const startDate =
    anchorDate && preLaunchDays > 0
      ? (() => {
          const d = new Date(anchorDate);
          d.setDate(d.getDate() - preLaunchDays);
          return d;
        })()
      : new Date(anchorDate);

  let cursor = new Date(startDate);
  const ends = new Map();
  const starts = [];
  for (const stage of sortedStages) {
    const dur = stage.duration_days ?? 0;
    starts.push({ id: stage.id, start: new Date(cursor) });
    cursor = dur > 0 ? (() => { const d = new Date(cursor); d.setDate(d.getDate() + dur); return d; })() : new Date(cursor);
  }
  for (let i = 0; i < starts.length; i++) {
    const end =
      i < starts.length - 1
        ? starts[i + 1].start
        : parseLocal(releaseDateStr);
    ends.set(starts[i].id, toIso(end));
  }
  return ends;
}

const oldMaps = buildOldMaps(stages);
const newResult = buildNewStageEndDates(stages, TARGET_LAUNCH);
const chartEnds = buildChartTraditionalEnds(stages, TARGET_LAUNCH);

console.log("Assumptions: traditional release, anchor (Cohort 1 start) =", TARGET_LAUNCH);
console.log(
  "  (Production sample: many rating_timing=2 rows had condition_due_date 2026-03-02 → ~35 calendar days before anchor → anchor ~ 2026-04-06.)\n"
);
console.log("Pre-launch sum — OLD maps use stages with sort_order <= 3 only for 'days before'.");
console.log("Pre-launch sum — NEW code sums all stages with sort_order < last stage's sort_order:", newResult.totalPreLaunchBizDays, "business days (not calendar).\n");

console.log("| stage id | stage (short) | OLD (cal days from anchor) | NEW matrix (biz-day segment ends) | Chart (cal segment ends) |");
console.log("|----------|----------------|----------------------------|-------------------------------------|---------------------------|");

for (const s of stages) {
  if (s.duration_days == null && s.sort_order === 5) continue;
  const o = oldDueDate(TARGET_LAUNCH, s.id, oldMaps);
  const n = newResult.computed.get(s.id) ?? "—";
  const c = chartEnds.get(s.id) ?? "—";
  const short = s.name.split(" ")[0] + (s.id <= 2 ? "…" : "");
  console.log(`| ${s.id} | ${s.name.slice(0, 22).padEnd(22)} | ${(o ?? "—").padEnd(10)} | ${n.padEnd(35)} | ${c.padEnd(25)} |`);
}

console.log("\nSample criterion from production JSON (rating_timing = stage id):");
console.log("  rating_timing 2  (GTM): prod condition_due_date often 2026-03-02");
console.log("  OLD id=2:", oldDueDate(TARGET_LAUNCH, 2, oldMaps));
console.log("  NEW id=2:", newResult.computed.get(2));
console.log("  CHART id=2:", chartEnds.get(2));
