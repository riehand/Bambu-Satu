-- DRAFT: apply only after explicit hosted-migration approval and collision review.
-- No content, academic periods, users, or fictional assessments are inserted.
BEGIN;
SET LOCAL search_path = public;
-- CreateEnum
CREATE TYPE "AcademicPeriodStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "Instrument" AS ENUM ('DASS21', 'WEMWBS');

-- CreateEnum
CREATE TYPE "ScoringDimension" AS ENUM ('DEPRESSION', 'ANXIETY', 'STRESS', 'WELLBEING');

-- CreateEnum
CREATE TYPE "AssessmentSessionStatus" AS ENUM ('IN_PROGRESS', 'COMPLETED');

-- CreateEnum
CREATE TYPE "DassCategory" AS ENUM ('NORMAL', 'MILD', 'MODERATE', 'SEVERE', 'EXTREMELY_SEVERE');

-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('PENDING', 'GENERATED');

-- CreateTable
CREATE TABLE "academic_periods" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "assessment_limit" INTEGER NOT NULL DEFAULT 3,
    "status" "AcademicPeriodStatus" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "academic_periods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "questions" (
    "id" UUID NOT NULL,
    "instrument" "Instrument" NOT NULL,
    "question_number" INTEGER NOT NULL,
    "question_text" TEXT NOT NULL,
    "scoring_dimension" "ScoringDimension" NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "question_set_id" UUID NOT NULL,

    CONSTRAINT "questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assessment_sessions" (
    "id" UUID NOT NULL,
    "participant_id" UUID NOT NULL,
    "academic_period_id" UUID NOT NULL,
    "status" "AssessmentSessionStatus" NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "question_set_id" UUID NOT NULL,
    "processing_consent_at" TIMESTAMP(3) NOT NULL,
    "processing_consent_version" TEXT NOT NULL,

    CONSTRAINT "assessment_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assessment_question_sets" (
    "id" UUID NOT NULL,
    "version" TEXT NOT NULL,
    "is_published" BOOLEAN NOT NULL DEFAULT false,
    "approved_at" TIMESTAMP(3),
    "approved_by" TEXT,
    "dass_source" TEXT,
    "wemwbs_licence_reference" TEXT,
    "translation_reference" TEXT,
    "presentation_approval_reference" TEXT,
    "dass_instructions" TEXT NOT NULL,
    "wemwbs_instructions" TEXT NOT NULL,
    "dass_options" JSONB NOT NULL,
    "wemwbs_options" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assessment_question_sets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assessment_answers" (
    "id" UUID NOT NULL,
    "assessment_session_id" UUID NOT NULL,
    "question_id" UUID NOT NULL,
    "answer_value" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "assessment_answers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assessment_scores" (
    "id" UUID NOT NULL,
    "assessment_session_id" UUID NOT NULL,
    "depression_score" INTEGER NOT NULL,
    "depression_category" "DassCategory" NOT NULL,
    "anxiety_score" INTEGER NOT NULL,
    "anxiety_category" "DassCategory" NOT NULL,
    "stress_score" INTEGER NOT NULL,
    "stress_category" "DassCategory" NOT NULL,
    "wemwbs_score" INTEGER NOT NULL,
    "calculated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "assessment_scores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reports" (
    "id" UUID NOT NULL,
    "assessment_session_id" UUID NOT NULL,
    "status" "ReportStatus" NOT NULL DEFAULT 'PENDING',
    "file_path_or_object_key" TEXT,
    "generated_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "questions_question_set_id_instrument_question_number_key" ON "questions"("question_set_id", "instrument", "question_number");

-- CreateIndex
CREATE INDEX "assessment_sessions_participant_id_academic_period_id_idx" ON "assessment_sessions"("participant_id", "academic_period_id");

-- CreateIndex
CREATE UNIQUE INDEX "assessment_question_sets_version_key" ON "assessment_question_sets"("version");

-- CreateIndex
CREATE UNIQUE INDEX "assessment_answers_assessment_session_id_question_id_key" ON "assessment_answers"("assessment_session_id", "question_id");

-- CreateIndex
CREATE UNIQUE INDEX "assessment_scores_assessment_session_id_key" ON "assessment_scores"("assessment_session_id");

-- CreateIndex
CREATE UNIQUE INDEX "reports_assessment_session_id_key" ON "reports"("assessment_session_id");

-- AddForeignKey
ALTER TABLE "questions" ADD CONSTRAINT "questions_question_set_id_fkey" FOREIGN KEY ("question_set_id") REFERENCES "assessment_question_sets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_sessions" ADD CONSTRAINT "assessment_sessions_question_set_id_fkey" FOREIGN KEY ("question_set_id") REFERENCES "assessment_question_sets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_sessions" ADD CONSTRAINT "assessment_sessions_participant_id_fkey" FOREIGN KEY ("participant_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_sessions" ADD CONSTRAINT "assessment_sessions_academic_period_id_fkey" FOREIGN KEY ("academic_period_id") REFERENCES "academic_periods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_answers" ADD CONSTRAINT "assessment_answers_assessment_session_id_fkey" FOREIGN KEY ("assessment_session_id") REFERENCES "assessment_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_answers" ADD CONSTRAINT "assessment_answers_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "questions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_scores" ADD CONSTRAINT "assessment_scores_assessment_session_id_fkey" FOREIGN KEY ("assessment_session_id") REFERENCES "assessment_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_assessment_session_id_fkey" FOREIGN KEY ("assessment_session_id") REFERENCES "assessment_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE UNIQUE INDEX academic_periods_one_active ON academic_periods (status) WHERE status = 'ACTIVE';
CREATE UNIQUE INDEX assessment_sessions_one_in_progress ON assessment_sessions (participant_id, academic_period_id) WHERE status = 'IN_PROGRESS';
CREATE INDEX assessment_sessions_history ON assessment_sessions (participant_id, status, completed_at DESC);
ALTER TABLE academic_periods ADD CONSTRAINT academic_period_valid_range CHECK (start_date <= end_date AND assessment_limit >= 0);
ALTER TABLE assessment_sessions ADD CONSTRAINT assessment_session_state CHECK (
  revision >= 0 AND length(trim(processing_consent_version)) > 0 AND
  ((status = 'IN_PROGRESS' AND completed_at IS NULL) OR (status = 'COMPLETED' AND completed_at IS NOT NULL))
);
ALTER TABLE questions ADD CONSTRAINT question_valid_number_dimension CHECK (
  (instrument = 'WEMWBS' AND question_number BETWEEN 1 AND 14 AND scoring_dimension = 'WELLBEING') OR
  (instrument = 'DASS21' AND (
    (question_number IN (3,5,10,13,16,17,21) AND scoring_dimension = 'DEPRESSION') OR
    (question_number IN (2,4,7,9,15,19,20) AND scoring_dimension = 'ANXIETY') OR
    (question_number IN (1,6,8,11,12,14,18) AND scoring_dimension = 'STRESS')))
);
ALTER TABLE assessment_scores ADD CONSTRAINT assessment_score_ranges CHECK (
  depression_score BETWEEN 0 AND 42 AND depression_score % 2 = 0 AND
  anxiety_score BETWEEN 0 AND 42 AND anxiety_score % 2 = 0 AND
  stress_score BETWEEN 0 AND 42 AND stress_score % 2 = 0 AND wemwbs_score BETWEEN 14 AND 70
);
ALTER TABLE assessment_question_sets ADD CONSTRAINT published_question_set_approval CHECK (
  NOT is_published OR (approved_at IS NOT NULL AND
    coalesce(length(trim(approved_by)),0) > 0 AND coalesce(length(trim(dass_source)),0) > 0 AND
    coalesce(length(trim(wemwbs_licence_reference)),0) > 0 AND coalesce(length(trim(translation_reference)),0) > 0 AND
    coalesce(length(trim(presentation_approval_reference)),0) > 0)
);

CREATE FUNCTION public.phase2_freeze_question_set() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF OLD.is_published THEN RAISE EXCEPTION 'Published question set is immutable'; END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  IF NEW.is_published AND (SELECT count(*) FROM questions WHERE question_set_id = NEW.id AND is_active) <> 35 THEN
    RAISE EXCEPTION 'Published question set requires 35 active items';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER phase2_freeze_question_set BEFORE UPDATE OR DELETE ON assessment_question_sets FOR EACH ROW EXECUTE FUNCTION public.phase2_freeze_question_set();

CREATE FUNCTION public.phase2_freeze_question() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE published boolean;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    SELECT is_published INTO published FROM assessment_question_sets WHERE id = OLD.question_set_id FOR UPDATE;
    IF published THEN RAISE EXCEPTION 'Published question is immutable'; END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  SELECT is_published INTO published FROM assessment_question_sets WHERE id = NEW.question_set_id FOR UPDATE;
  IF published THEN RAISE EXCEPTION 'Published question is immutable'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER phase2_freeze_question BEFORE INSERT OR UPDATE OR DELETE ON questions FOR EACH ROW EXECUTE FUNCTION public.phase2_freeze_question();

CREATE FUNCTION public.phase2_guard_answer() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE s assessment_sessions; q questions;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    SELECT * INTO s FROM assessment_sessions WHERE id = OLD.assessment_session_id FOR UPDATE;
    IF s.status = 'COMPLETED' THEN RAISE EXCEPTION 'Completed answers are immutable'; END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  SELECT * INTO s FROM assessment_sessions WHERE id = NEW.assessment_session_id FOR UPDATE;
  IF s.status <> 'IN_PROGRESS' THEN RAISE EXCEPTION 'Session is not writable'; END IF;
  SELECT * INTO q FROM questions WHERE id = NEW.question_id;
  IF q.question_set_id <> s.question_set_id OR NOT q.is_active THEN RAISE EXCEPTION 'Question does not belong to session'; END IF;
  IF (q.instrument = 'DASS21' AND NEW.answer_value NOT BETWEEN 0 AND 3) OR
     (q.instrument = 'WEMWBS' AND NEW.answer_value NOT BETWEEN 1 AND 5) THEN RAISE EXCEPTION 'Invalid answer range'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER phase2_guard_answer BEFORE INSERT OR UPDATE OR DELETE ON assessment_answers FOR EACH ROW EXECUTE FUNCTION public.phase2_guard_answer();

CREATE FUNCTION public.phase2_guard_session() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE p academic_periods;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    IF OLD.status = 'COMPLETED' THEN RAISE EXCEPTION 'Completed session is immutable'; END IF;
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    IF (NEW.participant_id, NEW.academic_period_id, NEW.question_set_id, NEW.processing_consent_at, NEW.processing_consent_version)
      IS DISTINCT FROM (OLD.participant_id, OLD.academic_period_id, OLD.question_set_id, OLD.processing_consent_at, OLD.processing_consent_version)
      THEN RAISE EXCEPTION 'Session identity and consent are immutable'; END IF;
  END IF;
  PERFORM id FROM users WHERE id = NEW.participant_id AND role = 'PARTICIPANT' AND is_active FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Active participant required'; END IF;
  SELECT * INTO p FROM academic_periods WHERE id = NEW.academic_period_id FOR SHARE;
  IF p.status <> 'ACTIVE' THEN RAISE EXCEPTION 'Active period required'; END IF;
  IF (SELECT count(*) FROM assessment_sessions WHERE participant_id = NEW.participant_id AND academic_period_id = NEW.academic_period_id AND status = 'COMPLETED') >= p.assessment_limit
    THEN RAISE EXCEPTION 'Assessment quota exceeded'; END IF;
  IF NOT EXISTS (SELECT 1 FROM assessment_question_sets WHERE id = NEW.question_set_id AND is_published)
    THEN RAISE EXCEPTION 'Approved published questions required'; END IF;
  IF NEW.status = 'COMPLETED' THEN
    IF (SELECT count(*) FROM assessment_answers WHERE assessment_session_id = NEW.id) <> 35 OR
       NOT EXISTS (SELECT 1 FROM assessment_scores WHERE assessment_session_id = NEW.id) OR
       NOT EXISTS (SELECT 1 FROM reports WHERE assessment_session_id = NEW.id)
      THEN RAISE EXCEPTION 'Complete answers, score and report metadata required'; END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER phase2_guard_session BEFORE INSERT OR UPDATE OR DELETE ON assessment_sessions FOR EACH ROW EXECUTE FUNCTION public.phase2_guard_session();

CREATE FUNCTION public.phase2_freeze_score() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  RAISE EXCEPTION 'Official scores are immutable';
END $$;
CREATE TRIGGER phase2_freeze_score BEFORE UPDATE OR DELETE ON assessment_scores FOR EACH ROW EXECUTE FUNCTION public.phase2_freeze_score();

-- Backend-only tables. Prisma uses a trusted server database role and enforces
-- participant identity/ownership. No direct browser or mobile access is granted.
ALTER TABLE academic_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE assessment_question_sets ENABLE ROW LEVEL SECURITY;
ALTER TABLE questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE assessment_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE assessment_answers ENABLE ROW LEVEL SECURITY;
ALTER TABLE assessment_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE reports ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON academic_periods, assessment_question_sets, questions, assessment_sessions, assessment_answers, assessment_scores, reports FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.phase2_freeze_question_set(), public.phase2_freeze_question(), public.phase2_guard_answer(), public.phase2_guard_session(), public.phase2_freeze_score() FROM PUBLIC, anon, authenticated;
COMMIT;
