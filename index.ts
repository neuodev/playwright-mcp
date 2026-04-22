import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { chromium } from "playwright-extra";
import type { Page, BrowserContext } from "playwright";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import { join } from "node:path";

chromium.use(StealthPlugin());

// Dedicated profile for Playwright's bundled Chromium — isolated from the user's
// real Chrome so sessions/cookies persist without conflicting with anything.
const USER_DATA_DIR = join(import.meta.dir, "playwright-profile");
const STATE_BACKUP_PATH = join(import.meta.dir, "browser-state.json");

// 1. Create the MCP Server
const server = new McpServer({
  name: "playwright-mcp",
  version: "1.0.0",
});

// Shared browser state across tools
let context: BrowserContext | null = null;
let currentPage: Page | null = null;

async function safe<T>(
  promise: Promise<T> | undefined,
): Promise<T | undefined> {
  if (!promise) return undefined;
  try {
    return await promise;
  } catch {
    return undefined;
  }
}

async function getContext(headless: boolean = true): Promise<BrowserContext> {
  if (context) return context;
  context = await chromium.launchPersistentContext(USER_DATA_DIR, {
    headless,
    viewport: null,
    ignoreDefaultArgs: ["--enable-automation"],
    args: ["--disable-blink-features=AutomationControlled"],
  });
  context.on("close", () => {
    context = null;
    currentPage = null;
  });
  return context;
}

async function persistState(): Promise<void> {
  await safe(context?.storageState({ path: STATE_BACKUP_PATH }));
}

async function closeBrowser(): Promise<void> {
  await safe(currentPage?.close());
  currentPage = null;
  await safe(context?.close());
  context = null;
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
    await persistState();

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
    await persistState();

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
    await persistState();

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
    await persistState();

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
    await persistState();

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
    await persistState();

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
    await persistState();

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

// 9. Cleanup Tool
server.registerTool(
  "cleanup",
  {
    description:
      "Closes the current page and browser context, flushing session state to disk. " +
      "Call this when you are done using the browser, or after a manual login session.",
    inputSchema: {},
  },
  async () => {
    await persistState();
    await closeBrowser();

    return {
      content: [
        {
          type: "text",
          text: "Browser and page closed.",
        },
      ],
    };
  },
);

// 10. Manual Login Tool
server.registerTool(
  "open_browser_for_manual_login",
  {
    description:
      "Opens the browser in headful (visible) mode and navigates to the given URL so the user can log in manually. " +
      "The cookies and local storage captured during the session will persist across future tool calls. " +
      "Once the user has finished logging in, they should call the cleanup tool to close the browser.",
    inputSchema: {
      url: z
        .url()
        .describe("The URL to open for manual login (e.g. the site's sign-in page)"),
    },
  },
  async ({ url }) => {
    await closeBrowser();
    const ctx = await getContext(false);
    currentPage = await ctx.newPage();
    await currentPage.goto(url);
    await persistState();

    return {
      content: [
        {
          type: "text",
          text: `Opened ${url} in a visible browser window. Log in manually, then call the cleanup tool when done.`,
        },
      ],
    };
  },
);

// 11. Start the Server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Playwright MCP Server is running on stdio");
}

main().catch((error) => {
  console.error("Server error:", error);
  process.exit(1);
});
