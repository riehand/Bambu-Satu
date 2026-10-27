// Explicitly excluded from npm test. Synthetic database only; no mocked Prisma.
import { afterAll, beforeAll, expect, it } from "vitest";
import { PrismaClient, Prisma } from "@prisma/client";
import { createHash } from "node:crypto";
import { readFileSync, appendFileSync } from "node:fs";
import { join } from "node:path";
import { assertRehearsalEnvironment } from "../../scripts/phase2-safety.mjs";
import { syntheticQuestionSet, fixtureId } from "../fixtures/assessment";
import { prisma } from "@/lib/prisma";
import { startAssessmentSession, saveAnswers, submitAssessment, getSession, getAssessmentHistory, getQuota } from "@/lib/assessment/service";

assertRehearsalEnvironment();
const observer = new PrismaClient({ log: [] });
const participant = fixtureId(902), other = fixtureId(903);
const tableNames = ["academic_periods", "assessment_question_sets", "questions", "assessment_sessions", "assessment_answers", "assessment_scores", "reports"];
const fixture = syntheticQuestionSet();
function evidence(check: string, details: Record<string, unknown>) {
  if (!process.env.PHASE2_EVIDENCE_DIR) throw new Error("Evidence directory required");
  appendFileSync(join(process.env.PHASE2_EVIDENCE_DIR, "checks.jsonl"), JSON.stringify({ check, ...details }) + "\n");
}

beforeAll(async () => {
  const [identity] = await prisma.$queryRaw<{ token: string; version: string }[]>`
    SELECT token, current_setting('server_version_num') AS version FROM rehearsal.identity`;
  expect(identity.token).toBe(process.env.PHASE2_REHEARSAL_TOKEN);
  expect(identity.version).toMatch(/^17\d{4}$/);
  const [target] = await prisma.$queryRaw<{ database: string; address: string; port: number; pid: number }[]>`
    SELECT current_database() AS database, inet_server_addr()::text AS address, inet_server_port() AS port, pg_backend_pid() AS pid`;
  expect(target.database).toBe("wellbeing_phase2_rehearsal");
  expect(target.port).toBe(5432);
  evidence("connected_isolated_target", { ...target, serverVersionNumber: identity.version, markerMatched: true });
  expect(await prisma.assessmentSession.count()).toBe(0);
});
afterAll(async () => { await Promise.all([prisma.$disconnect(), observer.$disconnect()]); });

it("validates all migration checksums, seven tables, RLS, eight FKs and five enabled triggers", async () => {
  const rows = await prisma.$queryRaw<{ migration_name: string; checksum: string; applied: boolean }[]>`
    SELECT migration_name, checksum, finished_at IS NOT NULL AND rolled_back_at IS NULL AS applied FROM _prisma_migrations ORDER BY migration_name`;
  expect(rows).toHaveLength(3);
  for (const row of rows) {
    expect(row.applied).toBe(true);
    expect(row.checksum).toBe(createHash("sha256").update(readFileSync(`prisma/migrations/${row.migration_name}/migration.sql`)).digest("hex"));
  }
  evidence("migration_history", { migrations: rows, allChecksumsMatched: true });
  const tables = await prisma.$queryRaw<{ relname: string; relrowsecurity: boolean }[]>`
    SELECT c.relname,c.relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r'`;
  expect(tables.filter(t => tableNames.includes(t.relname))).toHaveLength(7);
  expect(tables.filter(t => tableNames.includes(t.relname)).every(t => t.relrowsecurity)).toBe(true);
  const [fk] = await prisma.$queryRaw<{ count: number }[]>`SELECT count(*)::int AS count FROM pg_constraint WHERE contype='f' AND conrelid::regclass::text IN ('academic_periods','assessment_question_sets','questions','assessment_sessions','assessment_answers','assessment_scores','reports')`;
  expect(fk.count).toBe(8);
  const [triggers] = await prisma.$queryRaw<{ count: number }[]>`SELECT count(*)::int AS count FROM pg_trigger WHERE tgname LIKE 'phase2_%' AND tgenabled='O' AND NOT tgisinternal`;
  expect(triggers.count).toBe(5);
  evidence("assessment_catalog", { tables: 7, rlsEnabled: true, foreignKeys: fk.count, enabledTriggers: triggers.count });
});

it("preserves baseline profiles/Auth triggers and runs registration/email synchronization", async () => {
  const differences = await prisma.$queryRaw`(SELECT * FROM rehearsal.profile_before EXCEPT SELECT * FROM public.users) UNION ALL (SELECT * FROM public.users EXCEPT SELECT * FROM rehearsal.profile_before)`;
  expect(differences).toEqual([]);
  const triggerDiff = await prisma.$queryRaw`(SELECT * FROM rehearsal.auth_triggers_before EXCEPT SELECT tgname,pg_get_triggerdef(oid) FROM pg_trigger WHERE tgrelid='auth.users'::regclass AND NOT tgisinternal)`;
  expect(triggerDiff).toEqual([]);
  for (const [id, institutional] of [[participant, "TEST00902"], [other, "TEST00903"]]) {
    const meta = JSON.stringify({ full_name: "SYNTHETIC ONLY", phone_number: "08000000000", institutional_id: institutional, user_type: "STUDENT", role: "SUPERADMIN" });
    await prisma.$executeRaw`INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES (${id}::uuid,${institutional + "@example.test"},${meta}::jsonb)`;
    expect(await prisma.user.findUnique({ where: { id } })).toMatchObject({ role: "PARTICIPANT", isActive: true });
  }
  await prisma.$executeRaw`UPDATE auth.users SET email='changed@example.test' WHERE id=${other}::uuid`;
  expect(await prisma.user.findUnique({ where: { id: other } })).toMatchObject({ email: "changed@example.test" });
  evidence("auth_regression", { baselinePreserved: true, triggerDefinitionsPreserved: true, profileCreation: true, metadataEscalationDenied: true, emailSynchronization: true });
});

it("requires draft then complete 21+14 publication and freezes published content", async () => {
  const { questions, ...rawSet } = fixture;
  const set = { ...rawSet, dassOptions: rawSet.dassOptions as Prisma.InputJsonValue,
    wemwbsOptions: rawSet.wemwbsOptions as Prisma.InputJsonValue };
  await expect(prisma.assessmentQuestionSet.create({ data: set })).rejects.toThrow();
  await prisma.assessmentQuestionSet.create({ data: { ...set, isPublished: false } });
  await expect(prisma.assessmentQuestionSet.update({ where: { id: set.id }, data: { isPublished: true } })).rejects.toThrow();
  await prisma.question.createMany({ data: questions });
  await prisma.assessmentQuestionSet.update({ where: { id: set.id }, data: { isPublished: true } });
  await expect(prisma.question.update({ where: { id: questions[0].id }, data: { questionText: "SYNTHETIC CHANGE" } })).rejects.toThrow();
  await prisma.academicPeriod.create({ data: { id: fixtureId(904), name: "SYNTHETIC ONLY", startDate: new Date("2026-01-01"), endDate: new Date("2026-12-31"), status: "ACTIVE" } });
  expect((await getQuota(participant)).limit).toBe(3);
  evidence("question_publication", { directPublishedInsertDenied: true, emptyPublicationDenied: true, syntheticDassItems: 21, syntheticWemwbsItems: 14, publishedMutationDenied: true });
});

// Hold the participant row, launch competing real service calls, and observe at
// least two database backends waiting on locks before releasing the blocker.
async function contend<T>(label: string, operation: () => Promise<T>): Promise<PromiseSettledResult<T>[]> {
  let release!: () => void, acquired!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const locked = new Promise<void>(resolve => { acquired = resolve; });
  const blocker = observer.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM users WHERE id=${participant}::uuid FOR UPDATE`;
    acquired(); await gate;
  }, { timeout: 20000 });
  // Reject promptly if acquiring the blocker fails.
  await Promise.race([locked, blocker]);
  const pending = Promise.allSettled([operation(), operation(), operation()]);
  let count = 0;
  let pids: number[] = [];
  try {
    for (let attempt = 0; attempt < 100; attempt++) {
      const [row] = await prisma.$queryRaw<{ count: number; pids: number[] | null }[]>`SELECT count(DISTINCT pid)::int AS count, array_agg(DISTINCT pid) AS pids FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE '%public.users%'`;
      count = row.count;
      pids = row.pids ?? [];
      if (count >= 2) break;
      await new Promise(resolve => setTimeout(resolve, 30));
    }
  } finally { release(); await blocker; }
  const results = await pending;
  expect(count).toBeGreaterThanOrEqual(2);
  evidence("concurrency", { operation: label, waitingBackendPids: pids, distinctWaitingConnections: count,
    fulfilled: results.filter(r => r.status === "fulfilled").length,
    rejections: results.flatMap(r => r.status === "rejected" ? [r.reason?.code === "STALE_REVISION" ? "STALE_REVISION" : r.reason?.code === "ASSESSMENT_QUOTA_EXCEEDED" ? "ASSESSMENT_QUOTA_EXCEEDED" : "UNEXPECTED_FAILURE"] : []) });
  return results;
}

it("exercises multiple blocked PostgreSQL connections for start, autosave and exactly-once submit", async () => {
  const starts = await contend("session_start", () => startAssessmentSession(participant, true));
  expect(starts.every(r => r.status === "fulfilled")).toBe(true);
  const sessions = await prisma.assessmentSession.findMany({ where: { participantId: participant } });
  expect(sessions).toHaveLength(1);
  const id = sessions[0].id;
  const answers = fixture.questions.map(q => ({ questionId: q.id, answerValue: q.instrument === "DASS21" ? 1 : 3 }));
  const saves = await contend("autosave", () => saveAnswers(id, participant, { expectedRevision: 0, answers }));
  expect(saves.filter(r => r.status === "fulfilled")).toHaveLength(1);
  for (const r of saves) if (r.status === "rejected") expect(r.reason.code).toBe("STALE_REVISION");
  expect((await getSession(id, participant)).answers).toHaveLength(35);
  await expect(submitAssessment(id, participant, { expectedRevision: 0 })).rejects.toMatchObject({ code: "STALE_REVISION" });
  const submits = await contend("final_submission", () => submitAssessment(id, participant, { expectedRevision: 1 }));
  expect(submits.every(r => r.status === "fulfilled")).toBe(true);
  const values = submits.flatMap(r => r.status === "fulfilled" ? [r.value] : []);
  expect(values[1]).toEqual(values[0]); expect(values[2]).toEqual(values[0]);
  expect(values[0].scores).toMatchObject({ depression: { score: 14 }, anxiety: { score: 14 }, stress: { score: 14 }, wemwbs: { score: 42 } });
  expect(await prisma.assessmentScore.count({ where: { assessmentSessionId: id } })).toBe(1);
  expect(await prisma.report.count({ where: { assessmentSessionId: id } })).toBe(1);
  await expect(prisma.assessmentScore.updateMany({ where: { assessmentSessionId: id }, data: { wemwbsScore: 43 } })).rejects.toThrow();
  await expect(prisma.assessmentAnswer.updateMany({ where: { assessmentSessionId: id }, data: { answerValue: 2 } })).rejects.toThrow();
  expect((await getQuota(participant)).completed).toBe(1);
  await expect(getSession(id, other)).rejects.toMatchObject({ code: "RESOURCE_NOT_FOUND" });
  await expect(saveAnswers(id, other, { expectedRevision: 1, answers })).rejects.toMatchObject({ code: "RESOURCE_NOT_FOUND" });
  await expect(submitAssessment(id, other, { expectedRevision: 1 })).rejects.toMatchObject({ code: "RESOURCE_NOT_FOUND" });
  expect(await getAssessmentHistory(other)).toEqual([]);
  evidence("completion_and_ownership", { sessions: 1, answers: 35, scores: 1, reports: 1, completedQuota: 1, staleSubmitDenied: true, retriesIdentical: true, completedDataImmutable: true, crossUserReadSaveSubmitDenied: true });
});

it("rolls back a real mid-submission failure then enforces the three-completion quota", async () => {
  const session = await startAssessmentSession(participant, true);
  const answers = fixture.questions.map(q => ({ questionId: q.id, answerValue: q.instrument === "DASS21" ? 0 : 1 }));
  await saveAnswers(session.assessmentSessionId, participant, { expectedRevision: 0, answers });
  // Fault injection only in the guarded synthetic database: fail after score creation.
  await prisma.$executeRawUnsafe(`CREATE FUNCTION rehearsal.fail_report() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'SYNTHETIC FAULT'; END $$`);
  await prisma.$executeRawUnsafe(`CREATE TRIGGER rehearsal_fail_report BEFORE INSERT ON public.reports FOR EACH ROW EXECUTE FUNCTION rehearsal.fail_report()`);
  try { await expect(submitAssessment(session.assessmentSessionId, participant, { expectedRevision: 1 })).rejects.toThrow(); }
  finally { await prisma.$executeRawUnsafe(`DROP TRIGGER rehearsal_fail_report ON public.reports`); }
  expect(await prisma.assessmentScore.count({ where: { assessmentSessionId: session.assessmentSessionId } })).toBe(0);
  expect(await prisma.report.count({ where: { assessmentSessionId: session.assessmentSessionId } })).toBe(0);
  expect(await getSession(session.assessmentSessionId, participant)).toMatchObject({ status: "IN_PROGRESS", revision: 1 });
  evidence("transaction_rollback", { injectedFailureAfterScoreInsert: true, scores: 0, reports: 0, status: "IN_PROGRESS", revision: 1 });
  await submitAssessment(session.assessmentSessionId, participant, { expectedRevision: 1 });
  const third = await startAssessmentSession(participant, true);
  await saveAnswers(third.assessmentSessionId, participant, { expectedRevision: 0, answers });
  const results = await contend("last_quota_submission", () => submitAssessment(third.assessmentSessionId, participant, { expectedRevision: 1 }));
  expect(results.every(r => r.status === "fulfilled")).toBe(true);
  const attempts = await contend("quota_exhausted_start", () => startAssessmentSession(participant, true));
  for (const result of attempts) {
    expect(result.status).toBe("rejected");
    if (result.status === "rejected") expect(result.reason.code).toBe("ASSESSMENT_QUOTA_EXCEEDED");
  }
  expect((await getQuota(participant))).toMatchObject({ completed: 3, remaining: 0 });
  evidence("quota", { completed: 3, remaining: 0, excessConcurrentStartsRejected: 3 });
});

it("denies browser table access and preserves own-profile RLS", async () => {
  for (const role of ["anon", "authenticated"]) for (const table of tableNames) {
    await expect(prisma.$transaction(async tx => {
      await tx.$executeRawUnsafe(`SET LOCAL ROLE ${role}`);
      await tx.$queryRawUnsafe(`SELECT * FROM public.${table} LIMIT 1`);
    })).rejects.toThrow();
  }
  const rows = await prisma.$transaction(async tx => {
    await tx.$executeRaw`SET LOCAL ROLE authenticated`;
    await tx.$queryRaw`SELECT set_config('request.jwt.claim.sub', ${participant}, true)`;
    return tx.$queryRaw<{ id: string }[]>`SELECT id FROM public.users`;
  });
  expect(rows).toEqual([{ id: participant }]);
  evidence("browser_access", { deniedTableReads: 14, testedRoles: ["anon", "authenticated"], ownProfileOnly: true });
});

it("enforces real foreign keys, period checks and one-active-period uniqueness", async () => {
  await expect(prisma.academicPeriod.create({ data: { name: "SYNTHETIC INVALID", status: "INACTIVE", startDate: new Date("2026-12-31"), endDate: new Date("2026-01-01") } })).rejects.toThrow();
  await expect(prisma.academicPeriod.create({ data: { name: "SYNTHETIC SECOND ACTIVE", status: "ACTIVE", startDate: new Date("2026-01-01"), endDate: new Date("2026-12-31") } })).rejects.toThrow();
  await expect(prisma.assessmentSession.create({ data: { participantId: fixtureId(9999), academicPeriodId: fixtureId(904), questionSetId: fixture.id,
    status: "IN_PROGRESS", processingConsentAt: new Date(), processingConsentVersion: "SYNTHETIC ONLY" } })).rejects.toThrow();
  evidence("constraints", { invalidPeriodDatesRejected: true, secondActivePeriodRejected: true, orphanParticipantRejected: true });
});
