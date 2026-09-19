// @vitest-environment jsdom
import { useState } from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import type { CvLanguage } from "@nomcci/cvmaker-domain";
import { getMessages } from "../../i18n/messages";
import type { UiLocale } from "../../types";
import { filterLanguages, LanguageCombobox, normalizeSearch } from "./LanguageCombobox";

function Harness({ initial = "en" as CvLanguage, locale = "es" as UiLocale }: { initial?: CvLanguage; locale?: UiLocale }) {
  const [value, setValue] = useState<CvLanguage>(initial);
  return (
    <LanguageCombobox
      value={value}
      onChange={setValue}
      locale={locale}
      messages={getMessages(locale)}
    />
  );
}

describe("filterLanguages", () => {
  it("lists all 12 languages without a query", () => {
    expect(filterLanguages("", "en")).toHaveLength(12);
  });

  it("matches case- and accent-insensitively across names and aliases", () => {
    expect(normalizeSearch("Neerlandés")).toBe("neerlandes");
    expect(filterLanguages("aleman", "es").map((entry) => entry.code)).toEqual(["de"]);
    expect(filterLanguages("DEUTSCH", "en").map((entry) => entry.code)).toEqual(["de"]);
    expect(filterLanguages("nederlands", "es").map((entry) => entry.code)).toEqual(["nl"]);
    expect(filterLanguages("portugues", "en").map((entry) => entry.code)).toEqual(["pt"]);
    expect(filterLanguages("tieng viet", "en").map((entry) => entry.code)).toEqual(["vi"]);
  });

  it("requires every token to match", () => {
    expect(filterLanguages("portugues brasil", "es").map((entry) => entry.code)).toEqual(["pt"]);
    expect(filterLanguages("portugues francia", "es")).toEqual([]);
  });
});

describe("LanguageCombobox", () => {
  it("exposes combobox semantics and selects with pointer", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    const input = screen.getByRole("combobox");
    expect(input).toHaveAttribute("aria-expanded", "false");

    await user.click(input);
    const listbox = screen.getByRole("listbox");
    expect(input).toHaveAttribute("aria-expanded", "true");
    expect(input).toHaveAttribute("aria-controls", listbox.id);
    expect(within(listbox).getAllByRole("option")).toHaveLength(12);

    await user.click(within(listbox).getByRole("option", { name: /Portuguese.*Português/ }));
    expect(input).toHaveAttribute("aria-expanded", "false");
    expect(input).toHaveAttribute("placeholder", expect.stringContaining("Português"));
  });

  it("filters while typing and selects with the keyboard", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    const input = screen.getByRole("combobox");
    await user.click(input);
    await user.type(input, "neerlandes");

    const options = within(screen.getByRole("listbox")).getAllByRole("option");
    expect(options).toHaveLength(1);
    expect(options[0]).toHaveTextContent("Dutch");

    await user.keyboard("{ArrowDown}");
    expect(input.getAttribute("aria-activedescendant")).toContain("-nl");
    await user.keyboard("{Enter}");
    expect(input).toHaveAttribute("aria-expanded", "false");
    expect(input).toHaveAttribute("placeholder", expect.stringContaining("Nederlands"));
  });

  it("supports Home, End and Escape", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    const input = screen.getByRole("combobox");
    await user.click(input);
    await user.keyboard("{End}");
    const listbox = screen.getByRole("listbox");
    const options = within(listbox).getAllByRole("option");
    expect(input.getAttribute("aria-activedescendant")).toBe(options[options.length - 1]!.id);
    await user.keyboard("{Home}");
    expect(input.getAttribute("aria-activedescendant")).toBe(options[0]!.id);
    await user.keyboard("{Escape}");
    expect(input).toHaveAttribute("aria-expanded", "false");
  });

  it("pairs the English name with the native name", async () => {
    const user = userEvent.setup();
    render(<Harness initial="es" />);

    expect(screen.getByRole("combobox")).toHaveAttribute("placeholder", "Spanish · Español");

    await user.click(screen.getByRole("combobox"));
    const option = within(screen.getByRole("listbox")).getByRole("option", { name: "Spanish Español" });
    expect(option).toHaveTextContent("Spanish");
    expect(option).toHaveTextContent("Español");
  });

  it("shows the name once when English and native match", async () => {
    const user = userEvent.setup();
    render(<Harness initial="en" locale="en" />);

    expect(screen.getByRole("combobox")).toHaveAttribute("placeholder", "English");

    await user.click(screen.getByRole("combobox"));
    const option = within(screen.getByRole("listbox")).getByRole("option", { name: "English" });
    expect(option).toHaveTextContent("English");
    expect(option.querySelector("span span")).toBeNull();
  });

  it("shows a localized empty state", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole("combobox"));
    await user.type(screen.getByRole("combobox"), "klingon");
    expect(screen.getByText("Ningún idioma coincide con tu búsqueda.")).toBeInTheDocument();
  });
});
