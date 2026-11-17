import 'dotenv/config';
import pg from 'pg';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('Missing DATABASE_URL in environment.');
  process.exit(1);
}

function csvCell(value) {
  const s = value == null ? '' : String(value);
  return `"${s.replace(/"/g, '""')}"`;
}

const pool = new pg.Pool({ connectionString: databaseUrl });

try {
  const res = await pool.query(`
    select u.email, p.full_name, p.created_at, p.policy_version
    from profiles p
    join users u on u.id = p.user_id
    order by p.created_at asc
  `);

  process.stdout.write('email,full_name,created_at,policy_version\n');
  for (const row of res.rows) {
    const iso = new Date(row.created_at).toISOString();
    process.stdout.write(
      [
        csvCell(row.email),
        csvCell(row.full_name),
        csvCell(iso),
        csvCell(row.policy_version),
      ].join(',') + '\n'
    );
  }
} finally {
  await pool.end();
}
