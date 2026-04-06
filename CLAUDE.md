# Tornder - Project Notes

## Deployment

- **Always push changes all the way through**: After committing and pushing to a branch, create a pull request and merge it to main yourself. If MCP tools like `mcp__github__create_pull_request` and `mcp__github__merge_pull_request` are available, use those. Otherwise fall back to the GitHub REST API via `curl` against `https://api.github.com/repos/drumorgan/tornder` (authenticated with the `GITHUB_TOKEN` env var). Do not leave changes sitting on a feature branch or ask the user to manually create/merge PRs.
- **Never forget the PR step**: Every task that changes code MUST end with: commit → push → create PR → merge PR. This is not optional. If MCP tools are disconnected, retry or inform the user immediately — do not silently skip the PR/merge step.
- **Supabase migrations**: After merging SQL migration files, remind the user to run the SQL manually in the Supabase Dashboard SQL Editor, since migrations are not auto-applied.

## Tech Stack

- Frontend: Vanilla JS (src/)
- Backend: Supabase (Edge Functions + Postgres)
- Edge Functions: supabase/functions/ (torn-proxy, auto-login, get-feed)
- Hosting: tornder.girovagabondo.com

## Database

- Supabase Postgres with RLS enabled on all tables
- All client reads/writes go through Edge Functions using service_role key
- Migrations tracked in supabase/migrations/ but must be run manually via SQL Editor
