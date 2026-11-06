/**
 * Disposable local PostgreSQL security run.
 *
 * Supabase's hosted stack is not reachable from this environment (no access token), and
 * Docker is unavailable, so the real `supabase/migrations/*.sql` are applied to a
 * throwaway PostgreSQL 17 cluster with only the Supabase `auth` prerequisites stubbed
 * (`tests/security/local-bootstrap.sql`). The policies under test are the checked-in
 * ones, unmodified.
 *
 * Suites: the repository's own SQL suites plus the doctor-assistant suite.
 * Nothing here touches a hosted project and the cluster is deleted afterwards.
 *
 * Usage: npm run test:db:security
 */

import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readdirSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const PGBIN = process.env.PGBIN ?? '/opt/homebrew/opt/postgresql@17/bin';
const PORT = process.env.PGPORT_TEST ?? '55432';

const SUITES = [
  { name: 'RLS and ownership', file: 'supabase/tests/rls.sql' },
  { name: 'Constraints and IST buckets', file: 'supabase/tests/constraints.sql' },
  { name: 'Mark Reviewed authorization', file: 'supabase/tests/mark_reviewed.sql' },
  { name: 'Availability and booking', file: 'supabase/tests/booking.sql' },
  { name: 'Doctor appointment reads', file: 'supabase/tests/doctor_appointments.sql' },
  { name: 'Emergency authorization', file: 'supabase/tests/emergency_authorization.sql' },
  { name: 'Service-role server grants', file: 'supabase/tests/service_role_grants.sql' },
  { name: 'Doctor assistant data paths', file: 'tests/security/doctor-assistant-rls.sql' },
  { name: 'Report deletion authorization', file: 'tests/security/delete-report-rls.sql' },
];

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: 'utf8', ...options });
  if (result.error) throw result.error;
  return result;
}

function psql(work, args) {
  return run(join(PGBIN, 'psql'), ['-X', '-q', '-v', 'ON_ERROR_STOP=1', '-h', work.socket, '-p', PORT, '-U', 'postgres', ...args]);
}

function main() {
  const work = { dir: mkdtempSync(join(tmpdir(), 'samvad-rls-')), socket: '' };
  work.socket = join(work.dir, 'sock');
  mkdirSync(work.socket, { recursive: true });
  const dataDir = join(work.dir, 'data');

  let stopped = false;
  const stop = () => {
    if (stopped) return;
    stopped = true;
    run(join(PGBIN, 'pg_ctl'), ['-D', dataDir, '-m', 'immediate', 'stop']);
    rmSync(work.dir, { recursive: true, force: true });
  };

  try {
    console.log(`[1] initdb in ${dataDir}`);
    let init = run(join(PGBIN, 'initdb'), ['-D', dataDir, '-U', 'postgres', '-A', 'trust', '-E', 'UTF8', '--locale=en_US.UTF-8']);
    if (init.status !== 0) {
      init = run(join(PGBIN, 'initdb'), ['-D', dataDir, '-U', 'postgres', '-A', 'trust', '-E', 'UTF8']);
    }
    if (init.status !== 0) throw new Error(`initdb failed: ${init.stderr}`);

    console.log(`[2] starting PostgreSQL on port ${PORT} (unix socket only)`);
    const start = run(join(PGBIN, 'pg_ctl'), [
      '-D',
      dataDir,
      '-l',
      join(work.dir, 'postgres.log'),
      '-o',
      `-p ${PORT} -k ${work.socket} -c listen_addresses=''`,
      'start',
    ]);
    if (start.status !== 0) throw new Error(`pg_ctl start failed: ${start.stderr}`);

    console.log('[3] creating database and Supabase auth prerequisites');
    let res = run(join(PGBIN, 'createdb'), ['-h', work.socket, '-p', PORT, '-U', 'postgres', 'samvad_test']);
    if (res.status !== 0) throw new Error(`createdb failed: ${res.stderr}`);

    const base = ['-d', 'samvad_test'];
    res = psql(work, [...base, '-f', resolve(ROOT, 'tests/security/local-bootstrap.sql')]);
    if (res.status !== 0) throw new Error(`bootstrap failed: ${res.stderr}`);

    console.log('[4] applying supabase/migrations (unmodified)');
    const migrations = readdirSync(resolve(ROOT, 'supabase/migrations'))
      .filter((file) => file.endsWith('.sql'))
      .sort();
    for (const file of migrations) {
      const applied = psql(work, [...base, '-f', resolve(ROOT, 'supabase/migrations', file)]);
      if (applied.status !== 0) throw new Error(`migration ${file} failed: ${applied.stderr}`);
    }
    console.log(`    ${migrations.length} migrations applied`);

    console.log('[5] applying supabase/seed.sql (fictional data)');
    const seeded = psql(work, [...base, '-f', resolve(ROOT, 'supabase/seed.sql')]);
    if (seeded.status !== 0) throw new Error(`seed failed: ${seeded.stderr}`);

    console.log('[6] creating local doctor mappings used by the suites');
    const fixtures = psql(work, [...base, '-f', resolve(ROOT, 'tests/security/local-fixtures.sql')]);
    if (fixtures.status !== 0) throw new Error(`local fixtures failed: ${fixtures.stderr}`);

    const results = [];
    for (const suite of SUITES) {
      const file = resolve(ROOT, suite.file);
      const out = psql(work, [...base, '-f', file]);
      const stderr = out.stderr ?? '';
      const passCount = (stderr.match(/PASS:/g) ?? []).length;
      const failCount = (stderr.match(/FAIL:/g) ?? []).length;
      results.push({
        suite: suite.name,
        file: suite.file,
        status: out.status === 0 ? 'PASS' : 'FAIL',
        assertions: passCount,
        failures: failCount,
        error: out.status === 0 ? undefined : stderr.split('\n').filter((line) => line.includes('FAIL') || line.includes('ERROR')).slice(0, 4).join(' | '),
      });
      console.log(`    ${out.status === 0 ? 'PASS' : 'FAIL'}  ${suite.name} (${passCount} assertions)`);
    }

    console.log('\n| Suite | File | Result | Assertions |');
    console.log('|---|---|---|---|');
    for (const row of results) {
      console.log(`| ${row.suite} | \`${row.file}\` | ${row.status} | ${row.assertions} |`);
    }

    const failed = results.filter((row) => row.status !== 'PASS');
    if (failed.length > 0) {
      console.error('\nFailed suites:');
      for (const row of failed) console.error(`- ${row.suite}: ${row.error ?? 'see output'}`);
      process.exitCode = 1;
    } else {
      console.log(`\nAll ${results.length} database suites passed.`);
    }
  } finally {
    stop();
  }
}

main();
