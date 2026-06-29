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
 *
 * Or add entries from a file:
 *   node scripts/add.js --file words.txt
 */

const fs   = require('fs');
const path = require('path');

const DICT_DIR   = path.join(__dirname, '..', 'dictionary');
const INDEX_FILE = path.join(DICT_DIR, 'index.json');

// ── Argument parsing ──────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const fileFlagIndex = args.findIndex(arg => arg === '--file' || arg === '-f');
const entries = [];

function parseLine(line, lineNumber) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) return null;

  const parts = trimmed.split(/\s+/);
  const romanized = String(parts[0]).toLowerCase().trim();
  const khmerArgs = parts.slice(1);

  if (!romanized || !/^[a-z]+$/.test(romanized)) {
    console.error(`Error: romanized key must be lowercase a-z letters only. Got: "${romanized}" on line ${lineNumber}`);
    process.exit(1);
  }

  if (khmerArgs.length === 0) {
    console.error(`Error: missing Khmer value for romanized key "${romanized}" on line ${lineNumber}`);
    process.exit(1);
  }

  return {
    romanized,
    value: khmerArgs.length === 1 ? khmerArgs[0] : khmerArgs,
  };
}

if (fileFlagIndex !== -1) {
  if (fileFlagIndex === args.length - 1) {
    console.error('Error: missing file path after --file');
    process.exit(1);
  }

  if (args.length > fileFlagIndex + 2) {
    console.error('Error: unexpected arguments after file path');
    process.exit(1);
  }

  const filePath = args[fileFlagIndex + 1];
  const text = fs.readFileSync(path.resolve(process.cwd(), filePath), 'utf8');

  text.split(/\r?\n/).forEach((line, lineNumber) => {
    const entry = parseLine(line, lineNumber + 1);
    if (entry) entries.push(entry);
  });
} else {
  if (args.length < 2) {
    console.error('Usage: node scripts/add.js <romanized> <khmer> [<khmer2> ...] [<romanized> <khmer> ...]');
    console.error('Example: node scripts/add.js chong ចង់');
    console.error('Multiple entries: node scripts/add.js chong ចង់ jg ចង់ ចឹង heuy ហើយ');
    console.error('File import: node scripts/add.js --file words.txt');
    process.exit(1);
  }

  let index = 0;
  while (index < args.length) {
    const romanized = String(args[index]).toLowerCase().trim();
    if (!romanized || !/^[a-z]+$/.test(romanized)) {
      console.error(`Error: romanized key must be lowercase a-z letters only. Got: "${romanized}"`);
      process.exit(1);
    }

    index += 1;
    const khmerArgs = [];

    while (index < args.length && !/^[a-z]+$/.test(args[index])) {
      const token = String(args[index]).trim();
      if (token) khmerArgs.push(token);
      index += 1;
    }

    if (khmerArgs.length === 0) {
      console.error(`Error: missing Khmer value for romanized key "${romanized}"`);
      process.exit(1);
    }

    if (entries.some(entry => entry.romanized === romanized)) {
      console.error(`Error: duplicate romanized key in one command: "${romanized}"`);
      process.exit(1);
    }

    entries.push({
      romanized,
      value: khmerArgs.length === 1 ? khmerArgs[0] : khmerArgs,
    });
  }
}

if (!entries.length) {
  console.error('Error: no entries found');
  process.exit(1);
}

const entriesByLetter = entries.reduce((map, entry) => {
  const letter = entry.romanized[0];
  if (!map[letter]) map[letter] = [];
  map[letter].push(entry);
  return map;
}, {});

const existingIndex = JSON.parse(fs.readFileSync(INDEX_FILE, 'utf8'));
let updatedIndex = [...existingIndex];

for (const letter of Object.keys(entriesByLetter).sort()) {
  const dictFile = path.join(DICT_DIR, `${letter}.json`);
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

  for (const { romanized, value } of entriesByLetter[letter]) {
    if (Object.prototype.hasOwnProperty.call(dict, romanized)) {
      const existingValue = dict[romanized];
      const existingList = Array.isArray(existingValue) ? existingValue : [existingValue];
      const incomingList = Array.isArray(value) ? value : [value];

      const uniqueIncoming = incomingList.filter(v => !existingList.includes(v));
      if (uniqueIncoming.length === 0) {
        console.log(`Nothing to do — "${romanized}" already maps to ${JSON.stringify(existingValue)}`);
        continue;
      }

      const combined = [...existingList, ...uniqueIncoming];
      dict[romanized] = combined.length === 1 ? combined[0] : combined;
      console.log(`✓ Updated "${romanized}" → ${JSON.stringify(dict[romanized])}  (dictionary/${letter}.json)`);
      continue;
    }

    dict[romanized] = value;
    console.log(`✓ Added "${romanized}" → ${JSON.stringify(value)}  (dictionary/${letter}.json)`);
  }

  const sorted = Object.fromEntries(
    Object.entries(dict).sort(([a], [b]) => a.localeCompare(b))
  );

  fs.writeFileSync(dictFile, JSON.stringify(sorted, null, 2) + '\n', 'utf8');

  if (!updatedIndex.includes(letter)) {
    updatedIndex.push(letter);
  }
}

updatedIndex = [...new Set(updatedIndex)].sort();
if (updatedIndex.length !== existingIndex.length || updatedIndex.some((letter, i) => letter !== existingIndex[i])) {
  fs.writeFileSync(INDEX_FILE, JSON.stringify(updatedIndex) + '\n', 'utf8');
  const addedLetters = updatedIndex.filter(letter => !existingIndex.includes(letter));
  addedLetters.forEach(letter => console.log(`✓ Added "${letter}" to index.json`));
}
