import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fixtureId, syntheticQuestionSet } from "./fixtures/assessment";
let db: PGlite;
const user=fixtureId(200), period=fixtureId(400), session=fixtureId(300), set=fixtureId(100);
const migration=readFileSync("prisma/migrations/20261023010000_phase2_assessment/migration.sql","utf8");
const approvalFields = `approved_at=now(),approved_by='SYNTHETIC',dass_source='SYNTHETIC',wemwbs_licence_reference='SYNTHETIC',translation_reference='SYNTHETIC',presentation_approval_reference='SYNTHETIC'`;
async function createSession(id= session, periodId=period) {
  return db.query(`INSERT INTO assessment_sessions (id,participant_id,academic_period_id,question_set_id,status,processing_consent_at,processing_consent_version,updated_at) VALUES ($1,$2,$3,$4,'IN_PROGRESS',now(),'synthetic-test',now())`,[id,user,periodId,set]);
}
beforeAll(async()=>{
  db=new PGlite();
  await db.exec("CREATE ROLE anon; CREATE ROLE authenticated;");
  await db.exec(readFileSync("prisma/migrations/20261021144827_init_users/migration.sql","utf8"));
  await db.exec(migration);
  await db.query(`INSERT INTO users (id,full_name,email,password_hash,phone_number,role,updated_at) VALUES ($1,'Synthetic test','synthetic@example.test','not-a-password','0000000000','PARTICIPANT',now())`,[user]);
  await db.query(`INSERT INTO academic_periods(id,name,start_date,end_date,status,assessment_limit,updated_at) VALUES ($1,'Synthetic period','2026-01-01','2026-12-31','ACTIVE',1,now())`,[period]);
  const fixture=syntheticQuestionSet();
  await db.query(`INSERT INTO assessment_question_sets(id,version,dass_instructions,wemwbs_instructions,dass_options,wemwbs_options) VALUES ($1,'SYNTHETIC','synthetic','synthetic',$2,$3)`,[set,JSON.stringify(fixture.dassOptions),JSON.stringify(fixture.wemwbsOptions)]);
  for (const q of fixture.questions) await db.query(`INSERT INTO questions(id,question_set_id,instrument,question_number,question_text,scoring_dimension,updated_at) VALUES ($1,$2,$3,$4,$5,$6,now())`,[q.id,set,q.instrument,q.questionNumber,q.questionText,q.scoringDimension]);
});
afterAll(async()=>{await db?.close();});
describe.sequential("actual PostgreSQL Phase 2 constraints and atomicity (PGlite)",()=>{
  it("rejects direct published insertion even with every approval field", async () => {
    const id = fixtureId(101);
    await expect(db.query(`INSERT INTO assessment_question_sets
      (id,version,is_published,approved_at,approved_by,dass_source,wemwbs_licence_reference,translation_reference,presentation_approval_reference,dass_instructions,wemwbs_instructions,dass_options,wemwbs_options)
      VALUES ($1,'SYNTHETIC-BYPASS',true,now(),'SYNTHETIC','SYNTHETIC','SYNTHETIC','SYNTHETIC','SYNTHETIC','synthetic','synthetic','[]','[]')`, [id]))
      .rejects.toThrow(/must be inserted as unpublished drafts/);
    expect((await db.query("SELECT id FROM assessment_question_sets WHERE id=$1", [id])).rows).toHaveLength(0);
  });
  it("defaults new sets to unpublished drafts without approval evidence", async () => {
    expect((await db.query("SELECT is_published,approved_at,approved_by FROM assessment_question_sets WHERE id=$1", [set])).rows)
      .toEqual([{ is_published: false, approved_at: null, approved_by: null }]);
  });
  it("allows explicit draft creation and editing but refuses publication with no questions", async () => {
    const id = fixtureId(102);
    await db.query(`INSERT INTO assessment_question_sets
      (id,version,is_published,dass_instructions,wemwbs_instructions,dass_options,wemwbs_options)
      VALUES ($1,'SYNTHETIC-DRAFT',false,'synthetic','synthetic','[]','[]')`, [id]);
    await db.query(`UPDATE assessment_question_sets SET dass_instructions='edited draft',${approvalFields} WHERE id=$1`, [id]);
    expect((await db.query("SELECT is_published,dass_instructions FROM assessment_question_sets WHERE id=$1", [id])).rows)
      .toEqual([{ is_published: false, dass_instructions: "edited draft" }]);
    await expect(db.query("UPDATE assessment_question_sets SET is_published=true WHERE id=$1", [id])).rejects.toThrow(/35 active items/);
    expect((await db.query("SELECT is_published FROM assessment_question_sets WHERE id=$1", [id])).rows).toEqual([{ is_published: false }]);
    await db.query("DELETE FROM assessment_question_sets WHERE id=$1", [id]);
    expect((await db.query("SELECT id FROM assessment_question_sets WHERE id=$1", [id])).rows).toHaveLength(0);
  });
  it("rejects publication when one of the 35 questions is inactive despite complete evidence", async () => {
    await db.query("UPDATE questions SET is_active=false WHERE id=$1", [fixtureId(35)]);
    try {
      await expect(db.query(`UPDATE assessment_question_sets SET is_published=true,${approvalFields} WHERE id=$1`, [set])).rejects.toThrow(/35 active items/);
      expect((await db.query("SELECT is_published,approved_at FROM assessment_question_sets WHERE id=$1", [set])).rows)
        .toEqual([{ is_published: false, approved_at: null }]);
    } finally { await db.query("UPDATE questions SET is_active=true WHERE id=$1", [fixtureId(35)]); }
  });
  it("refuses publication without evidence",async()=>{await expect(db.query("UPDATE assessment_question_sets SET is_published=true WHERE id=$1",[set])).rejects.toThrow(/approval/);});
  it.each([
    "approved_at=NULL", "approved_by=NULL", "approved_by='   '",
    "dass_source=NULL", "dass_source='   '",
    "wemwbs_licence_reference=NULL", "wemwbs_licence_reference='   '",
    "translation_reference=NULL", "translation_reference='   '",
    "presentation_approval_reference=NULL", "presentation_approval_reference='   '",
  ])("rejects publication with invalid evidence: %s", async invalidField => {
    await db.query(`UPDATE assessment_question_sets SET ${approvalFields} WHERE id=$1`, [set]);
    await expect(db.query(`UPDATE assessment_question_sets SET is_published=true,${invalidField} WHERE id=$1`, [set]))
      .rejects.toThrow(/published_question_set_approval/);
    expect((await db.query("SELECT is_published FROM assessment_question_sets WHERE id=$1", [set])).rows).toEqual([{ is_published: false }]);
  });
  it("publishes an explicitly synthetic test set with all evidence fields",async()=>{
    await db.query(`UPDATE assessment_question_sets SET is_published=true,approved_at=now(),approved_by='SYNTHETIC',dass_source='SYNTHETIC',wemwbs_licence_reference='SYNTHETIC',translation_reference='SYNTHETIC',presentation_approval_reference='SYNTHETIC' WHERE id=$1`,[set]);
    expect((await db.query("SELECT is_published FROM assessment_question_sets WHERE id=$1", [set])).rows).toEqual([{ is_published: true }]);
    expect((await db.query("SELECT instrument,count(*)::int AS count FROM questions WHERE question_set_id=$1 AND is_active GROUP BY instrument ORDER BY instrument", [set])).rows)
      .toEqual([{ instrument: "DASS21", count: 21 }, { instrument: "WEMWBS", count: 14 }]);
  });
  it.each([
    "UPDATE assessment_question_sets SET is_published=false WHERE id=$1",
    "UPDATE assessment_question_sets SET approved_by='changed' WHERE id=$1",
    "DELETE FROM assessment_question_sets WHERE id=$1",
  ])("rejects published-set mutation %#", async sql => {
    await expect(db.query(sql, [set])).rejects.toThrow(/Published question set is immutable/);
    expect((await db.query("SELECT is_published,approved_by FROM assessment_question_sets WHERE id=$1", [set])).rows)
      .toEqual([{ is_published: true, approved_by: "SYNTHETIC" }]);
  });
  it.each([
    "DELETE FROM questions WHERE id=$1",
    "UPDATE questions SET is_active=false WHERE id=$1",
    "UPDATE questions SET question_set_id='00000000-0000-4000-8000-000000000999' WHERE id=$1",
  ])("rejects published-question mutation %#", async sql => {
    await expect(db.query(sql, [fixtureId(1)])).rejects.toThrow(/Published question is immutable/);
    expect((await db.query("SELECT is_active,question_set_id FROM questions WHERE id=$1", [fixtureId(1)])).rows)
      .toEqual([{ is_active: true, question_set_id: set }]);
  });
  it("freezes published content and response options",async()=>{
    await expect(db.query("UPDATE questions SET question_text='changed' WHERE id=$1",[fixtureId(1)])).rejects.toThrow(/immutable/);
    await expect(db.query("UPDATE assessment_question_sets SET dass_options='[]' WHERE id=$1",[set])).rejects.toThrow(/immutable/);
  });
  it("enforces exactly one active period",async()=>{
    await expect(db.query(`INSERT INTO academic_periods(id,name,start_date,end_date,status,updated_at) VALUES ($1,'Synthetic second','2027-01-01','2027-12-31','ACTIVE',now())`,[fixtureId(401)])).rejects.toThrow(/unique/);
  });
  it("creates one session, then rejects duplicate in-progress sessions",async()=>{
    await createSession(); await expect(createSession(fixtureId(301))).rejects.toThrow(/unique/);
  });
  it("rejects cross-instrument values and persists one answer",async()=>{
    const insert=`INSERT INTO assessment_answers(id,assessment_session_id,question_id,answer_value,updated_at) VALUES ($1,$2,$3,$4,now())`;
    await expect(db.query(insert,[fixtureId(501),session,fixtureId(1),4])).rejects.toThrow(/range/);
    await expect(db.query(insert,[fixtureId(501),session,fixtureId(22),0])).rejects.toThrow(/range/);
    await db.query(insert,[fixtureId(501),session,fixtureId(1),1]);
    await expect(db.query(insert,[fixtureId(502),session,fixtureId(1),2])).rejects.toThrow(/unique/);
    await db.query("UPDATE assessment_answers SET answer_value=2 WHERE id=$1",[fixtureId(501)]);
    expect((await db.query("SELECT answer_value FROM assessment_answers WHERE assessment_session_id=$1",[session])).rows).toEqual([{answer_value:2}]);
  });
  it("rejects incomplete completion at the database boundary",async()=>{
    await expect(db.query("UPDATE assessment_sessions SET status='COMPLETED',completed_at=now() WHERE id=$1",[session])).rejects.toThrow(/Complete answers/);
  });
  it("rolls back a score write when the rest of the transaction fails",async()=>{
    await expect(db.transaction(async tx=>{
      await tx.query(`INSERT INTO assessment_scores(id,assessment_session_id,depression_score,depression_category,anxiety_score,anxiety_category,stress_score,stress_category,wemwbs_score,updated_at) VALUES ($1,$2,0,'NORMAL',0,'NORMAL',0,'NORMAL',14,now())`,[fixtureId(700),session]);
      await tx.query("UPDATE assessment_sessions SET status='COMPLETED',completed_at=now() WHERE id=$1",[session]);
    })).rejects.toThrow();
    expect((await db.query("SELECT id FROM assessment_scores")).rows).toHaveLength(0);
  });
  it("commits 35 answers, one score and pending report atomically",async()=>{
    await db.transaction(async tx=>{
      for (let i=2;i<=35;i++) await tx.query(`INSERT INTO assessment_answers(id,assessment_session_id,question_id,answer_value,updated_at) VALUES ($1,$2,$3,1,now())`,[fixtureId(500+i),session,fixtureId(i)]);
      await tx.query(`INSERT INTO assessment_scores(id,assessment_session_id,depression_score,depression_category,anxiety_score,anxiety_category,stress_score,stress_category,wemwbs_score,updated_at) VALUES ($1,$2,14,'MODERATE',14,'MODERATE',16,'MILD',14,now())`,[fixtureId(700),session]);
      await tx.query(`INSERT INTO reports(id,assessment_session_id,updated_at) VALUES ($1,$2,now())`,[fixtureId(800),session]);
      await tx.query("UPDATE assessment_sessions SET status='COMPLETED',completed_at=now() WHERE id=$1",[session]);
    });
    expect((await db.query("SELECT status,file_path_or_object_key FROM reports")).rows).toEqual([{status:"PENDING",file_path_or_object_key:null}]);
  });
  it("protects completed answers, session, consent and scores from changes",async()=>{
    await expect(db.query("UPDATE assessment_answers SET answer_value=0 WHERE assessment_session_id=$1",[session])).rejects.toThrow(/immutable/);
    await expect(db.query("UPDATE assessment_sessions SET processing_consent_version='changed' WHERE id=$1",[session])).rejects.toThrow(/immutable/);
    await expect(db.query("UPDATE assessment_scores SET wemwbs_score=20 WHERE assessment_session_id=$1",[session])).rejects.toThrow(/immutable/);
  });
  it("rejects a second report and further sessions when quota is consumed",async()=>{
    await expect(db.query("INSERT INTO reports(id,assessment_session_id,updated_at) VALUES ($1,$2,now())",[fixtureId(801),session])).rejects.toThrow(/unique/);
    await expect(createSession(fixtureId(301))).rejects.toThrow(/quota/);
  });
  it("isolates quota by period",async()=>{
    await db.query("UPDATE academic_periods SET status='INACTIVE' WHERE id=$1",[period]);
    await db.query(`INSERT INTO academic_periods(id,name,start_date,end_date,status,updated_at) VALUES ($1,'New synthetic period','2027-01-01','2027-12-31','ACTIVE',now())`,[fixtureId(401)]);
    await createSession(fixtureId(301),fixtureId(401));
    expect((await db.query("SELECT assessment_limit FROM academic_periods WHERE id=$1",[fixtureId(401)])).rows).toEqual([{assessment_limit:3}]);
  });
  it.each(["anon","authenticated"])("denies %s direct reads and writes to all new tables",async role=>{
    for (const table of ["academic_periods","assessment_question_sets","questions","assessment_sessions","assessment_answers","assessment_scores","reports"]) {
      await db.exec(`SET ROLE ${role}`);
      try { await expect(db.query(`SELECT * FROM ${table}`)).rejects.toThrow(/permission denied/); await expect(db.query(`DELETE FROM ${table}`)).rejects.toThrow(/permission denied/); }
      finally { await db.exec("RESET ROLE"); }
    }
    expect((await db.query<{relrowsecurity:boolean}>("SELECT relrowsecurity FROM pg_class WHERE relname IN ('academic_periods','assessment_question_sets','questions','assessment_sessions','assessment_answers','assessment_scores','reports')")).rows.every(row=>row.relrowsecurity)).toBe(true);
  });
});
