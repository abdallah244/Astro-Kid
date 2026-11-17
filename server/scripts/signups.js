// Who signed up? Prints totals and the latest sign-ups (name, email, date).
// Usage:  npm run signups            (latest 20)
//         npm run signups -- 100     (latest 100)
// Read-only. Run it on the server, the output contains personal data: do not share it.
import 'dotenv/config';
import pg from 'pg';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('Missing DATABASE_URL in environment.');
  process.exit(1);
}

const limit = Math.min(Math.max(parseInt(process.argv[2] || '20', 10) || 20, 1), 1000);
const pool = new pg.Pool({ connectionString: databaseUrl });

try {
  const totals = await pool.query(`
    select
      (select count(*) from users)::int                                                   as accounts,
      (select count(*) from profiles)::int                                                as signups,
      (select count(*) from profiles where created_at >= date_trunc('day', now()))::int   as today,
      (select count(*) from profiles where created_at >= now() - interval '7 days')::int  as last7,
      (select count(*) from users u where not exists
         (select 1 from profiles p where p.user_id = u.id))::int                          as unfinished
  `);
  const t = totals.rows[0];
  console.log('');
  console.log('ASTRO KID SIGN-UPS');
  console.log('------------------');
  console.log(`Completed sign-ups : ${t.signups}`);
  console.log(`Today              : ${t.today}`);
  console.log(`Last 7 days        : ${t.last7}`);
  console.log(`Google sign-ins without a name yet: ${t.unfinished}`);
  console.log('');

  const rows = await pool.query(
    `select p.created_at, p.full_name, u.email, coalesce(p.signup_source, 'direct') as source
       from profiles p join users u on u.id = p.user_id
      order by p.created_at desc
      limit $1`,
    [limit]
  );
  if (rows.rowCount === 0) {
    console.log('No sign-ups yet.');
  } else {
    console.log(`Latest ${rows.rowCount}:`);
    console.table(
      rows.rows.map((r) => ({
        date: new Date(r.created_at).toISOString().replace('T', ' ').slice(0, 16),
        name: r.full_name,
        email: r.email,
        source: r.source,
      }))
    );
  }
} finally {
  await pool.end();
}
