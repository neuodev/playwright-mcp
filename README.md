# Playwright MCP Server

A Model Context Protocol (MCP) server that exposes browser automation capabilities via [Playwright](https://playwright.dev/). It lets AI models (like Claude) control a Chromium browser to interact with web pages programmatically.

## Use Cases

**QA Testing**
- Capture screenshots of pages at key states to verify visual correctness
- Test responsive layouts by resizing the viewport to different screen sizes
- Interact with UI elements (buttons, links) using CSS selectors to simulate user flows
- Extract page HTML to assert on structure and content

**Web App Development**
- Quickly inspect rendered output without leaving your editor — ask Claude to open a URL and screenshot it
- Debug layout issues at specific viewport sizes
- Scroll through pages and capture states that are hard to reach manually
- Verify that navigation, clicks, and state changes work as expected

## Setup

Install dependencies:

```sh
bun install
```

Install Playwright browsers:

```sh
bunx playwright install
```

## Connecting to Claude

Add the server to your Claude MCP configuration:

```json
{
  "mcpServers": {
    "playwright": {
      "command": "bun",
      "args": ["/path/to/mcp/index.ts"]
    }
  }
}
```

## Example Prompts

**Responsive screenshots**
> Open example.com and take a screenshot at desktop (1440×900), tablet (768×1024), and mobile (390×844) sizes. Save each screenshot to the current directory.

**QA testing**
> Open localhost:3000 and perform QA testing to verify that all requirements listed in REQUIREMENTS.md are satisfied. Watch for any visual bugs.
