import type { Page } from "puppeteer";
import type { BrowserHandle } from "./browser";

export interface HtmlToPdfOptions {
  readonly browser: BrowserHandle;
  readonly timeoutMs: number;
}

const PDF_MARGIN = { top: "16mm", bottom: "16mm", left: "14mm", right: "14mm" };

export async function htmlToPdf(html: string, options: HtmlToPdfOptions): Promise<Buffer> {
  const page: Page = await options.browser.getPage();

  try {
    page.setDefaultTimeout(options.timeoutMs);
    await page.setContent(html, { waitUntil: "load", timeout: options.timeoutMs });
    const pdf = await page.pdf({ format: "A4", printBackground: true, margin: PDF_MARGIN });
    return Buffer.from(pdf);
  } finally {
    await page.close().catch(() => undefined);
  }
}
