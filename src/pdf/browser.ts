import puppeteer, { type Browser, type Page } from "puppeteer";

export interface BrowserHandle {
  getPage(): Promise<Page>;
  close(): Promise<void>;
}

export interface LaunchBrowserOptions {
  readonly executablePath?: string;
}

const LAUNCH_ARGS = ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"];

export async function launchBrowser(options: LaunchBrowserOptions = {}): Promise<BrowserHandle> {
  const browser: Browser = await puppeteer.launch({
    headless: true,
    args: LAUNCH_ARGS,
    ...(options.executablePath ? { executablePath: options.executablePath } : {}),
  });

  return {
    getPage: () => browser.newPage(),
    close: () => browser.close(),
  };
}
