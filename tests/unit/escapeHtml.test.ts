import { describe, expect, it } from "vitest";
import { escapeHtml } from "@/utils/escapeHtml";

describe("escapeHtml", () => {
  it("escapes the five HTML-significant characters", () => {
    expect(escapeHtml(`<b>&"'</b>`)).toBe("&lt;b&gt;&amp;&quot;&#39;&lt;/b&gt;");
  });

  it("leaves ordinary text unchanged", () => {
    expect(escapeHtml("Ada Lovelace")).toBe("Ada Lovelace");
  });

  it("neutralizes a script tag so it can never be interpreted as markup", () => {
    expect(escapeHtml("<script>alert(1)</script>")).toBe("&lt;script&gt;alert(1)&lt;/script&gt;");
  });
});
