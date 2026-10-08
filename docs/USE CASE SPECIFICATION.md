# Structured Use-Case Specification — Coding Agent
## Critical Flows
### Mental Well-Being Assessment Platform

**Purpose:** Machine-friendly implementation specification for critical flows.

---

# SUC-01 — Complete Assessment

```yaml
id: SUC-01
name: Complete Assessment
primary_actor: Participant
preconditions:
  - participant_authenticated
  - active_academic_period_exists
  - assessment_quota_available
  - assessment_session_status == IN_PROGRESS
inputs:
  - DASS21_answers
  - WEMWBS_answers
guards:
  - all_required_answers_present
  - session_not_already_completed
main_flow:
  - validate_answers
  - compute_DASS21_deterministically
  - compute_WEMWBS_deterministically
  - persist_scores
  - mark_assessment_COMPLETED
  - generate_report
  - count_exactly_one_completed_session_for_quota
postconditions:
  - assessment_status == COMPLETED
  - report_exists
  - report_private_by_default
must_not:
  - invoke_AI_for_scoring
  - consume_two_quota_units
  - create_combined_mental_health_score
  - duplicate_completion_on_retry
```

---

# SUC-02 — External Chatbot Handoff

```yaml
id: SUC-02
name: External Chatbot Handoff
primary_actor: Participant
supporting_actor: ExternalChatbotSystem
preconditions:
  - participant_authenticated
  - current_assessment_status == COMPLETED
  - current_report_exists
trigger:
  - participant_selects_chat_with_chatbot
guards:
  - explicit_chatbot_authorization == true
main_flow:
  - create_scoped_handoff
  - bind_handoff_to_participant
  - bind_handoff_to_current_report
  - set_expiration
  - redirect_to_external_chatbot
  - chatbot_fetches_processed_context
allowed_context:
  - assessment_date
  - depression_score
  - depression_category
  - anxiety_score
  - anxiety_category
  - stress_score
  - stress_category
  - wemwbs_score
  - disclaimer
must_not:
  - expose_unrestricted_database
  - authorize_by_guessable_assessment_id_only
  - include_consultation_attachments_by_default
  - include_full_assessment_history_by_default
  - recalculate_scores_in_chatbot
```

---

# SUC-03 — Book Psychologist Consultation

```yaml
id: SUC-03
name: Book Psychologist Consultation
primary_actor: Participant
preconditions:
  - participant_authenticated
  - current_assessment_status == COMPLETED
  - current_report_exists
  - psychologist_selected
  - date_selected
  - fixed_session_selected
fixed_sessions:
  MORNING: "09:00-11:00"
  AFTERNOON: "13:00-15:00"
  EVENING: "16:00-18:00"
guards:
  - selected_session_status == AVAILABLE
  - psychologist_active
  - report_consent == true
optional_inputs:
  participant_note:
    max_chars: 500
conditional_inputs:
  contact_consent:
    required_if: phone_number_will_be_used
transaction:
  - lock_or_verify_availability
  - assert_session_still_AVAILABLE
  - create_appointment_status_CONFIRMED
  - mark_availability_BOOKED
  - create_consultation_session
postconditions:
  - exactly_one_booking_for_psychologist_date_session
  - appointment_status == CONFIRMED
  - no_manual_psychologist_approval_required
errors:
  - SLOT_NOT_AVAILABLE
  - REPORT_CONSENT_REQUIRED
  - CONTACT_CONSENT_REQUIRED
must_not:
  - auto_assign_psychologist
  - allow_arbitrary_time
  - double_book_same_psychologist_session
```

---

# SUC-04 — Psychologist Availability

```yaml
id: SUC-04
name: Manage Psychologist Availability
primary_actor: Psychologist
preconditions:
  - psychologist_authenticated
inputs:
  - date
  - MORNING_available
  - AFTERNOON_available
  - EVENING_available
rules:
  - each_session_independently_configurable
  - all_three_may_be_available
  - some_may_be_available
  - none_may_be_available
guards:
  - psychologist_owns_availability_record
must_not:
  - create_arbitrary_standard_session_time
  - override_existing_booking_as_available
```

---

# SUC-05 — Consultation Check-In

```yaml
id: SUC-05
name: Consultation Check-In
primary_actors:
  - Participant
  - Psychologist
preconditions:
  - appointment_status == CONFIRMED
  - caller_is_appointment_party
guards:
  - now >= scheduled_start_at - check_in_open_before_minutes
actions:
  participant:
    - set_participant_checked_in_at_server_time
  psychologist:
    - set_psychologist_checked_in_at_server_time
postconditions:
  - attendance_timestamp_recorded
  - ready_state_may_be_derived
must_not:
  - trust_client_timestamp
  - allow_unrelated_user_checkin
```

---

# SUC-06 — Send Consultation Text

```yaml
id: SUC-06
name: Send Consultation Text
primary_actors:
  - Participant
  - Psychologist
preconditions:
  - caller_is_appointment_party
  - consultation_session_exists
guards:
  - session_writable
  - now < scheduled_end_at
  - session_not_closed
inputs:
  - text_content
  - emoji_as_text_optional
main_flow:
  - validate_authorization
  - recheck_writable_state
  - persist_message_with_server_timestamp
postconditions:
  - message_visible_to_authorized_counterparty
must_not:
  - persist_after_session_closed
  - persist_after_scheduled_end
```

---

# SUC-07 — Send Consultation Attachment

```yaml
id: SUC-07
name: Send Consultation Attachment
primary_actors:
  - Participant
  - Psychologist
preconditions:
  - caller_is_appointment_party
  - consultation_session_exists
guards:
  - session_writable
  - now < scheduled_end_at
  - max_attachments_per_message == 1
allowed_extensions:
  image:
    - .jpg
    - .jpeg
    - .png
    - .webp
  document:
    - .pdf
allowed_mime_types:
  - image/jpeg
  - image/png
  - image/webp
  - application/pdf
size_limits:
  image_max: 5MB
  pdf_max: 10MB
main_flow:
  - validate_authorization
  - validate_extension
  - validate_MIME
  - validate_size
  - recheck_session_writable
  - generate_safe_private_object_key
  - store_private_file
  - persist_attachment_metadata
  - link_attachment_to_message
postconditions:
  - attachment_private
  - only_appointment_parties_can_retrieve
must_not:
  - use_original_filename_as_storage_path
  - expose_unrestricted_public_URL
  - auto_share_to_AI_chatbot
  - influence_assessment_score
  - accept_DOCX_XLSX_PPTX_ZIP_EXECUTABLE
```

---

# SUC-08 — Psychologist Ends Consultation Early

```yaml
id: SUC-08
name: Psychologist Ends Consultation Early
primary_actor: Psychologist
preconditions:
  - caller_is_assigned_psychologist
  - session_status == IN_PROGRESS
  - now < scheduled_end_at
trigger:
  - psychologist_selects_end_consultation
main_flow:
  - display_confirmation
  - psychologist_confirms
  - backend_revalidates_ownership
  - backend_revalidates_session_open
  - set_ended_at_server_time
  - set_ended_by_PSYCHOLOGIST
  - set_end_reason_PSYCHOLOGIST_COMPLETED
  - close_session
postconditions:
  - message_write_denied
  - attachment_upload_denied
  - authorized_history_read_allowed
must_not:
  - expose_same_action_to_participant
  - close_another_psychologists_session
```

---

# SUC-09 — Automatic Consultation Closure

```yaml
id: SUC-09
name: Automatic Consultation Closure
primary_actor: System
trigger:
  - now >= scheduled_end_at
preconditions:
  - consultation_session_exists
guards:
  - session_not_already_closed
main_flow:
  - close_session_idempotently
  - set_ended_by_SYSTEM
  - set_end_reason_SCHEDULED_END_REACHED
  - disable_message_write
  - disable_attachment_upload
postconditions:
  - authorized_history_read_allowed
  - session_not_extendable
must_not:
  - wait_for_browser_client_to_close
  - extend_into_next_fixed_session
  - create_follow_up_appointment
```

---

# SUC-10 — Psychologist Late / No-Show

```yaml
id: SUC-10
name: Psychologist Late and No-Show Handling
primary_actor: System
configuration:
  late_after_minutes: 5
  no_show_after_minutes: 15
late_condition:
  - psychologist_checked_in_at == null
  - now >= scheduled_start_at + late_after_minutes
late_actions:
  - mark_or_derive_PSYCHOLOGIST_LATE
  - notify_psychologist
  - inform_participant
no_show_condition:
  - psychologist_checked_in_at == null
  - now >= scheduled_start_at + no_show_after_minutes
no_show_actions:
  - mark_no_show
  - mark_appointment_as_failed_or_recoverable_according_to_model
  - expose_reschedule_recovery_if_supported
must_not:
  - classify_reschedule_as_follow_up
```

---

# SUC-11 — Read Closed Consultation

```yaml
id: SUC-11
name: Read Closed Consultation
primary_actors:
  - Participant
  - Psychologist
preconditions:
  - caller_is_appointment_party
  - session_closed
main_flow:
  - authorize_resource
  - return_message_history
  - return_authorized_attachment_metadata
  - provide_private_authorized_attachment_access
ui_state:
  composer_enabled: false
  attachment_upload_enabled: false
must_not:
  - allow_new_message
  - allow_new_attachment
```

---

# SUC-12 — Assessment Quota Enforcement

```yaml
id: SUC-12
name: Assessment Quota Enforcement
primary_actor: Participant
configuration:
  default_limit: 3
scope:
  - per_participant
  - per_academic_period
counted_status:
  - COMPLETED
not_counted_status:
  - IN_PROGRESS
decision:
  if_completed_count_less_than_limit: ALLOW_NEW_ASSESSMENT
  else: DENY_NEW_ASSESSMENT
must_not:
  - count_DASS21_and_WEMWBS_separately
  - carry_previous_period_count_into_new_period
```

---

# Global Coding-Agent Constraints

```yaml
global_constraints:
  security:
    - server_side_authorization_required
    - object_level_authorization_required
    - private_assessment_data
    - private_consultation_attachments
  scoring:
    - deterministic_only
    - no_AI_scoring
  consultation:
    - fixed_sessions_only
    - participant_cannot_end_session
    - psychologist_can_end_early
    - system_auto_closes_at_scheduled_end
    - no_extension_past_two_hours
    - no_follow_up_due_to_insufficient_time
  attachment:
    - JPG_JPEG_PNG_WEBP_PDF_only
    - one_attachment_per_message
    - private_storage
    - no_automatic_chatbot_sharing
```
