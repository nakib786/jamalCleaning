# Reference crawl and verification tools

These scripts rebuild the reference material in `reference/` and `captured/` from the
licensed Cetro demo (<https://demo2.pavothemes.com/cetro/>) and verify the rebuilt site
against it. They are development tools only; nothing here ships with the site.

## 1. Start a dedicated Chrome for Playwright and REA

Playwright drives the pages and [REA](https://github.com/morluto/rea) attaches to the same
Chrome over the DevTools Protocol, so both see the same tabs. Use a throwaway profile:

```sh
# Windows (PowerShell or Git Bash)
"C:/Program Files/Google/Chrome/Application/chrome.exe" --headless=new \
  --remote-debugging-port=9222 --remote-debugging-address=127.0.0.1 \
  --user-data-dir="$TEMP/cetro-rea-profile" --no-first-run about:blank
```

Override the endpoint with `CDP_ENDPOINT=http://127.0.0.1:PORT` if needed. The scripts
never close this browser; stop it yourself when you are done.

## 2. Crawl (polite: one page load every ~4 s with jitter, `PAGE_DELAY_MS` to change)

| Script                   | What it does                                                                                                                                                                                                         |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run crawl:discover` | Breadth-first crawl of Home 4's header, footer, off-canvas and in-page links with the scope rules in `lib/site.ts` → `reference/discovery.json`                                                                     |
| `npm run crawl:inspect`  | Per page at 1440/768/390 px: HTML/CSS/JS/fonts → `captured/`, full-page screenshots, computed-style outlines; at 1440 px the rendered DOM and REA `inspect_web_page` + `analyze_web_bundle` evidence → `reference/` |
| `npm run crawl:capture`  | Per page at 1440/390 px: slow scroll, hover menus, click sliders/tabs/accordions, open the mobile menu; saves **every** response → `captured/<host>/<path>` and `captured/manifest.json`                            |

All accept `--only=slug,slug`; `inspect`/`capture` accept `--widths=…`.

## 3. Verify the rebuild

| Script                 | What it does                                                                                                                                       |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run verify`       | Loads each original and rebuilt page at 1440/768/390 px, takes viewport screenshots with REA `capture_web_screenshot` at matching scroll offsets, and diffs them with REA `compare_web_screenshots` → `verify-output/` |
| `npm run verify:links` | Crawls the built site for broken internal links, missing assets, demo-host references and console errors                                         |

## REA

`lib/rea.ts` starts REA as its own MCP server (`npx rea-agents@6.8.0 --mcp`) and calls its
tools over stdio, so no editor registration is needed. Set `REA_BIN` to a local
`rea-agents/scripts/rea.mjs` to skip npx, and `REA_DEBUG=1` to see REA's logs.
To use REA's tools directly from Claude Code instead, run `npx rea-agents setup` and
restart Claude Code.
