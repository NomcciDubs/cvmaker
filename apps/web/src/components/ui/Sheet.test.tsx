// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { Sheet } from "./Sheet";

function Harness({ dismissable = true }: { dismissable?: boolean }) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>Open editor</button>
      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title="Edit field"
        closeLabel="Close"
        dismissable={dismissable}
      >
        <input
          data-autofocus
          aria-label="Field"
          value={value}
          onChange={(event) => setValue(event.target.value)}
        />
      </Sheet>
    </>
  );
}

describe("Sheet", () => {
  it("keeps focus on a controlled input while typing and does not flap the scroll lock", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole("button", { name: "Open editor" }));
    const input = await screen.findByLabelText("Field");
    await waitFor(() => expect(input).toHaveFocus());
    expect(document.documentElement).toHaveClass("scroll-locked");

    await user.type(input, "Ada");
    expect(input).toHaveValue("Ada");
    expect(input).toHaveFocus();
    expect(document.activeElement).toBe(input);
    expect(document.documentElement).toHaveClass("scroll-locked");
  });

  it("restores focus to the trigger and releases the scroll lock on close", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    const trigger = screen.getByRole("button", { name: "Open editor" });
    await user.click(trigger);
    await waitFor(() => expect(screen.getByLabelText("Field")).toHaveFocus());

    await user.keyboard("{Escape}");

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(document.documentElement).not.toHaveClass("scroll-locked");
    expect(trigger).toHaveFocus();
  });

  it("ignores Escape when the sheet is not dismissable", async () => {
    const user = userEvent.setup();
    render(<Harness dismissable={false} />);

    await user.click(screen.getByRole("button", { name: "Open editor" }));
    await waitFor(() => expect(screen.getByLabelText("Field")).toHaveFocus());

    await user.keyboard("{Escape}");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(document.documentElement).toHaveClass("scroll-locked");
  });
});
