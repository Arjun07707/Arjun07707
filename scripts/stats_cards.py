# .github/workflows/update-stats.yml
# Runs generate_stats.py on a schedule and on every push to main.
# Commits the generated SVGs back to the repo automatically.
#
# ⚠️  SETUP REQUIRED:
#   1. Go to Settings → Secrets and variables → Actions
#   2. Add a secret named STATS_TOKEN with a classic PAT that has:
#      - repo (full control of private repos)  — needed to push SVGs back
#      - read:user                             — needed for GraphQL user data
#   3. Push this workflow file to your profile repo's main branch.

name: Update Stats SVGs

on:
  schedule:
    - cron: "0 0 * * *"   # every day at midnight UTC
  push:
    branches: [main]
  workflow_dispatch:        # allow manual trigger from GitHub UI

permissions:
  contents: write           # allow the workflow to push commits

jobs:
  build:
    runs-on: ubuntu-latest

    steps:
      - name: Checkout repo
        uses: actions/checkout@v4

      - name: Set up Python
        uses: actions/setup-python@v5
        with:
          python-version: "3.12"

      - name: Generate SVG cards
        env:
          GITHUB_TOKEN: ${{ secrets.STATS_TOKEN }}
          USERNAME: REPLACE_WITH_GITHUB_USERNAME   # ⚠️ replace with your username
        run: python scripts/generate_stats.py

      - name: Commit & push SVGs
        uses: stefanzweifel/git-auto-commit-action@v5
        with:
          commit_message: "chore: update profile stats SVGs [skip ci]"
          file_pattern: profile-stats/*.svg
