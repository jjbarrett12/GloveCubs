/**
 * Create the first GloveCubs admin on an empty / greenfield project.
 *
 * Identity: auth.users (UUID). public.users is the portal profile row with the same id (bcrypt for Express login).
 * public.app_admins — admin API access (auth_user_id; email is display/metadata only).
 *
 * Requires: .env with SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 * Requires: BOOTSTRAP_ADMIN_EMAIL, BOOTSTRAP_ADMIN_PASSWORD (min 8 chars)
 *
 * Run: node scripts/bootstrap-admin.js
 */
'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const bcrypt = require('bcryptjs');
const { getSupabaseAdmin } = require('../lib/supabaseAdmin');
const usersService = require('../services/usersService');

function requireEnv(name) {
  const v = process.env[name];
  if (v == null || String(v).trim() === '') {
    console.error(`Missing ${name}. Set in .env (see .env.example).`);
    process.exit(1);
  }
  return String(v).trim();
}

async function ensureAuthUser(supabase, emailLower, plainPassword) {
  const { data: created, error: createErr } = await supabase.auth.admin.createUser({
    email: emailLower,
    password: plainPassword,
    email_confirm: true,
  });
  if (!createErr && created?.user?.id) {
    return { authUserId: String(created.user.id), created: true };
  }
  const msg = String(createErr?.message || '').toLowerCase();
  const dup =
    msg.includes('registered') || msg.includes('already been') || msg.includes('already exists') || msg.includes('duplicate');
  if (dup) {
    const existing = await usersService.findAuthUserIdByEmail(supabase, emailLower);
    if (existing) {
      await supabase.auth.admin.updateUserById(existing, { password: plainPassword, email_confirm: true });
      return { authUserId: existing, created: false };
    }
  }
  throw createErr || new Error('Auth user creation failed');
}

async function ensureAppAdminRow(supabase, authUserId, emailLower) {
  const { data: admExisting } = await supabase
    .from('app_admins')
    .select('auth_user_id')
    .eq('auth_user_id', authUserId)
    .maybeSingle();
  if (!admExisting) {
    const { error: admErr } = await supabase.from('app_admins').insert({ auth_user_id: authUserId, email: emailLower });
    if (admErr) throw admErr;
    console.log('Inserted public.app_admins (auth_user_id)');
  } else {
    await supabase.from('app_admins').update({ email: emailLower }).eq('auth_user_id', authUserId);
    console.log('public.app_admins already present; refreshed email');
  }
}

async function main() {
  const emailLower = requireEnv('BOOTSTRAP_ADMIN_EMAIL').toLowerCase();
  const plainPassword = requireEnv('BOOTSTRAP_ADMIN_PASSWORD');
  if (plainPassword.length < 8) {
    console.error('BOOTSTRAP_ADMIN_PASSWORD must be at least 8 characters.');
    process.exit(1);
  }

  const supabase = getSupabaseAdmin();
  const password_hash = bcrypt.hashSync(plainPassword, 10);

  const { data: existingPu } = await supabase.from('users').select('id').ilike('email', emailLower).maybeSingle();

  let jwtSubject;

  if (existingPu?.id != null) {
    const uid = String(existingPu.id);
    const { authUserId } = await ensureAuthUser(supabase, emailLower, plainPassword);
    if (String(authUserId) !== uid) {
      console.error(
        'public.users.id and Supabase Auth user id must match for this email. Resolve the conflict or use another email.',
      );
      process.exit(1);
    }
    await supabase
      .from('users')
      .update({
        password_hash,
        is_approved: 1,
        company_name: 'GloveCubs',
        contact_name: 'Administrator',
        updated_at: new Date().toISOString(),
      })
      .eq('id', uid);
    console.log('Updated public.users for', emailLower);
    jwtSubject = uid;
  } else {
    const merged = await usersService.createUser({
      email: emailLower,
      password_hash,
      plain_password: plainPassword,
      company_name: 'GloveCubs',
      contact_name: 'Administrator',
      is_approved: 1,
      discount_tier: 'standard',
      payment_terms: 'credit_card',
    });
    jwtSubject = merged.id;
    console.log('Created public.users + Auth via usersService.createUser');
  }

  await ensureAppAdminRow(supabase, jwtSubject, emailLower);

  console.log('\nDone. Sign in at the portal with this email and password.');
  console.log('JWT `id` (canonical):', jwtSubject);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
