// Development builds can use a hosted backend. Only the explicit isolated
// fixture may enable the provisional institutional workflow in development.
export function isolatedConsultationPolicy() {
  if (["hosted", "staging"].includes(process.env.WELLBEING_RUNTIME ?? "")) return false;
  return process.env.NODE_ENV === "test" || (process.env.NODE_ENV === "development" && Boolean(process.env.WELLBEING_LOCAL_RUNTIME_FILE));
}
