/**
 * NEXIA OS — Define usuário como MASTER no Firebase
 * 
 * Este script DEVE ser executado uma vez para o admin principal.
 * Ele define custom claims no Firebase Auth (role: 'master')
 * E atualiza o documento do usuário no Firestore.
 *
 * Como executar:
 *   No Render → seu serviço → Shell (ou localmente com .env):
 *   MASTER_EMAIL=admin@nexia.com node set-master-role.js
 */
'use strict';

const { admin, db } = require('./netlify/functions/firebase-init');

const EMAIL = process.env.MASTER_EMAIL || 'admin@nexia.com';

async function run() {
  if (!admin || !db) {
    console.error('❌ Firebase Admin não inicializado.');
    console.error('   Configure FIREBASE_SERVICE_ACCOUNT_BASE64 no ambiente.');
    process.exit(1);
  }

  console.log('🔍 Buscando usuário:', EMAIL);

  // 1. Busca o uid pelo email no Firebase Auth
  let userRecord;
  try {
    userRecord = await admin.auth().getUserByEmail(EMAIL);
  } catch (e) {
    console.error('❌ Usuário não encontrado no Firebase Auth:', EMAIL);
    console.error('   O usuário precisa ter feito login pelo menos uma vez.');
    process.exit(1);
  }

  const uid = userRecord.uid;
  console.log('✅ Usuário encontrado — UID:', uid);

  // 2. Define custom claims no Firebase Auth
  await admin.auth().setCustomUserClaims(uid, {
    role: 'master',
    tenantSlug: 'nexia'
  });
  console.log('✅ Custom claims definidos: role=master, tenantSlug=nexia');

  // 3. Atualiza documento no Firestore
  await db.collection('users').doc(uid).set({
    uid,
    email: EMAIL,
    displayName: userRecord.displayName || 'Admin NEXIA',
    role: 'master',
    tenantSlug: 'nexia',
    onboardingDone: true,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });
  console.log('✅ Firestore atualizado: onboardingDone=true, role=master');

  console.log('\n🎉 Pronto! Faça logout e login novamente para os novos claims serem aplicados.');
  process.exit(0);
}

run().catch(e => {
  console.error('❌ Erro:', e.message);
  process.exit(1);
});
