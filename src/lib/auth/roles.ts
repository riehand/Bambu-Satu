export const dashboardPaths = {
  PARTICIPANT: "/participant/dashboard",
  PSYCHOLOGIST: "/psychologist/dashboard",
  SUPERADMIN: "/admin/dashboard",
} as const;

export type AppRole = keyof typeof dashboardPaths;

export function isAppRole(value: string): value is AppRole {
  return Object.hasOwn(dashboardPaths, value);
}
