import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StatusBadge } from "@/components/Badge";

describe("StatusBadge", () => {
  it.each([
    ["PENDING", "В очереди"],
    ["SENT", "Отправлено"],
    ["FAILED", "Ошибка"],
  ] as const)("renders the Russian label for %s", (status, label) => {
    render(<StatusBadge status={status} />);
    expect(screen.getByText(label)).toBeInTheDocument();
  });
});
