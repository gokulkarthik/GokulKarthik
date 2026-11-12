# Profile stats

The stats section adds stars and forks across all public, original repositories owned by
`gokulkarthik` and the projects listed in [config.mjs](config.mjs). Curated forks
resolve to their source repository. GitHub repository IDs prevent duplicates.
Rankings use the same set as the totals, and ties sort by owner/repo.

## Daily refresh

The [workflow](../.github/workflows/profile-stats.yml) checks GitHub every day
around 03:15 UTC and updates the linked rankings in the
[profile README](../README.md) when the numbers or rankings change. It replaces
only the content between the stats markers and commits the matching data
snapshot. If the data stays the same, it updates the date after two weeks.
A failed fetch leaves the last published stats in place.

Run it anytime via **Actions → Refresh profile stats → Run workflow**. GitHub
can disable a public repo's schedule after 60 days of repository inactivity.
If that happens, open the workflow in **Actions**, enable it, and run it once.
See [GitHub's workflow reactivation instructions](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/disable-and-enable-workflows).

## Add an external project

Edit [config.mjs](config.mjs) and commit the change to `master`. Adding an
`owner/repo` entry there triggers a refresh.

For local checks, run `node --test profile-stats/stats.test.mjs` from the repo
root. Use `node profile-stats/refresh-snapshot.mjs` to fetch fresh data and
regenerate the stats section locally.
