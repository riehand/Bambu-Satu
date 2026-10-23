import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fixtureId, syntheticQuestionSet } from "./fixtures/assessment";
let db: PGlite;
const user=fixtureId(200), period=fixtureId(400), session=fixtureId(300), set=fixtureId(100);
const migration=readFileSync("prisma/migrations/20261023010000_phase2_assessment/migration.sql","utf8");
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
  it("refuses publication without evidence",async()=>{await expect(db.query("UPDATE assessment_question_sets SET is_published=true WHERE id=$1",[set])).rejects.toThrow(/approval/);});
  it("publishes an explicitly synthetic test set with all evidence fields",async()=>{
    await db.query(`UPDATE assessment_question_sets SET is_published=true,approved_at=now(),approved_by='SYNTHETIC',dass_source='SYNTHETIC',wemwbs_licence_reference='SYNTHETIC',translation_reference='SYNTHETIC',presentation_approval_reference='SYNTHETIC' WHERE id=$1`,[set]);
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
