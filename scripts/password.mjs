import { emitKeypressEvents } from 'node:readline';
import { hash, verify, argon2id } from 'argon2';
import { createClient } from '@supabase/supabase-js';

function hiddenInput(prompt) {
  if (!process.stdin.isTTY) throw new Error('Use an interactive terminal');
  process.stdout.write(prompt);
  emitKeypressEvents(process.stdin);
  process.stdin.setRawMode(true);
  process.stdin.resume();
  return new Promise((resolve, reject) => {
    let value = '';
    const onKey = (text, key) => {
      if (key?.name === 'return' || (key?.ctrl && key.name === 'c')) {
        process.stdin.off('keypress', onKey);
        process.stdin.setRawMode(false);
        process.stdin.pause();
        process.stdout.write('\n');
        if (key.ctrl) reject(new Error('Cancelled'));
        else resolve(value);
      } else if (key?.name === 'backspace') value = value.slice(0, -1);
      else if (text && !key?.ctrl && !key?.meta && !/[\x00-\x1f\x7f]/.test(text)) value += text;
    };
    process.stdin.on('keypress', onKey);
  });
}

try {
  const role = process.argv[2];
  if (process.argv.length !== 3 || !['viewer', 'editor'].includes(role)) {
    throw new Error('Usage: npm run password -- viewer|editor');
  }
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) throw new Error('Server environment required');
  const password = await hiddenInput(`New ${role} password (hidden, 12–1024 characters): `);
  const confirmation = await hiddenInput('Confirm password (hidden): ');
  if (password.length < 12 || password.length > 1024 || password !== confirmation) throw new Error('Password length or confirmation invalid');
  const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await db.from('access_credentials').select('password_hash').neq('role', role).maybeSingle();
  if (error) throw new Error('Could not read credentials');
  if (data && await verify(data.password_hash, password)) throw new Error('Viewer and editor passwords must differ');
  const passwordHash = await hash(password, { type: argon2id, memoryCost: 65536, timeCost: 3, parallelism: 1 });
  const { error: rotationError } = await db.rpc('rotate_password', {
    target_role: role, new_hash: passwordHash, other_hash: data?.password_hash ?? null,
  });
  if (rotationError) throw new Error('Rotation failed; credentials may have changed. Retry.');
  process.stdout.write(`${role} password configured; its existing sessions were revoked.\n`);
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
}
