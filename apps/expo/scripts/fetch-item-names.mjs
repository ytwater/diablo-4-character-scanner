#!/usr/bin/env node
// Regenerates src/features/scanner/data/itemNames.json from the community
// Diablo 4 game-data dump at https://github.com/DiabloTools/d4data (parsed
// from the game files; there's no official Blizzard D4 API). Re-run after
// each season/patch:
//
//   node scripts/fetch-item-names.mjs
//
// Pulls, from the enUS StringList tables:
// - unique/mythic item names (fixed names, matched whole)
// - the pieces generated names are built from - base item and appearance
//   names ("Echo Circle"), legendary aspect names ("of Fleet Wings"),
//   magic affix prefixes/suffixes ("Speedy", "of Vigor"), and the rare-name
//   word pools ("Silent", "Crown") - flattened into a word vocabulary.
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = "DiabloTools/d4data";
const RAW = `https://raw.githubusercontent.com/${REPO}/master`;
const API = `https://api.github.com/repos/${REPO}`;
const STRINGLIST = "json/enUS_Text/meta/StringList";
const OUT = join(
  dirname(fileURLToPath(import.meta.url)),
  "../src/features/scanner/data/itemNames.json",
);

const githubHeaders = process.env.GITHUB_TOKEN
  ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` }
  : {};

async function json(url, headers = {}) {
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json();
}

// The StringList directory has ~60k files - more than the contents API
// lists - so walk to its tree SHA and list that tree directly.
async function listStringListFiles() {
  const meta = await json(`${API}/contents/json/enUS_Text/meta`, githubHeaders);
  const sha = meta.find((e) => e.name === "StringList").sha;
  const tree = await json(`${API}/git/trees/${sha}`, githubHeaders);
  if (tree.truncated) throw new Error("StringList tree listing was truncated");
  return tree.tree.map((e) => e.path);
}

async function mapLimit(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: limit }, async () => {
      while (next < items.length) {
        const i = next++;
        results[i] = await fn(items[i]);
      }
    }),
  );
  return results;
}

// `labels` omitted takes every string in the file.
async function strings(files, labels) {
  const lists = await mapLimit(files, 24, async (file) => {
    try {
      const { arStrings } = await json(`${RAW}/${STRINGLIST}/${file}`);
      return arStrings
        .filter((s) => !labels || labels.includes(s.szLabel))
        .map((s) => s.szText);
    } catch {
      return [];
    }
  });
  return lists.flat();
}

const isPlaceholder = (name) => /\[ph|new item|^\s*$/i.test(name);

const files = await listStringListFiles();
const pick = (re, exclude = /$^/) =>
  files.filter((f) => re.test(f) && !exclude.test(f));

const uniqueFiles = pick(/^Item_.*Unique/i);
const baseFiles = pick(
  /^Item_[A-Za-z0-9]+_(Legendary|Rare|Magic|Common|Base|Normal|Any)_/i,
  /gambling|pvp|bloodied|test/i,
);
const cosmeticFiles = pick(/^Item_.*Cosmetic/i);
const aspectFiles = pick(/^Affix_Legendary/i);
const affixFiles = pick(/^Affix_/i, /^Affix_(Talisman|Legendary)/i);
const rarePoolFiles = pick(/^RareNameStrings/i);

console.log(
  `unique ${uniqueFiles.length}, base ${baseFiles.length}, cosmetic ${cosmeticFiles.length}, ` +
    `aspect ${aspectFiles.length}, affix ${affixFiles.length}, rare pools ${rarePoolFiles.length} files`,
);

const uniques = [...new Set(await strings(uniqueFiles, ["Name"]))]
  .filter((n) => !isPlaceholder(n))
  .sort();
// The building blocks of generated names: base item / appearance names
// ("Monsoon Line"), aspect names ("of Fleet Wings"), magic affixes.
const parts = [
  ...(await strings(uniqueFiles, ["TransmogName"])),
  ...(await strings(baseFiles, ["Name"])),
  ...(await strings(cosmeticFiles, ["Name", "TransmogName"])),
  ...(await strings(aspectFiles, ["Name"])),
  ...(await strings(affixFiles, ["Name_Prefix", "Name_Suffix"])),
].filter((p) => !isPlaceholder(p));
const phrases = [
  ...uniques,
  ...parts,
  // Rare-name pool files are nothing but name words, under varying labels.
  ...(await strings(rarePoolFiles)),
].filter((p) => !isPlaceholder(p));
// Multi-word parts, matched as a unit so a misread word gets corrected in
// context ("iONSON LINE" -> "MONSOON LINE", not the more common "POISON").
const multiWordParts = [...new Set(parts.map((p) => p.toUpperCase().trim()))]
  .filter((p) => /\s/.test(p) && !/[{}\[\]]/.test(p))
  .sort();

// Words sorted by how often they appear across all names, so a tie between
// equally-close corrections resolves to the more common word ("BOOTS").
const counts = new Map();
for (const phrase of phrases) {
  for (const word of phrase.toUpperCase().split(/[^A-Z']+/)) {
    if (word.replace(/'/g, "").length > 1)
      counts.set(word, (counts.get(word) ?? 0) + 1);
  }
}
const words = [...counts]
  .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
  .map(([w]) => w);

const buildVersion = (
  await (await fetch(`${RAW}/buildVersion.txt`)).text()
).trim();
await mkdir(dirname(OUT), { recursive: true });
await writeFile(
  OUT,
  JSON.stringify(
    {
      source: `https://github.com/${REPO}`,
      buildVersion,
      fetchedAt: new Date().toISOString().slice(0, 10),
      uniques,
      phrases: multiWordParts,
      words,
    },
    null,
    1,
  ) + "\n",
);
console.log(
  `wrote ${uniques.length} unique names, ${multiWordParts.length} phrases, ${words.length} words (game build ${buildVersion}) to ${OUT}`,
);
