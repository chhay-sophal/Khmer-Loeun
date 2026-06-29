# ខ្មែរលឿន · Khmer Loeun

A Chrome extension that converts informal Khmer romanization (the way Cambodians type on Facebook, Telegram, etc.) into Khmer Unicode — instantly, as you type.

Type `chong` + space → `ចង់`  
Type `heuy` + space → `ហើយ`  
Type `jg` + space → choose between `ចង់` or `ចឹង`

---

## Install (unpacked)

1. Clone or download this repo
2. Open Chrome → `chrome://extensions`
3. Enable **Developer mode** (top right)
4. Click **Load unpacked** → select this folder

---

## How it works

- Press **space** after a romanized word to trigger conversion
- If only one match exists, it replaces immediately
- If multiple matches exist, a small popup appears — pick with **1 / 2 / 3** keys or click
- Press **Escape** to dismiss without replacing

Works in any text field: `<input>`, `<textarea>`, and `contenteditable` (Google Docs, Notion, etc.)

---

## Adding words

Use the CLI script — it handles file routing, duplicate detection, and sorting automatically:

```bash
# Single word
node scripts/add.js chong ចង់

# Multiple options (triggers popup)
node scripts/add.js jg ចង់ ចឹង
```

Do **not** edit the JSON files by hand — it's easy to put a word in the wrong file or introduce a duplicate key.

---

## Dictionary structure

```
dictionary/
  index.json       ← list of loaded letter files
  a.json           ← words starting with "a"
  b.json           ← words starting with "b"
  ...
```

Each file maps a romanized key to a Khmer Unicode string (or array of strings):

```json
{
  "chong": "ចង់",
  "jg": ["ចង់", "ចឹង"]
}
```

---

## Fuzzy matching

If the exact romanized word isn't in the dictionary, the extension tries common phonetic variants automatically:

| Input | Tries |
|-------|-------|
| `chong` | `jong` |
| `baan` | `ban` |
| `nah` | `na` |

---

## Contributing

Missing a word? Open an issue with the romanized spelling and the Khmer Unicode, or submit a PR that adds it via `scripts/add.js`.
