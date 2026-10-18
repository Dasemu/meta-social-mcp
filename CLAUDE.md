# CLAUDE.md

## Overview
SocialMCP: an MCP HTTP server that publishes to and manages a single Facebook Page and
linked Instagram professional account via Meta's Graph API (stateless streamable-HTTP MCP
transport).

## Commands
- Dev/run: `npm start` (serves `http://HOST:PORT/mcp`, defaults `127.0.0.1:3300`)
- Helper scripts: `npm run get-ids` (fetch Page/IG IDs and Page Access Token), `npm run extend-token`
  (exchange a short-lived user token for a 60-day one)
- Test: none configured yet
- Lint: none configured yet
- Build: none (plain Node.js, no bundling/transpilation)

## Architecture
Entry point `src/index.js` wires an Express HTTP server to the MCP SDK (`@modelcontextprotocol/sdk`).
Tools are defined in `src/tools.js` and call the Graph API through `src/graph.js`. `src/media.js`
handles local file uploads served back as public URLs for `publish_post`. See `README.md` for the
full tool reference and `docs/` for anything longer-form.

## Conventions
- ES modules (`"type": "module"` in package.json).
- No TypeScript, no bundler: code runs directly with `node`.
- Config is env-var only, read via `process.env` (see `.env.example` for the full list); never
  hardcode credentials.

## Workflow quirks
- `get-ids` and `extend-token` are one-off setup scripts, not part of the server runtime.
- The server is stateless: each JSON-RPC request is handled independently (no session state kept
  in memory between requests), per the MCP SDK's recommendation for streamable HTTP.

## Deployment
Use the `web-deploy` skill for anything related to hosting this as a live service (LXC/VPS,
systemd, update script, authenticated update endpoint).

## Gotchas
- Instagram requires media (`imageUrl`/`videoUrl`/`media`) on every post; text-only posts are
  Facebook-only.
- Graph API insight metric names change between API versions; see the README's Insights section
  for the metrics confirmed working on the current `META_GRAPH_VERSION`.
