import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { syntheticQuestionSet } from "./fixtures/assessment";

const migration = (path: string) => readFileSync(path, "utf8");
const participantId = "00000000-0000-4000-8000-000000000101";
const otherParticipantId = "00000000-0000-4000-8000-000000000102";
const psychologistId = "00000000-0000-4000-8000-000000000103";
const otherPsychologistId = "00000000-0000-4000-8000-000000000104";
const periodId = "00000000-0000-4000-8000-000000000105";
const questionSetId = "00000000-0000-4000-8000-000000000106";
const sessionId = "00000000-0000-4000-8000-000000000107";
const otherSessionId = "00000000-0000-4000-8000-000000000108";
const reportId = "00000000-0000-4000-8000-000000000109";
const otherReportId = "00000000-0000-4000-8000-000000000110";
const slotId = "00000000-0000-4000-8000-000000000111";
const otherSlotId = "00000000-0000-4000-8000-000000000112";
const appointmentId = "00000000-0000-4000-8000-000000000113";
const consentId = "00000000-0000-4000-8000-000000000114";
const appointmentStart = "2030-01-01T09:00:00+07:00";
const appointmentEnd = "2030-01-01T11:00:00+07:00";
let db: PGlite;

async function insertAppointment(id: string, availability = slotId, status = "CONFIRMED", owner = participantId, assessment = sessionId, report = reportId, psychologist = psychologistId) {
  return db.query(`INSERT INTO appointments
    (id,participant_id,psychologist_id,assessment_session_id,report_id,availability_id,status,scheduled_start_at,scheduled_end_at,updated_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,now())`, [id, owner, psychologist, assessment, report, availability, status, appointmentStart, appointmentEnd]);
}

async function insertConsent(id = consentId, type = "APPOINTMENT_REPORT_ACCESS", appointment: string | null = appointmentId, owner = participantId, report = reportId, target = psychologistId, expiresAt: string | null = appointmentEnd) {
  return db.query(`INSERT INTO consents
    (id,participant_id,assessment_session_id,report_id,target_user_id,appointment_id,consent_type,purpose,scope,policy_version,granted_at,expires_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,'synthetic purpose',$8::jsonb,'synthetic-v1',now(),$9)`,
  [id, owner, sessionId, report, target, appointment, type, JSON.stringify({ participantId: owner, reportId: report, psychologistId: target, appointmentId: appointment }), expiresAt]);
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec("CREATE ROLE anon; CREATE ROLE authenticated;");
  await db.exec(migration("prisma/migrations/20261021144827_init_users/migration.sql"));
  await db.exec(migration("prisma/migrations/20261023010000_phase2_assessment/migration.sql"));
  await db.exec(migration("prisma/migrations/20261028000000_psychologist_profiles/migration.sql"));
  await db.exec(migration("prisma/migrations/20261029000000_psychologist_availability/migration.sql"));
  await db.exec(migration("prisma/migrations/20261029000001_appointments_report_consent/migration.sql"));
  await db.query(`INSERT INTO users(id,full_name,email,password_hash,phone_number,role,updated_at) VALUES
    ($1,'Synthetic participant','p@example.test','synthetic','000','PARTICIPANT',now()),
    ($2,'Synthetic other participant','p2@example.test','synthetic','000','PARTICIPANT',now()),
    ($3,'Synthetic psychologist','w@example.test','synthetic','000','PSYCHOLOGIST',now()),
    ($4,'Synthetic other psychologist','w2@example.test','synthetic','000','PSYCHOLOGIST',now())`, [participantId, otherParticipantId, psychologistId, otherPsychologistId]);
  await db.query("INSERT INTO academic_periods(id,name,start_date,end_date,status,updated_at) VALUES ($1,'Synthetic','2029-01-01','2030-12-31','ACTIVE',now())", [periodId]);
  await db.query(`INSERT INTO assessment_question_sets(id,version,dass_instructions,wemwbs_instructions,dass_options,wemwbs_options)
    VALUES ($1,'SYNTHETIC','synthetic','synthetic','[]','[]')`, [questionSetId]);
  for (const question of syntheticQuestionSet().questions) {
    await db.query(`INSERT INTO questions(id,question_set_id,instrument,question_number,question_text,scoring_dimension,updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,now())`,
    [question.id, questionSetId, question.instrument, question.questionNumber, question.questionText, question.scoringDimension]);
  }
  await db.query(`UPDATE assessment_question_sets SET is_published=true,approved_at=now(),approved_by='SYNTHETIC',dass_source='SYNTHETIC',
    wemwbs_licence_reference='SYNTHETIC',translation_reference='SYNTHETIC',presentation_approval_reference='SYNTHETIC' WHERE id=$1`, [questionSetId]);
  await db.query(`INSERT INTO assessment_sessions(id,participant_id,academic_period_id,question_set_id,status,processing_consent_at,processing_consent_version,updated_at) VALUES
    ($1,$2,$3,$4,'IN_PROGRESS',now(),'synthetic',now()),($5,$6,$3,$4,'IN_PROGRESS',now(),'synthetic',now())`,
  [sessionId, participantId, periodId, questionSetId, otherSessionId, otherParticipantId]);
  await db.query(`INSERT INTO reports(id,assessment_session_id,status,file_path_or_object_key,generated_at,updated_at) VALUES
    ($1,$2,'GENERATED','synthetic/private/report.pdf',now(),now()),($3,$4,'GENERATED','synthetic/private/report2.pdf',now(),now())`, [reportId, sessionId, otherReportId, otherSessionId]);
  await db.query(`INSERT INTO psychologist_availability(id,psychologist_id,availability_date,session_type,status,updated_at) VALUES
    ($1,$2,'2030-01-01','MORNING','BOOKED',now()),($3,$4,'2030-01-01','MORNING','BOOKED',now())`, [slotId, psychologistId, otherSlotId, otherPsychologistId]);
  await insertAppointment(appointmentId);
});

afterAll(async () => { await db?.close(); });

describe.sequential("additive appointment and report-consent migration rehearsal (synthetic PGlite)", () => {
  it("keeps report generation separate and enables server-only tables", async () => {
    const generated = await db.query("SELECT status,file_path_or_object_key,generated_at IS NOT NULL AS has_artifact FROM reports WHERE id=$1", [reportId]);
    expect(generated.rows).toEqual([{ status: "GENERATED", file_path_or_object_key: "synthetic/private/report.pdf", has_artifact: true }]);
    for (const table of ["appointments", "consultation_sessions", "consents", "consent_audit_events"]) {
      expect((await db.query(`SELECT relrowsecurity AS enabled FROM pg_class WHERE oid=$1::regclass`, [`public.${table}`])).rows).toEqual([{ enabled: true }]);
      expect((await db.query("SELECT has_table_privilege('authenticated',$1,'SELECT') AS allowed", [`public.${table}`])).rows).toEqual([{ allowed: false }]);
    }
  });

  it("enforces fixed two-hour duration and the one-active-appointment slot invariant", async () => {
    await expect(db.query(`INSERT INTO appointments
      (id,participant_id,psychologist_id,assessment_session_id,report_id,availability_id,status,scheduled_start_at,scheduled_end_at,updated_at)
      VALUES ('00000000-0000-4000-8000-000000000115',$1,$2,$3,$4,$5,'CONFIRMED',$6,'2030-01-01T12:00:00+07:00',now())`,
    [participantId, psychologistId, sessionId, reportId, slotId, appointmentStart])).rejects.toThrow(/check/i);
    await expect(insertAppointment("00000000-0000-4000-8000-000000000116")).rejects.toThrow(/unique/i);
  });

  it("retains terminal appointment history while allowing an authorized slot to be reused", async () => {
    await db.query("UPDATE appointments SET status='CANCELLED',cancelled_at=now() WHERE id=$1", [appointmentId]);
    await insertAppointment("00000000-0000-4000-8000-000000000117");
    expect((await db.query("SELECT status FROM appointments WHERE availability_id=$1 ORDER BY created_at,id", [slotId])).rows)
      .toEqual([{ status: "CANCELLED" }, { status: "CONFIRMED" }]);
  });

  it("requires appointment IDs for appointment grants and forbids them for standalone grants", async () => {
    await insertConsent();
    await expect(insertConsent("00000000-0000-4000-8000-000000000118", "APPOINTMENT_REPORT_ACCESS", null, participantId, reportId, psychologistId, null)).rejects.toThrow(/check/i);
    await expect(insertConsent("00000000-0000-4000-8000-000000000119", "STANDALONE_REPORT_ACCESS", appointmentId, participantId, reportId, psychologistId, appointmentEnd)).rejects.toThrow(/check/i);
    await insertConsent("00000000-0000-4000-8000-000000000120", "STANDALONE_REPORT_ACCESS", null, participantId, reportId, psychologistId, null);
    await expect(db.query("UPDATE consents SET expired_at=now() WHERE id='00000000-0000-4000-8000-000000000120'")).rejects.toThrow(/check/i);
    await expect(insertConsent("00000000-0000-4000-8000-000000000121", "APPOINTMENT_REPORT_ACCESS", "00000000-0000-4000-8000-000000000117", participantId, reportId, otherPsychologistId, appointmentEnd)).rejects.toThrow(/foreign key/i);
    await db.query("INSERT INTO consent_audit_events(id,consent_id,actor_type,actor_user_id,action) VALUES ('00000000-0000-4000-8000-000000000131',$1,'USER',$2,'GRANTED')", [consentId, participantId]);
    await db.query("INSERT INTO consent_audit_events(id,consent_id,actor_type,actor_user_id,action) VALUES ('00000000-0000-4000-8000-000000000132',$1,'SYSTEM',NULL,'EXPIRED')", [consentId]);
    await expect(db.query("INSERT INTO consent_audit_events(id,consent_id,actor_type,actor_user_id,action) VALUES ('00000000-0000-4000-8000-000000000133',$1,'USER',NULL,'EXPIRED')", [consentId])).rejects.toThrow(/check/i);
    await expect(db.query("INSERT INTO consent_audit_events(id,consent_id,actor_type,actor_user_id,action) VALUES ('00000000-0000-4000-8000-000000000134',$1,'SYSTEM',$2,'EXPIRED')", [consentId, participantId])).rejects.toThrow(/check/i);
    await db.query("UPDATE consents SET revoked_at=now() WHERE id=$1", [consentId]);
    await expect(db.query("UPDATE consents SET revoked_at=NULL WHERE id=$1", [consentId])).rejects.toThrow(/cannot be reactivated/i);
    await expect(db.query("UPDATE consents SET purpose='mutated' WHERE id=$1", [consentId])).rejects.toThrow(/immutable/i);
    await expect(db.query("DELETE FROM consents WHERE id=$1", [consentId])).rejects.toThrow(/cannot be deleted/i);
    await expect(db.query("UPDATE consent_audit_events SET action='REVOKED' WHERE consent_id=$1", [consentId])).rejects.toThrow(/append-only/i);
  });

  it("prevents concurrent active bookings for the same slot at the PostgreSQL constraint boundary", async () => {
    await db.query("UPDATE appointments SET status='CANCELLED' WHERE availability_id=$1", [slotId]);
    const results = await Promise.allSettled([
      insertAppointment("00000000-0000-4000-8000-000000000122"),
      insertAppointment("00000000-0000-4000-8000-000000000123"),
    ]);
    expect(results.filter(({ status }) => status === "fulfilled")).toHaveLength(1);
    expect(results.filter(({ status }) => status === "rejected")).toHaveLength(1);
    expect((await db.query("SELECT count(*)::int AS count FROM appointments WHERE availability_id=$1 AND status='CONFIRMED'", [slotId])).rows)
      .toEqual([{ count: 1 }]);
  });

  it("rolls back appointment, consultation session, and consent together when a later write fails", async () => {
    const rollbackSlot = "00000000-0000-4000-8000-000000000126";
    const rollbackAppointment = "00000000-0000-4000-8000-000000000127";
    const rollbackSession = "00000000-0000-4000-8000-000000000128";
    const rollbackConsent = "00000000-0000-4000-8000-000000000129";
    await db.query("INSERT INTO psychologist_availability(id,psychologist_id,availability_date,session_type,status,updated_at) VALUES ($1,$2,'2030-01-01','AFTERNOON','AVAILABLE',now())", [rollbackSlot, psychologistId]);
    await expect(db.transaction(async (tx) => {
      await tx.query("UPDATE psychologist_availability SET status='BOOKED' WHERE id=$1 AND status='AVAILABLE'", [rollbackSlot]);
      await tx.query(`INSERT INTO appointments
        (id,participant_id,psychologist_id,assessment_session_id,report_id,availability_id,status,scheduled_start_at,scheduled_end_at,updated_at)
        VALUES ($1,$2,$3,$4,$5,$6,'CONFIRMED','2030-01-01T13:00:00+07:00','2030-01-01T15:00:00+07:00',now())`,
      [rollbackAppointment, participantId, psychologistId, sessionId, reportId, rollbackSlot]);
      await tx.query(`INSERT INTO consultation_sessions(id,appointment_id,scheduled_start_at,scheduled_end_at,updated_at)
        VALUES ($1,$2,'2030-01-01T13:00:00+07:00','2030-01-01T15:00:00+07:00',now())`, [rollbackSession, rollbackAppointment]);
      await tx.query(`INSERT INTO consents
        (id,participant_id,assessment_session_id,report_id,target_user_id,appointment_id,consent_type,purpose,scope,policy_version,granted_at,expires_at)
        VALUES ($1,$2,$3,$4,$5,$6,'APPOINTMENT_REPORT_ACCESS','synthetic', '{}'::jsonb,'synthetic-v1',now(),'2030-01-01T15:00:00+07:00')`,
      [rollbackConsent, participantId, sessionId, reportId, psychologistId, rollbackAppointment]);
      await tx.query(`INSERT INTO consent_audit_events(id,consent_id,actor_type,actor_user_id,action)
        VALUES ('00000000-0000-4000-8000-000000000130',$1,'USER','00000000-0000-4000-8000-000000000199','GRANTED')`, [rollbackConsent]);
    })).rejects.toThrow(/foreign key/i);
    expect((await db.query("SELECT count(*)::int AS count FROM appointments WHERE id=$1", [rollbackAppointment])).rows).toEqual([{ count: 0 }]);
    expect((await db.query("SELECT count(*)::int AS count FROM consultation_sessions WHERE id=$1", [rollbackSession])).rows).toEqual([{ count: 0 }]);
    expect((await db.query("SELECT count(*)::int AS count FROM consents WHERE id=$1", [rollbackConsent])).rows).toEqual([{ count: 0 }]);
    expect((await db.query("SELECT status FROM psychologist_availability WHERE id=$1", [rollbackSlot])).rows).toEqual([{ status: "AVAILABLE" }]);
  });

  it("rejects report/assessment and availability/psychologist mismatches by composite foreign keys", async () => {
    await expect(insertAppointment("00000000-0000-4000-8000-000000000124", otherSlotId)).rejects.toThrow(/foreign key/i);
    await expect(insertAppointment("00000000-0000-4000-8000-000000000125", "00000000-0000-4000-8000-000000000126", "CONFIRMED", participantId, sessionId, otherReportId)).rejects.toThrow(/foreign key/i);
  });
});
