import { describe, expect, it } from "vitest";
import { renderInvoiceHtml } from "@/pdf/renderInvoiceHtml";
import type { BillingSnapshot, InvoiceItemView } from "@/types/invoice.types";

const SNAPSHOT: BillingSnapshot = {
  currency: "USD",
  issuedAt: "2026-03-15T10:00:00.000Z",
  sender: {
    brand: "Brick and Willow Design",
    name: "Margaret Brick",
    email: "margaret@brickandwillow.example",
    phone: "+1 555 0100",
    address: {
      line1: "221B Baker Street",
      line2: null,
      city: "London",
      postalCode: "NW1 6XE",
      country: "United Kingdom",
    },
  },
  client: {
    firstName: "John",
    lastName: "Doe",
    email: "john.doe@acme.example",
    company: {
      name: "Acme Inc.",
      addressLine1: "123 Market Street",
      addressLine2: null,
      city: "San Francisco",
      postalCode: "94105",
      country: "United States",
      taxId: "EIN-1",
    },
  },
};

const ITEMS: InvoiceItemView[] = [
  { position: 1, description: "Website redesign", quantity: 1, unitAmountMinor: 150_000, amountMinor: 150_000 },
  { position: 2, description: "Hosting (3 months)", quantity: 3, unitAmountMinor: 2_000, amountMinor: 6_000 },
];

function render(overrides: Partial<Parameters<typeof renderInvoiceHtml>[0]> = {}) {
  return renderInvoiceHtml({
    snapshot: SNAPSHOT,
    items: ITEMS,
    invoiceNumber: "INV-2026-000001",
    issuedAt: new Date("2026-03-15T10:00:00.000Z"),
    dueAt: new Date("2026-03-29T10:00:00.000Z"),
    totalMinor: 156_000,
    notes: "Thanks for your business!",
    ...overrides,
  });
}

describe("renderInvoiceHtml", () => {
  it("includes every field required on an invoice: sender, client, invoice number, dates, items, total, notes", () => {
    const html = render();

    expect(html).toContain("Brick and Willow Design");
    expect(html).toContain("221B Baker Street");
    expect(html).toContain("John");
    expect(html).toContain("Doe");
    expect(html).toContain("Acme Inc.");
    expect(html).toContain("INV-2026-000001");
    expect(html).toContain("March 15, 2026");
    expect(html).toContain("March 29, 2026");
    expect(html).toContain("Website redesign");
    expect(html).toContain("Hosting (3 months)");
    expect(html).toContain("$1,560.00");
    expect(html).toContain("Thanks for your business!");
  });

  it("renders without a company block when the client has none", () => {
    const html = render({
      snapshot: { ...SNAPSHOT, client: { ...SNAPSHOT.client, company: null } },
    });

    expect(html).not.toContain("Acme Inc.");
    expect(html).toContain("John");
  });

  it("omits the due date line when dueAt is null", () => {
    const html = render({ dueAt: null });

    expect(html).not.toContain("Due date");
  });

  it("omits the notes section when notes is null", () => {
    const html = render({ notes: null });

    expect(html).not.toMatch(/<h2>Notes<\/h2>/);
  });

  it("escapes a <script> tag in a client-supplied field instead of injecting it verbatim", () => {
    const html = render({
      snapshot: { ...SNAPSHOT, client: { ...SNAPSHOT.client, lastName: "<script>alert(1)</script>" } },
    });

    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
  });

  it("escapes a <script> tag in the notes field", () => {
    const html = render({ notes: '<img src=x onerror="alert(1)">' });

    expect(html).not.toContain('<img src=x onerror="alert(1)">');
    expect(html).toContain("&lt;img");
  });

  it("escapes a <script> tag in an item description", () => {
    const html = render({
      items: [
        { position: 1, description: "<script>alert(1)</script>", quantity: 1, unitAmountMinor: 100, amountMinor: 100 },
      ],
    });

    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
  });
});
