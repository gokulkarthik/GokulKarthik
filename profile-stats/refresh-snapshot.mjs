import { readFile, writeFile } from 'node:fs/promises';
import { chooseSnapshot, fetchStats, renderCard } from './stats.mjs';

const snapshotPath = new URL('./snapshot.json', import.meta.url);
const previous = JSON.parse(await readFile(snapshotPath, 'utf8'));
const latest = await fetchStats({ token: process.env.GITHUB_TOKEN });
const stats = chooseSnapshot(previous, latest);
const svg = renderCard(stats);
await Promise.all([
  writeFile(snapshotPath, JSON.stringify(stats, null, 2) + '\n'),
  writeFile(new URL('./stats.svg', import.meta.url), svg),
]);
