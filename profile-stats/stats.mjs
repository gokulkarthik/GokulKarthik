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

export function renderCard(stats) {
  // Keep long owner/repo names readable on narrow profile pages.
  const sections = [
    { title: 'Most starred', rows: stats.topStarred },
    { title: 'Most forked', rows: stats.topForked },
  ];
  let y = 172;
  const rankings = sections.map(({ title, rows }) => {
    const heading = `<text x="24" y="${y}" class="heading">${title}</text>`;
    y += 25;
    const entries = rows.map(({ name, count }, index) => {
      const lines = name.match(/.{1,44}/g);
      const baseline = y;
      const rowHeight = 23 + 16 * (lines.length - 1);
      y += rowHeight;
      return `<text x="24" y="${baseline}" class="rank">${index + 1}</text>
        <text x="45" y="${baseline}" class="repo">${lines.map((line, i) =>
          `<tspan x="45" dy="${i === 0 ? 0 : 16}">${line.replace(/^([^/]+\/)/, '<tspan class="owner">$1</tspan>')}</tspan>`).join('')}</text>
        <text x="496" y="${baseline}" text-anchor="end" class="count">${number.format(count)}</text>`;
    }).join('\n    ');
    y += 12;
    return heading + '\n    ' + entries;
  }).join('\n    ');
  const updated = date.format(new Date(stats.updatedAt));
  const scope = `${number.format(stats.projects)} public repositories`;
  const height = y + 22;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="520" height="${height}" viewBox="0 0 520 ${height}" role="img" aria-labelledby="title description">
  <title id="title">Open-source stats</title>
  <desc id="description">${number.format(stats.stars)} stars and ${number.format(stats.forks)} forks across ${scope}. Updated ${updated}. ${sections.map(({ title, rows }) =>
    `${title}: ${rows.map(({ name, count }) => `${name}, ${number.format(count)}`).join('; ')}.`).join(' ')}</desc>
  <style>
    text { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; fill: #172438 }
    .title { font-size: 22px; font-weight: 700 }
    .heading { font-size: 15px; font-weight: 700 }
    .label, .rank, .footer, .owner { fill: #506179 }
    .label, .rank, .footer { font-size: 12px }
    .total { font-size: 32px; font-weight: 700; fill: #17468e }
    .repo { font-size: 13.5px; font-family: ui-monospace, SFMono-Regular, Consolas, monospace }
    .count { font-size: 14px; font-weight: 650 }
    .total, .count { font-variant-numeric: tabular-nums }
  </style>
  <rect x="0.5" y="0.5" width="519" height="${height - 1}" rx="16" fill="#ffffff" stroke="#d8e1ed"/>
  <text x="24" y="41" class="title">Open-source stats</text>
  <text x="496" y="40" text-anchor="end" class="label">${scope}</text>
  <rect x="24" y="61" width="230" height="80" rx="11" fill="#edf4ff"/>
  <rect x="266" y="61" width="230" height="80" rx="11" fill="#edf4ff"/>
  <text x="40" y="101" class="total">${number.format(stats.stars)}</text>
  <text x="41" y="122" class="label">Total stars</text>
  <text x="282" y="101" class="total">${number.format(stats.forks)}</text>
  <text x="283" y="122" class="label">Total forks</text>
  ${rankings}
  <path d="M24 ${y - 12}H496" stroke="#e2e9f2"/>
  <text x="24" y="${y + 7}" class="footer">Updated ${updated}</text>
</svg>
`;
}
