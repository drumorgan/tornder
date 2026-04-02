# Tornder - Project Notes

## Deployment

- **Always push changes all the way through**: After committing and pushing to a branch, use the GitHub MCP tools (`mcp__github__create_pull_request` and `mcp__github__merge_pull_request`) to create a pull request and merge it to main yourself. Do not leave changes sitting on a feature branch or ask the user to manually create/merge PRs.
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
