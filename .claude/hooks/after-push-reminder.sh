#!/bin/bash
# PostToolUse hook: reminds Claude to create and merge a PR after git push

# Read tool input from stdin
INPUT=$(cat)
COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command // ""')

# Check if this was a git push command
if echo "$COMMAND" | grep -qE "git push"; then
  # Output a reminder message back to Claude.
  # PostToolUse hooks use decision:"block" to surface `reason` to Claude
  # as a prompt; "allow" is PreToolUse-only and silently does nothing here.
  cat <<'ENDJSON'
{
  "decision": "block",
  "reason": "REMINDER: You just ran git push. Per CLAUDE.md you MUST now create a PR and merge it to main. Use mcp__github__create_pull_request and mcp__github__merge_pull_request. Do NOT skip this step."
}
ENDJSON
fi

exit 0
