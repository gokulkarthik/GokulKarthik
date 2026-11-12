import { externalRepositories, owner } from './config.mjs';

const api = 'https://api.github.com';
const repoPath = /^[a-z\d-]+\/[a-z\d_.-]+$/i;
const number = new Intl.NumberFormat('en-US');
const date = new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeZone: 'UTC' });

export function summarize(repositories, updatedAt = new Date().toISOString()) {
  const unique = new Map();
  for (const repo of repositories) {
    if (repo.private || repo.fork) continue;
    if (!Number.isSafeInteger(repo.id) || !repoPath.test(repo.full_name) ||
        ![repo.stargazers_count, repo.forks_count].every(count => Number.isSafeInteger(count) && count >= 0)) {
      throw new Error('Unexpected GitHub repository data');
    }
    unique.set(repo.id, { name: repo.full_name, stars: repo.stargazers_count, forks: repo.forks_count });
  }

  const projects = [...unique.values()];
  const total = metric => projects.reduce((sum, project) => sum + project[metric], 0);
  const top = metric => [...projects]
    .sort((a, b) => b[metric] - a[metric] || a.name.localeCompare(b.name, 'en'))
    .slice(0, 5)
    .map(project => ({ name: project.name, count: project[metric] }));

  return {
    updatedAt,
    projects: projects.length,
    stars: total('stars'),
    forks: total('forks'),
    topStarred: top('stars'),
    topForked: top('forks'),
  };
}

export async function fetchStats({ token, fetcher = fetch, curatedRepositories = externalRepositories } = {}) {
  const headers = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'gokulkarthik-profile-stats',
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  async function get(path) {
    const options = {
      headers,
      signal: AbortSignal.timeout(8000),
    };
    let response = await fetcher(api + path, { ...options, redirect: 'manual' });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('Location');
      const redirected = location && new URL(location, api);
      if (redirected?.origin !== api) throw new Error(`Unexpected GitHub redirect for ${path}`);
      response = await fetcher(redirected.href, { ...options, redirect: 'error' });
    }
    if (!response.ok) throw new Error(`GitHub API returned ${response.status} for ${path}`);
    return { data: await response.json(), link: response.headers.get('Link') };
  }

  async function owned() {
    const repositories = [];
    for (let page = 1; ; page++) {
      const { data, link } = await get(`/users/${owner}/repos?type=owner&per_page=100&page=${page}`);
      if (!Array.isArray(data)) throw new Error('Unexpected GitHub repository list');
      repositories.push(...data);
      if (!link?.includes('rel="next"')) return repositories;
    }
  }

  async function curated(name) {
    if (!repoPath.test(name)) throw new Error(`Invalid repository name: ${name}`);
    const { data } = await get(`/repos/${name}`);
    const original = data.fork ? data.source : data;
    if (!original || original.private || original.fork) {
      throw new Error(`No public original repository for ${name}`);
    }
    return original;
  }

  const names = [...new Set(curatedRepositories.map(name => name.toLowerCase()))];
  const [repositories, ...external] = await Promise.all([owned(), ...names.map(curated)]);
  return summarize([...repositories, ...external]);
}

export function chooseSnapshot(previous, latest) {
  const sameDate = { ...latest, updatedAt: previous.updatedAt };
  const unchanged = JSON.stringify(sameDate) === JSON.stringify(previous);
  const age = Date.parse(latest.updatedAt) - Date.parse(previous.updatedAt);
  const twoWeeks = 14 * 24 * 60 * 60 * 1000;
  return unchanged && age < twoWeeks ? previous : latest;
}

export function updateReadme(readme, stats) {
  const start = '<!-- profile-stats:start -->';
  const end = '<!-- profile-stats:end -->';
  const from = readme.indexOf(start);
  const to = readme.indexOf(end);
  if (from < 0 || to < from || from !== readme.lastIndexOf(start) || to !== readme.lastIndexOf(end)) {
    throw new Error('Expected one pair of profile stats markers in README.md');
  }

  const cells = ({ name, count }) => `[${name}](https://github.com/${name}) | ${number.format(count)}`;
  const rankings = [
    '| Most Starred | Stars | Most Forked | Forks |',
    '| --- | ---: | --- | ---: |',
    ...stats.topStarred.map((starred, i) => `| ${cells(starred)} | ${cells(stats.topForked[i])} |`),
  ].join('\n');
  const section = [
    '## Open-Source Stats',
    `### ${number.format(stats.stars)} Stars · ${number.format(stats.forks)} Forks`,
    rankings,
    `<sub>Updated ${date.format(new Date(stats.updatedAt))}</sub>`,
  ].join('\n\n');

  return `${readme.slice(0, from + start.length)}\n\n${section}\n\n${readme.slice(to)}`;
}
