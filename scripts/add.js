#!/usr/bin/env node
/**
 * Add a word to the dictionary.
 *
 * Usage:
 *   node scripts/add.js <romanized> <khmer>
 *   node scripts/add.js chong ចង់
 *
 * Multiple Khmer options (shows popup):
 *   node scripts/add.js jg ចង់ ចឹង
 */

const fs   = require('fs');
const path = require('path');

const DICT_DIR   = path.join(__dirname, '..', 'dictionary');
const INDEX_FILE = path.join(DICT_DIR, 'index.json');

// ── Argument parsing ──────────────────────────────────────────────────────────

const args = process.argv.slice(2);

if (args.length < 2) {
  console.error('Usage: node scripts/add.js <romanized> <khmer> [khmer2 ...]');
  console.error('Example: node scripts/add.js chong ចង់');
  console.error('Array:   node scripts/add.js jg ចង់ ចឹង');
  process.exit(1);
}

const romanized = args[0].toLowerCase().trim();
const khmerArgs = args.slice(1).map(s => s.trim()).filter(Boolean);
const value     = khmerArgs.length === 1 ? khmerArgs[0] : khmerArgs;

if (!romanized || !/^[a-z]+$/.test(romanized)) {
  console.error(`Error: romanized key must be lowercase a-z letters only. Got: "${romanized}"`);
  process.exit(1);
}

// ── Resolve target file ───────────────────────────────────────────────────────

const letter   = romanized[0];
const dictFile = path.join(DICT_DIR, `${letter}.json`);

// ── Load or create the letter file ───────────────────────────────────────────

let dict = {};
if (fs.existsSync(dictFile)) {
  try {
    dict = JSON.parse(fs.readFileSync(dictFile, 'utf8'));
  } catch (e) {
    console.error(`Error: could not parse ${letter}.json — ${e.message}`);
    process.exit(1);
  }
} else {
  console.log(`Creating new file: dictionary/${letter}.json`);
}

// ── Duplicate check ───────────────────────────────────────────────────────────

if (Object.prototype.hasOwnProperty.call(dict, romanized)) {
  const existing = JSON.stringify(dict[romanized]);
  const incoming = JSON.stringify(value);
  if (existing === incoming) {
    console.log(`Nothing to do — "${romanized}" already maps to ${existing}`);
    process.exit(0);
  }
  console.warn(`Warning: "${romanized}" already exists → ${existing}`);
  console.warn(`         Overwriting with → ${incoming}`);
}

// ── Add + sort ────────────────────────────────────────────────────────────────

dict[romanized] = value;

const sorted = Object.fromEntries(
  Object.entries(dict).sort(([a], [b]) => a.localeCompare(b))
);

// ── Save ──────────────────────────────────────────────────────────────────────

fs.writeFileSync(dictFile, JSON.stringify(sorted, null, 2) + '\n', 'utf8');
console.log(`✓ Added "${romanized}" → ${JSON.stringify(value)}  (dictionary/${letter}.json)`);

// ── Update index.json if the letter is new ────────────────────────────────────

let index = JSON.parse(fs.readFileSync(INDEX_FILE, 'utf8'));
if (!index.includes(letter)) {
  index = [...index, letter].sort();
  fs.writeFileSync(INDEX_FILE, JSON.stringify(index) + '\n', 'utf8');
  console.log(`✓ Added "${letter}" to index.json`);
}
