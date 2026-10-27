// Construct only an allowlisted, non-secret recovery document in memory.
import { inspectArchiveToc } from './phase2-db-archive-inspection.mjs';
export const dumpSHA256 = '4F77589A80907C7F64B97353CFF55BCD1BC30D9FF8CA9FCBEE93DBD80214CEA5';
export function parseRecordedJson(text) { return JSON.parse(text.replace(/^\uFEFF/, '')); }
export function buildRecoveryMetadata(verified, audit, now = new Date()) {
  if (!verified.locallyVerified || !verified.fullArchiveReadable || !verified.authenticatedDecryptionPassed ||
      verified.input?.sha256 !== dumpSHA256 || verified.input?.bytes !== 379522 ||
      audit.project !== 'bofoowyzlnfhwcstlmgp' || audit.database !== 'postgres' || audit.serverVersion !== '17.11') throw new Error('COMPANION_VERIFY_MISMATCH');
  const checks = {};
  for (const key of Object.keys(inspectArchiveToc('').checks)) {
    if (verified.coverage?.checks?.[key] !== true) throw new Error('REQUIRED_COVERAGE_MISSING');
    checks[key] = true;
  }
  const counts = {};
  for (const key of Object.keys(inspectArchiveToc('').counts)) {
    const n = verified.coverage.counts[key];
    if (!Number.isSafeInteger(n) || n < 0) throw new Error('COMPANION_VERIFY_MISMATCH');
    counts[key] = n;
  }
  const expectedExtensions = { pg_stat_statements: '1.11', pgcrypto: '1.3', plpgsql: '1.0', supabase_vault: '0.3.1', 'uuid-ossp': '1.1' };
  const extensions = Object.entries(expectedExtensions).map(([name, version]) => {
    if (!audit.extensions?.some(item => item.name === name && item.version === version)) throw new Error('COMPANION_VERIFY_MISMATCH');
    return { name, version };
  });
  for (const timestamp of [verified.finishedUtc, audit.checkedUtc]) {
    if (typeof timestamp !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(timestamp)) throw new Error('COMPANION_VERIFY_MISMATCH');
  }
  return {
    format: 'wellbeing-recovery-companion-v1',
    createdUtc: now.toISOString(), createdAsiaJakarta: new Date(now.getTime() + 25200000).toISOString().replace('Z', '+07:00'),
    source: { project: 'bofoowyzlnfhwcstlmgp', database: 'postgres', databaseVersionObserved: '17.11', observationsUtc: audit.checkedUtc, refreshedForCompanion: false },
    dump: { filename: 'database.dump.age', bytes: 379522, sha256: dumpSHA256, format: 'PostgreSQL custom archive encrypted with age', locallyVerifiedUtc: verified.finishedUtc },
    tools: { postgresqlClient: '17.11', age: '1.3.2', encryption: 'age passphrase mode; owner privately enters existing Retry01 passphrase' },
    archiveVerification: { authenticatedDecryption: true, fullOfflineParse: true, requiredObjectChecks: checks, missingRequiredChecks: [], counts,
      limitations: ['No fresh source-catalog comparison', 'Archived row counts and migration-history values/checksums not independently compared', 'No database restore or effective-privilege test'] },
    roles: { mode: 'RECONSTRUCTION_GUIDANCE_ONLY', definitionsCaptured: false, membershipsCaptured: false,
      instructions: [
        'Use a compatible Supabase environment to provision its managed roles; do not blindly recreate reserved platform roles.',
        'Privately inspect archive owner/grantee references in memory and reconcile them against the isolated target role catalog before applying object DDL/ACLs.',
        'Exact original custom-role attributes and memberships are unavailable in the retained evidence. Obtain separately authorized read-only metadata or authoritative deployment configuration if exact recreation is required.',
        'Do not infer SUPERUSER, BYPASSRLS, LOGIN, memberships or role credentials from a role name. Do not invent executable CREATE ROLE statements.',
        'Role authentication material is excluded. Provision target-only credentials through its secret-management workflow.'
      ] },
    databaseOwnershipAndGrants: { exactOwnerCaptured: false, exactGrantsCaptured: false, owner: null, grants: null,
      instructions: [
        'The existing custom dump was created without --create. Database-level ownership/grants are not established by the verified object ACL entries.',
        'Before restore, choose a reviewed target database owner and reconcile database CONNECT/CREATE/TEMP privileges against authoritative source/platform configuration. Exact source parity remains unresolved without additional approved metadata.',
        'Object ownership, table/function privileges and default ACL entries are represented in the dump; do not remove them and claim permission parity.'
      ] },
    permissions: { profileRlsAndPolicyRepresented: true, objectAclEntries: counts.ACL, defaultAclEntries: counts['DEFAULT ACL'],
      notes: ['Preserve RLS, profile policy, custom Auth function privileges and object ownership using a target-aware reviewed restore plan.',
        'Historical source audit found excessive anon/authenticated access to public._prisma_migrations with RLS off. This backup is not remediation. Any repair requires separate approval.',
        'Verify effective browser/runtime privileges on the isolated target; successful SQL parsing does not prove security enforcement.'] },
    dependencies: { extensions, observedUtc: audit.checkedUtc,
      managedSchemas: ['auth','extensions','graphql','graphql_public','public','realtime','storage','vault'],
      notes: ['Extension binaries and extension-owned definitions must be supplied by a compatible Supabase PostgreSQL target; four archive extension entries do not represent five self-contained extension implementations.',
        'Supabase Auth/Storage/Realtime services and platform configuration are not recreated by a database-only restore.',
        'Provider/email/signing configuration and all authentication secrets are excluded. Reprovision through supported platform controls; never assume old sessions or signing configuration are portable.'],
      storage: { bucketsAtHistoricalAudit: audit.storageBuckets === 0 ? 0 : null, objectsAtHistoricalAudit: audit.storageObjects === 0 ? 0 : null,
        physicalObjectsIncluded: false, note: 'Storage metadata is in the dump. Historical audit found no physical objects to copy; no current Storage query occurred.' } },
    restoreSequence: [
      'Obtain separate isolated-restore approval. Preserve all backup files and the existing synthetic Phase 2 rehearsal.',
      'Use a separate disposable compatible Supabase PostgreSQL 17 target, proposed localhost 127.0.0.1:55433, with independent state and outbound integrations disabled. Verify target identity before writes; no production credentials.',
      'Verify both ciphertext SHA-256 values using the external sanitized record, then authenticate full decryption in memory before consuming archive contents. Never stage plaintext on unencrypted host storage.',
      'Resolve managed roles, database-level owner/grants, extensions and platform baseline differences before selecting restore entries. Do not blindly replay managed objects into an initialized Supabase stack.',
      'For an appropriate clean target, review pre-data, data, then post-data sequencing so custom Auth triggers do not duplicate profile creation. An initialized platform requires an explicit compatible object-selection and target-only trigger plan.',
      'Require zero unexplained errors; compare table/row coverage, users/profile links, both Auth triggers/functions, Prisma history/checksums, RLS/policies and effective ownership/grants. Keep any inspected rows private.',
      'Service-level signup/login requires a compatible isolated Auth service with outbound mail disabled and synthetic test identities. Record actual recovery only after the separately approved validation succeeds.'
    ],
    exclusions: ['Role authentication material', 'Platform secrets and provider configuration', 'Personal records in this companion', 'Physical Storage objects', 'Exact cluster role definitions/memberships and database-level owner/grants not retained'],
    residualRisks: ['Windows unencrypted memory/pagefile/crash exposure is not eliminated by direct file encryption', 'Previous export reported a non-TLS pooler/backend leg; this local operation made no production connection'],
    custodyAndOffsite: ['Keep the Retry01 passphrase privately recoverable outside these encrypted files.', 'Manual private Restricted Google Drive upload is a later owner action; no upload occurs here.', 'Download separate copies, compare both ciphertext checksums, and authenticate both in memory before marking the off-device database copy verified.'],
    status: { productionConnection: false, newExport: false, exactRoleAndDatabasePrivilegeParityVerified: false, restored: false, uploaded: false, containsCredentialsOrPersonalRecords: false }
  };
}
