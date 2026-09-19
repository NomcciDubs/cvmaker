// @vitest-environment jsdom
import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { Segmented } from "./Segmented";

function Tabbed() {
  const [value, setValue] = useState<"manual" | "import">("manual");
  return (
    <Segmented
      tabs
      id="source-method"
      panelId="source-panel"
      ariaLabel="CV source method"
      value={value}
      onChange={setValue}
      options={[
        { value: "manual", label: "Write manually" },
        { value: "import", label: "Import CV" },
      ]}
    />
  );
}

function Grouped() {
  const [value, setValue] = useState<"en" | "es">("en");
  return (
    <Segmented
      ariaLabel="Language"
      value={value}
      onChange={setValue}
      options={[
        { value: "en", label: "EN" },
        { value: "es", label: "ES" },
      ]}
    />
  );
}

describe("Segmented", () => {
  it("exposes tab semantics, roving tabindex and aria-controls", () => {
    render(<Tabbed />);

    expect(screen.getByRole("tablist", { name: "CV source method" })).toBeInTheDocument();
    const manual = screen.getByRole("tab", { name: "Write manually" });
    const importTab = screen.getByRole("tab", { name: "Import CV" });

    expect(manual).toHaveAttribute("aria-selected", "true");
    expect(manual).toHaveAttribute("tabindex", "0");
    expect(manual).toHaveAttribute("aria-controls", "source-panel");
    expect(manual).toHaveAttribute("id", "source-method-manual");
    expect(importTab).toHaveAttribute("aria-selected", "false");
    expect(importTab).toHaveAttribute("tabindex", "-1");
  });

  it("moves selection and focus with arrow, Home and End keys", async () => {
    const user = userEvent.setup();
    render(<Tabbed />);

    await user.tab();
    const manual = screen.getByRole("tab", { name: "Write manually" });
    expect(manual).toHaveFocus();

    await user.keyboard("{ArrowRight}");
    const importTab = screen.getByRole("tab", { name: "Import CV" });
    expect(importTab).toHaveAttribute("aria-selected", "true");
    expect(importTab).toHaveFocus();

    await user.keyboard("{ArrowRight}");
    expect(manual).toHaveAttribute("aria-selected", "true");
    expect(manual).toHaveFocus();

    await user.keyboard("{ArrowLeft}");
    expect(importTab).toHaveAttribute("aria-selected", "true");

    await user.keyboard("{Home}");
    expect(manual).toHaveAttribute("aria-selected", "true");
    await user.keyboard("{End}");
    expect(importTab).toHaveAttribute("aria-selected", "true");
  });

  it("keeps plain groups as pressed buttons without roving tabindex", async () => {
    const user = userEvent.setup();
    render(<Grouped />);

    expect(screen.getByRole("group", { name: "Language" })).toBeInTheDocument();
    const spanish = screen.getByRole("button", { name: "ES" });
    expect(screen.getByRole("button", { name: "EN" })).toHaveAttribute("aria-pressed", "true");
    expect(spanish).toHaveAttribute("aria-pressed", "false");
    expect(spanish).not.toHaveAttribute("tabindex");

    await user.click(spanish);
    expect(spanish).toHaveAttribute("aria-pressed", "true");
  });
});
