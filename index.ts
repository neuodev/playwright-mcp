import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { chromium, type Page, type BrowserContext } from "playwright";
import { homedir } from "node:os";
import { join } from "node:path";

// Use the real Chrome profile so the agent inherits existing logins.
// Change PROFILE_DIRECTORY to "Profile 1", "Profile 2", etc. to pick a different profile.
const CHROME_USER_DATA_DIR = join(
  homedir(),
  "Library/Application Support/Google/Chrome",
);
const PROFILE_DIRECTORY = "Agent";

// 1. Create the MCP Server
const server = new McpServer({
  name: "playwright-mcp",
  version: "1.0.0",
});

// Shared browser state across tools
let context: BrowserContext | null = null;
let currentPage: Page | null = null;

async function getContext(): Promise<BrowserContext> {
  if (context) return context;
  context = await chromium.launchPersistentContext(CHROME_USER_DATA_DIR, {
    channel: "chrome",
    headless: false,
    viewport: null,
    args: [`--profile-directory=${PROFILE_DIRECTORY}`],
  });
  return context;
}

// 2. Open URL Tool
server.registerTool(
  "open_url_in_browser",
  {
    description: "Launches a browser window and navigates to the specified URL",
    inputSchema: {
      url: z.url().describe("The URL to open in the browser"),
    },
  },
  async ({ url }) => {
    const ctx = await getContext();
    currentPage = await ctx.newPage();
    await currentPage.goto(url);

    return {
      content: [
        {
          type: "text",
          text: `Opened browser and navigated to ${url}`,
        },
      ],
    };
  },
);

// 3. Screenshot Tool
server.registerTool(
  "screenshot_current_page",
  {
    description:
      "Takes a screenshot of the current browser page and returns it as an image. " +
      "Optionally saves it to disk if a path is provided. " +
      "Use this proactively when working on UI code (React, Angular, Vue, or any frontend) " +
      "to visually verify how changes look in the browser in real time — don't wait to be asked.",
    inputSchema: {
      path: z
        .string()
        .optional()
        .describe(
          "Optional file path where the screenshot will be saved, e.g. /tmp/screenshot.png. If omitted, the screenshot is only returned as an image.",
        ),
    },
  },
  async ({ path }) => {
    if (!currentPage) {
      return {
        content: [
          {
            type: "text",
            text: "No browser page is open. Use open_url_in_browser first.",
          },
        ],
        isError: true,
      };
    }

    const buffer = await currentPage.screenshot({ type: "png", path });

    return {
      content: [
        {
          type: "text",
          text: path ? `Screenshot saved to ${path}` : "Screenshot taken",
        },
        {
          type: "image",
          data: buffer.toString("base64"),
          mimeType: "image/png",
        },
      ],
    };
  },
);

// 4. Update Viewport Tool
server.registerTool(
  "update_viewport",
  {
    description: "Updates the viewport size of the current browser page",
    inputSchema: {
      width: z
        .number()
        .int()
        .positive()
        .describe("The viewport width in pixels"),
      height: z
        .number()
        .int()
        .positive()
        .describe("The viewport height in pixels"),
    },
  },
  async ({ width, height }) => {
    if (!currentPage) {
      return {
        content: [
          {
            type: "text",
            text: "No browser page is open. Use open_url_in_browser first.",
          },
        ],
        isError: true,
      };
    }

    await currentPage.setViewportSize({ width, height });

    return {
      content: [
        {
          type: "text",
          text: `Viewport updated to ${width}x${height}`,
        },
      ],
    };
  },
);

// 5. Scroll Tool
server.registerTool(
  "scroll_page",
  {
    description:
      "Scrolls the page using the mouse wheel by the given pixel deltas",
    inputSchema: {
      deltaX: z
        .number()
        .describe(
          "Horizontal scroll amount in pixels (positive = right, negative = left)",
        ),
      deltaY: z
        .number()
        .describe(
          "Vertical scroll amount in pixels (positive = down, negative = up)",
        ),
    },
  },
  async ({ deltaX, deltaY }) => {
    if (!currentPage) {
      return {
        content: [
          {
            type: "text",
            text: "No browser page is open. Use open_url_in_browser first.",
          },
        ],
        isError: true,
      };
    }

    await currentPage.mouse.wheel(deltaX, deltaY);

    return {
      content: [
        {
          type: "text",
          text: `Scrolled page by deltaX=${deltaX}, deltaY=${deltaY}`,
        },
      ],
    };
  },
);

// 6. Get HTML Content Tool
server.registerTool(
  "get_page_html",
  {
    description: "Returns the HTML content of the current browser page",
    inputSchema: {},
  },
  async () => {
    if (!currentPage) {
      return {
        content: [
          {
            type: "text",
            text: "No browser page is open. Use open_url_in_browser first.",
          },
        ],
        isError: true,
      };
    }

    const html = await currentPage.content();

    return {
      content: [
        {
          type: "text",
          text: html,
        },
      ],
    };
  },
);

// 7. Click Element Tool
server.registerTool(
  "click_element",
  {
    description:
      "Clicks a clickable element on the current page using a CSS selector",
    inputSchema: {
      selector: z
        .string()
        .describe(
          "CSS selector of the element to click (e.g. 'button#submit', 'a.nav-link')",
        ),
    },
  },
  async ({ selector }) => {
    if (!currentPage) {
      return {
        content: [
          {
            type: "text",
            text: "No browser page is open. Use open_url_in_browser first.",
          },
        ],
        isError: true,
      };
    }

    await currentPage.locator(selector).click();

    return {
      content: [
        {
          type: "text",
          text: `Clicked element matching selector: ${selector}`,
        },
      ],
    };
  },
);

// 8. Type in Element Tool
server.registerTool(
  "type_in_element",
  {
    description:
      "Types text into an input or textarea element using a CSS selector",
    inputSchema: {
      selector: z
        .string()
        .describe(
          "CSS selector of the input or textarea element (e.g. 'input#search', 'textarea.notes')",
        ),
      text: z.string().describe("The text to type into the element"),
    },
  },
  async ({ selector, text }) => {
    if (!currentPage) {
      return {
        content: [
          {
            type: "text",
            text: "No browser page is open. Use open_url_in_browser first.",
          },
        ],
        isError: true,
      };
    }

    await currentPage.locator(selector).fill(text);

    return {
      content: [
        {
          type: "text",
          text: `Typed text into element matching selector: ${selector}`,
        },
      ],
    };
  },
);

// 9. Start the Server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Playwright MCP Server is running on stdio");
}

main().catch((error) => {
  console.error("Server error:", error);
  process.exit(1);
});
