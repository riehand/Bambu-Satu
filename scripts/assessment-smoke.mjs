// Anonymous, local-only smoke checks. No credentials, content or test users.
const base = new URL(process.argv[2] ?? "http://127.0.0.1:3100");
if (!["127.0.0.1", "localhost"].includes(base.hostname)) throw new Error("Only a local server is permitted");
const id = "00000000-0000-4000-8000-000000000001";
const checks = [
  ["GET", "/participant/dashboard", 307],
  ["GET", "/participant/assessment", 307],
  ["GET", "/participant/history", 307],
  ["GET", "/api/assessment/quota", 401],
  ["GET", "/api/assessment/questions", 401],
  ["GET", "/api/assessment/history", 401],
  ["GET", `/api/assessment/sessions/${id}`, 401],
  ["POST", "/api/assessment/sessions", 401],
  ["PUT", `/api/assessment/sessions/${id}/answers`, 401],
  ["POST", `/api/assessment/sessions/${id}/submit`, 401],
];
for (const [method, path, expected] of checks) {
  const response = await fetch(new URL(path, base), { method, redirect: "manual" });
  const privateResponse = response.headers.get("cache-control")?.includes("no-store");
  const passed = response.status === expected && privateResponse;
  console.log(`${passed ? "PASS" : "FAIL"} ${method} ${path}: ${response.status}; private=${privateResponse}`);
  if (!passed) process.exitCode = 1;
}
