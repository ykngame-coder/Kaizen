// Live end-to-end backend check against a real Supabase project.
// Usage: node scripts/verify-backend.mjs <SUPABASE_URL> <ANON_KEY>
//   (or set EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY)
//
// Requires e-mail confirmation to be DISABLED on the project for the test users
// to receive a session. It verifies: profile auto-creation, per-user RLS
// isolation, cross-user insert rejection, and readable exercise library.

import { createClient } from '@supabase/supabase-js';

const url = process.argv[2] || process.env.EXPO_PUBLIC_SUPABASE_URL;
const anon = process.argv[3] || process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !anon) {
  console.error('Usage: node scripts/verify-backend.mjs <SUPABASE_URL> <ANON_KEY>');
  process.exit(2);
}

const rand = () => Math.random().toString(36).slice(2, 10);
const fail = (msg) => {
  console.error('❌', msg);
  process.exit(1);
};

async function newUser() {
  const client = createClient(url, anon, { auth: { persistSession: false } });
  const email = `verify+${rand()}@supotsu.test`;
  const password = `Pw-${rand()}-${rand()}`;
  const { data, error } = await client.auth.signUp({ email, password });
  if (error) fail(`signUp: ${error.message}`);
  if (!data.session) {
    const { error: e2 } = await client.auth.signInWithPassword({ email, password });
    if (e2) fail(`Pas de session après signUp (confirmation e-mail activée ?): ${e2.message}`);
  }
  const { data: u } = await client.auth.getUser();
  return { client, id: u.user.id, email };
}

async function main() {
  console.log('→ Création de deux utilisateurs de test…');
  const a = await newUser();
  const b = await newUser();

  // Profile auto-created by trigger.
  const { data: profile, error: pErr } = await a.client
    .from('profiles')
    .select('*')
    .eq('id', a.id)
    .maybeSingle();
  if (pErr) fail(`lecture profil: ${pErr.message}`);
  if (!profile) fail('Profil non créé automatiquement par le trigger.');
  console.log('✓ Profil auto-créé');

  // A inserts a goal.
  const { error: gErr } = await a.client
    .from('goals')
    .insert({ user_id: a.id, type: 'strength', title: 'Squat 140kg' });
  if (gErr) fail(`insert objectif: ${gErr.message}`);

  const { data: aGoals } = await a.client.from('goals').select('*');
  if ((aGoals?.length ?? 0) !== 1) fail(`A devrait voir 1 objectif, en voit ${aGoals?.length}`);
  console.log('✓ A voit ses propres objectifs');

  // B must not see A's goal.
  const { data: bGoals } = await b.client.from('goals').select('*');
  if ((bGoals?.length ?? 0) !== 0) fail(`B ne devrait voir aucun objectif de A (RLS), en voit ${bGoals?.length}`);
  console.log('✓ Isolation RLS entre utilisateurs');

  // B cannot insert a row owned by A.
  const { error: crossErr } = await b.client
    .from('goals')
    .insert({ user_id: a.id, type: 'health', title: 'hack' });
  if (!crossErr) fail('Insertion cross-utilisateur autorisée (RLS défaillante).');
  console.log('✓ Insertion cross-utilisateur bloquée');

  // Exercise library readable + seeded.
  const { data: exs, error: eErr } = await a.client.from('exercises').select('id');
  if (eErr) fail(`lecture exercices: ${eErr.message}`);
  if ((exs?.length ?? 0) < 8) fail(`Bibliothèque d'exercices non seedée (0002 appliquée ?): ${exs?.length}`);
  console.log(`✓ Bibliothèque d'exercices lisible (${exs.length})`);

  console.log('\n✅ Backend OK — schéma, RLS et seed vérifiés en live.');
}

main().catch((e) => fail(e.message));
