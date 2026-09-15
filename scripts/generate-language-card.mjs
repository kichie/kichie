// 自分がコミットした言語の内訳を SVG にする。
// 非公開リポジトリも数える。リポジトリ名は SVG に出さない。
// 数え方はバイト数ではなくコミット数。バイト数だと、ビルド成果物や
// vendor のコードが上位に来てしまうため。

const TOKEN = process.env.STATS_TOKEN;
if (!TOKEN) throw new Error('STATS_TOKEN が設定されていません');

const OUT = 'assets/languages.svg';
const TOP_N = 6;
const ACCENT = '#F97316';

// GitHub linguist の色。載らない言語はフォールバックの色を使う。
const LANG_COLOR = {
  TypeScript: '#3178c6',
  JavaScript: '#f1e05a',
  Python: '#3572A5',
  PHP: '#4F5D95',
  Vue: '#41b883',
  Dart: '#00B4AB',
  HTML: '#e34c26',
  CSS: '#563d7c',
  SCSS: '#c6538c',
  Blade: '#f7523f',
  Swift: '#F05138',
  'Objective-C': '#438eff',
  'Jupyter Notebook': '#DA5B0B',
  HCL: '#844FBA',
  Ruby: '#701516',
  Go: '#00ADD8',
  Shell: '#89e051',
  PLpgSQL: '#336790',
};
const FALLBACK = ['#8b949e', '#a5a5a5', '#bdbdbd', '#6e7781'];

async function graphql(query, variables = {}) {
  const res = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: {
      Authorization: `bearer ${TOKEN}`,
      'Content-Type': 'application/json',
      'User-Agent': 'kichie-language-card',
    },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) throw new Error(`GitHub API が ${res.status} を返しました`);
  const json = await res.json();
  if (json.errors) throw new Error(JSON.stringify(json.errors));
  return json.data;
}

const REPOS_QUERY = `
query($authorId: ID!, $cursor: String) {
  viewer {
    repositories(
      first: 50
      after: $cursor
      isFork: false
      affiliations: [OWNER, COLLABORATOR, ORGANIZATION_MEMBER]
      ownerAffiliations: [OWNER, COLLABORATOR, ORGANIZATION_MEMBER]
    ) {
      pageInfo { hasNextPage endCursor }
      nodes {
        primaryLanguage { name }
        defaultBranchRef {
          target { ... on Commit { history(author: {id: $authorId}) { totalCount } } }
        }
      }
    }
  }
}`;

async function collect() {
  const { viewer } = await graphql('{ viewer { id } }');
  const commitsByLanguage = new Map();
  let repoCount = 0;
  let commitTotal = 0;
  let cursor = null;

  for (;;) {
    const data = await graphql(REPOS_QUERY, { authorId: viewer.id, cursor });
    const page = data.viewer.repositories;
    for (const repo of page.nodes) {
      const commits = repo.defaultBranchRef?.target?.history?.totalCount ?? 0;
      const language = repo.primaryLanguage?.name;
      if (commits === 0 || !language) continue;
      commitsByLanguage.set(language, (commitsByLanguage.get(language) ?? 0) + commits);
      repoCount += 1;
      commitTotal += commits;
    }
    if (!page.pageInfo.hasNextPage) break;
    cursor = page.pageInfo.endCursor;
  }

  const ranked = [...commitsByLanguage.entries()].sort((a, b) => b[1] - a[1]);
  return { ranked, repoCount, commitTotal };
}

const escapeXml = (s) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]);

function colorFor(language, index) {
  return LANG_COLOR[language] ?? FALLBACK[index % FALLBACK.length];
}

function render({ ranked, repoCount, commitTotal }) {
  const top = ranked.slice(0, TOP_N);
  const restTotal = ranked.slice(TOP_N).reduce((sum, [, n]) => sum + n, 0);
  const slices = restTotal > 0 ? [...top, ['Other', restTotal]] : top;

  const BAR_X = 20;
  const BAR_Y = 62;
  const BAR_W = 380;
  const BAR_H = 14;

  let x = BAR_X;
  const bars = slices
    .map(([language, commits], i) => {
      const w = (commits / commitTotal) * BAR_W;
      const rect = `<rect x="${x.toFixed(2)}" y="${BAR_Y}" width="${w.toFixed(2)}" height="${BAR_H}" fill="${colorFor(language, i)}" />`;
      x += w;
      return rect;
    })
    .join('\n    ');

  const legend = slices
    .map(([language, commits], i) => {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const lx = BAR_X + col * 195;
      const ly = 100 + row * 22;
      const pct = ((commits / commitTotal) * 100).toFixed(1);
      return [
        `<rect x="${lx}" y="${ly - 9}" width="10" height="10" rx="2" fill="${colorFor(language, i)}" />`,
        `<text class="legend" x="${lx + 17}" y="${ly}">${escapeXml(language)}</text>`,
        `<text class="pct" x="${lx + 178}" y="${ly}" text-anchor="end">${pct}%</text>`,
      ].join('\n    ');
    })
    .join('\n    ');

  const rows = Math.ceil(slices.length / 2);
  const height = 100 + rows * 22 + 26;
  const updated = new Date().toISOString().slice(0, 10);
  const footer = `${commitTotal.toLocaleString('en-US')} commits across ${repoCount} repos · public and private · ${updated}`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="420" height="${height}" viewBox="0 0 420 ${height}" role="img" aria-label="Top languages by commit">
  <style>
    text { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Ubuntu, Sans-Serif; }
    .title { font-size: 17px; font-weight: 600; fill: ${ACCENT}; }
    .sub { font-size: 11px; fill: #6e7781; }
    .legend { font-size: 12px; fill: #57606a; }
    .pct { font-size: 12px; fill: #6e7781; }
    .foot { font-size: 10px; fill: #8c959f; }
    @media (prefers-color-scheme: dark) {
      .sub, .pct { fill: #8b949e; }
      .legend { fill: #c9d1d9; }
      .foot { fill: #6e7681; }
    }
  </style>
  <rect width="100%" height="100%" fill="none" />
  <text class="title" x="20" y="28">Top Languages by Commit</text>
  <text class="sub" x="20" y="45">counted by commits, not bytes</text>
  <g>
    ${bars}
  </g>
  <g>
    ${legend}
  </g>
  <text class="foot" x="20" y="${height - 10}">${escapeXml(footer)}</text>
</svg>
`;
}

const data = await collect();
const { writeFile, mkdir } = await import('node:fs/promises');
await mkdir('assets', { recursive: true });
await writeFile(OUT, render(data), 'utf8');
console.log(`${OUT} を書き出した（${data.commitTotal} commits / ${data.repoCount} repos）`);
for (const [language, commits] of data.ranked.slice(0, 10)) {
  console.log(`  ${((commits / data.commitTotal) * 100).toFixed(1).padStart(5)}%  ${language}  ${commits}`);
}
