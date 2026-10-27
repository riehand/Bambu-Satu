// Offline helpers. Return only aggregate counts and known project-object labels.
export function ageDiagnosticCategory(text) {
  if (/could not read passphrase|failed to read passphrase/i.test(text)) return 'PRIVATE_INPUT_READ_FAILED';
  if (/CONIN\$|CONOUT\$|not a terminal|terminal.*(unavailable|cannot|failed)/i.test(text)) return 'PRIVATE_TERMINAL_UNAVAILABLE';
  if (/incorrect passphrase/i.test(text)) return 'PASSPHRASE_NOT_ACCEPTED';
  if (/failed to decrypt.*file key|no identity matched|no identity matches/i.test(text)) return 'FILE_KEY_AUTHENTICATION_FAILED_CAUSE_UNDETERMINED';
  if (/authentication|failed to decrypt|invalid tag/i.test(text)) return 'DECRYPTION_OR_AUTHENTICATION_FAILED_CAUSE_UNDETERMINED';
  if (/invalid header|malformed|unexpected EOF|truncated/i.test(text)) return 'ENCRYPTED_INPUT_FORMAT_OR_TRUNCATION_ERROR';
  if (/access is denied|permission denied|cannot find|no such file/i.test(text)) return 'LOCAL_FILE_ACCESS_FAILED';
  return 'AGE_FAILURE_UNCLASSIFIED_RAW_TEXT_SUPPRESSED';
}

export function inspectArchiveToc(toc) {
  const lines = toc.split(/\r?\n/).filter(line => /^\d+; \d+ \d+ /.test(line));
  const entries = lines.map(line => line.replace(/^\d+; \d+ \d+ /, ''));
  const has = value => entries.some(entry => entry.startsWith(value + ' '));
  const required = [
    ['applicationTable', 'TABLE public users'], ['applicationData', 'TABLE DATA public users'],
    ['authUsersTable', 'TABLE auth users'], ['authUsersData', 'TABLE DATA auth users'],
    ['authIdentitiesTable', 'TABLE auth identities'], ['authIdentitiesData', 'TABLE DATA auth identities'],
    ['prismaHistoryTable', 'TABLE public _prisma_migrations'], ['prismaHistoryData', 'TABLE DATA public _prisma_migrations'],
    ['authCreateFunction', 'FUNCTION public handle_auth_user_created()'],
    ['authEmailFunction', 'FUNCTION public handle_auth_email_changed()'],
    ['authCreateTrigger', 'TRIGGER auth users wellbeing_auth_user_created'],
    ['authEmailTrigger', 'TRIGGER auth users wellbeing_auth_email_changed'],
    ['profileRls', 'ROW SECURITY public users'],
    ['profilePolicy', 'POLICY public users users_read_own_active_profile'],
    ['profilePrivileges', 'ACL public TABLE users'],
    ['authCreateFunctionPrivileges', 'ACL public FUNCTION handle_auth_user_created()'],
    ['authEmailFunctionPrivileges', 'ACL public FUNCTION handle_auth_email_changed()'],
    ['storageBuckets', 'TABLE storage buckets'], ['storageObjects', 'TABLE storage objects'],
    ['vaultExtensionDependency', 'EXTENSION - supabase_vault'],
  ];
  const checks = Object.fromEntries(required.map(([key, value]) => [key, has(value)]));
  const kinds = ['TABLE DATA', 'TABLE', 'FUNCTION', 'TRIGGER', 'POLICY', 'ROW SECURITY', 'ACL', 'DEFAULT ACL', 'EXTENSION', 'SCHEMA'];
  const counts = Object.fromEntries(kinds.map(kind => [kind, entries.filter(entry => entry.startsWith(kind + ' ') && !(kind === 'TABLE' && entry.startsWith('TABLE DATA '))).length]));
  const knownSchemaCounts = Object.fromEntries(['auth','public','realtime','storage','vault'].map(schema => [schema, {
    definitions: entries.filter(entry => entry.startsWith(`TABLE ${schema} `)).length,
    dataEntries: entries.filter(entry => entry.startsWith(`TABLE DATA ${schema} `)).length,
  }]));
  return { checks, missingRequiredChecks: Object.keys(checks).filter(key => !checks[key]), counts, knownSchemaCounts,
    entryCount: lines.length, liveCatalogCompared: false, archivedRowValuesVerified: false };
}
