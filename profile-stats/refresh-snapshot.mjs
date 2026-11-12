import { readFile, writeFile } from 'node:fs/promises';
import { chooseSnapshot, fetchStats, updateReadme } from './stats.mjs';

const snapshotPath = new URL('./snapshot.json', import.meta.url);
const readmePath = new URL('../README.md', import.meta.url);
const previous = JSON.parse(await readFile(snapshotPath, 'utf8'));
const readme = await readFile(readmePath, 'utf8');
const latest = await fetchStats({ token: process.env.GITHUB_TOKEN });
const stats = chooseSnapshot(previous, latest);
const updatedReadme = updateReadme(readme, stats);
await Promise.all([
  writeFile(snapshotPath, JSON.stringify(stats, null, 2) + '\n'),
  writeFile(readmePath, updatedReadme),
]);
