# bcp

Build, commit, update PRD file and push

This command will:
1. Build the project (`npm run build`)
2. Check for uncommitted changes
3. Check if PRD needs updating (`npm run check-prd`)
4. If PRD needs updating, prompt to update it
5. Stage all changes (`git add -A`)
6. Commit with a message (prompt for message or use default)
7. Push to remote (`git push`)

## Usage

Just type `/bcp` in the chat to execute this workflow.

## Notes

- The PRD check will identify if code changes require PRD updates
- If PRD needs updating, you'll be prompted to update it before committing
- You can skip PRD update by using `--no-verify` flag (not recommended)
