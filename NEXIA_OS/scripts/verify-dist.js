#!/usr/bin/env node
/**
 * NEXIA OS — verify-dist.js
 * Verifica se todos os diretórios e arquivos essenciais estão presentes.
 * Roda no CI (GitHub Actions) antes do deploy.
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

// Diretórios e arquivos obrigatórios para o servidor funcionar
const REQUIRED_DIRS = [
  'nexia',
  'core',
  'netlify/functions',
  'ces',
  'viajante-pro',
  'bezsan',
  'splash',
];

const REQUIRED_FILES = [
  'index.html',
  'login.html',
  'server.js',
  'package.json',
  'nexia/nexia-design-system.css',
  'nexia/cortex-app.html',
  'nexia/my-panel.html',
  'nexia/plans.html',
  'nexia/onboarding.html',
  'nexia/tenant-hub.html',
  'nexia/sentinel-dashboard.html',
  'core/auth.js',
  'core/config.js',
  'netlify/functions/cortex-chat.js',
  'netlify/functions/auth.js',
  'netlify/functions/usage.js',
  'netlify/functions/kpi-engine.js',
];

let failed = false;

console.log('\n📦 NEXIA — verify-dist\n' + '─'.repeat(50));

// Check directories
console.log('\nDiretórios:');
for (const dir of REQUIRED_DIRS) {
  const full = path.join(ROOT, dir);
  const ok   = fs.existsSync(full) && fs.statSync(full).isDirectory();
  console.log(`  ${ok ? '✅' : '❌'} ${dir}`);
  if (!ok) failed = true;
}

// Check files
console.log('\nArquivos críticos:');
for (const file of REQUIRED_FILES) {
  const full = path.join(ROOT, file);
  const ok   = fs.existsSync(full) && fs.statSync(full).isFile();
  console.log(`  ${ok ? '✅' : '❌'} ${file}`);
  if (!ok) failed = true;
}

// Count netlify functions
const fnDir   = path.join(ROOT, 'netlify', 'functions');
const fnCount = fs.existsSync(fnDir)
  ? fs.readdirSync(fnDir).filter(f => f.endsWith('.js')).length
  : 0;
console.log(`\n  📌 netlify/functions: ${fnCount} arquivo(s)`);

// Count nexia pages
const nexiaDir   = path.join(ROOT, 'nexia');
const nexiaCount = fs.existsSync(nexiaDir)
  ? fs.readdirSync(nexiaDir).filter(f => f.endsWith('.html')).length
  : 0;
console.log(`  📌 nexia/*.html: ${nexiaCount} página(s)`);

// Validate nexia pages have design system link
console.log('\nDesign System injection:');
let dsOk = 0, dsFail = 0;
if (fs.existsSync(nexiaDir)) {
  const pages = fs.readdirSync(nexiaDir).filter(f => f.endsWith('.html'));
  for (const page of pages) {
    const content = fs.readFileSync(path.join(nexiaDir, page), 'utf8');
    const hasDS   = content.includes('nexia-design-system.css');
    if (hasDS) dsOk++; else { dsFail++; console.log(`    ❌ ${page} — missing DS link`); }
  }
  if (dsOk === pages.length) {
    console.log(`  ✅ ${dsOk}/${pages.length} páginas com design system`);
  } else {
    console.log(`  ⚠️  ${dsFail} página(s) sem design system`);
  }
}

console.log('\n' + '─'.repeat(50));
if (failed) {
  console.error('❌ verify-dist FALHOU — arquivos ou diretórios ausentes\n');
  process.exit(1);
} else {
  console.log('✅ verify-dist OK — todos os arquivos presentes\n');
  process.exit(0);
}
