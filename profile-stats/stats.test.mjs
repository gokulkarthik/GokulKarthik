import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import snapshot from './snapshot.json' with { type: 'json' };
import { chooseSnapshot, fetchStats, renderCard, summarize } from './stats.mjs';

const project = (id, full_name, stargazers_count, forks_count, flags = {}) => ({
  id, full_name, stargazers_count, forks_count, ...flags,
});
const indic = project(1, 'AI4Bharat/Indic-TTS', 12, 5);
const indicFork = project(2, 'gokulkarthik/Indic-TTS', 500, 500, { fork: true, source: indic });

test('deduplicates by ID, excludes private repos and forks, and ranks each metric independently', () => {
  const repos = [
    indic, indicFork, { ...indic },
    project(3, 'gokulkarthik/private', 500, 500, { private: true }),
    ...['a', 'b', 'c', 'd', 'e'].map((name, i) => project(4 + i, `gokulkarthik/${name}`, 4, 9 - i)),
  ];
  const stats = summarize(repos);
  assert.equal(stats.projects, 6);
  assert.equal(stats.stars, 32);
  assert.equal(stats.forks, 40);
  assert.deepEqual(stats.topStarred.map(row => row.name), [
    indic.full_name, 'gokulkarthik/a', 'gokulkarthik/b', 'gokulkarthik/c', 'gokulkarthik/d',
  ]);
  assert.deepEqual(stats.topForked.map(row => row.count), [9, 8, 7, 6, 5]);
});

test('reads all pages and counts the canonical original once for curated fork aliases', async () => {
  const requested = [];
  const stats = await fetchStats({
    curatedRepositories: ['AI4Bharat/Indic-TTS', 'ai4bharat/indic-tts', 'gokulkarthik/Indic-TTS'],
    fetcher: async url => {
      const { pathname, searchParams } = new URL(url);
      requested.push(pathname + (searchParams.get('page') || ''));
      if (searchParams.get('page') === '1') {
        return Response.json([indicFork], { headers: { Link: '<https://api.github.com/next>; rel="next"' } });
      }
      if (searchParams.get('page') === '2') {
        return Response.json([project(3, 'gokulkarthik/text2speech', 7, 8)]);
      }
      return Response.json(pathname.includes('ai4bharat') ? indic : indicFork);
    },
  });
  assert.equal(requested.length, 4);
  assert.ok(requested.includes('/users/gokulkarthik/repos2'));
  assert.equal(stats.projects, 2);
  assert.equal(stats.stars, 19);
  assert.equal(stats.forks, 13);
});

test('rejects redirects outside the GitHub API origin', async () => {
  await assert.rejects(fetchStats({ fetcher: async () =>
    Response.redirect('https://example.com', 301) }), /Unexpected GitHub redirect/);
});

test('checked-in SVG matches its data snapshot', async () => {
  const svg = await readFile(new URL('./stats.svg', import.meta.url), 'utf8');
  assert.equal(svg, renderCard(snapshot));
});

test('publishes changed stats immediately and revalidates stable snapshots every two weeks', () => {
  const previous = summarize([indic], '2026-11-01T03:15:00Z');
  const nextDay = summarize([indic], '2026-11-02T03:15:00Z');
  const changed = summarize([{ ...indic, stargazers_count: 13 }], nextDay.updatedAt);
  const twoWeeksLater = summarize([indic], '2026-11-15T03:15:00Z');

  assert.equal(chooseSnapshot(previous, nextDay), previous);
  assert.equal(chooseSnapshot(previous, changed), changed);
  assert.equal(chooseSnapshot(previous, twoWeeksLater), twoWeeksLater);
});
