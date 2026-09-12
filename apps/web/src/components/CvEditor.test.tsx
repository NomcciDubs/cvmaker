import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { CvmakerApi } from "../api/cvmaker";
import { getMessages } from "../i18n/messages";
import { CvEditor } from "./CvEditor";

describe("CvEditor", () => {
  it("renders canonical API HTML after an explicit submit", async () => {
    const user = userEvent.setup();
    const renderCv = vi.fn()
      .mockResolvedValueOnce({ html: "<article>Canonical CV</article>" })
      .mockRejectedValueOnce(new Error("Render failed"));
    const api = { renderCv, getSession: vi.fn() } as unknown as CvmakerApi;
    const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });

    render(
      <QueryClientProvider client={queryClient}>
        <CvEditor api={api} locale="en" messages={getMessages("en")} />
      </QueryClientProvider>,
    );

    await user.type(screen.getByLabelText("Full name"), "Ada Lovelace");
    await user.click(screen.getByRole("button", { name: "Render preview" }));

    expect(renderCv).toHaveBeenCalledWith(expect.objectContaining({
      language: "en",
      cv: expect.objectContaining({ personal_info: expect.objectContaining({ full_name: "Ada Lovelace" }) }),
    }));
    expect(await screen.findByTitle("Server preview")).toHaveAttribute("srcdoc", "<article>Canonical CV</article>");
    expect(screen.getByTitle("Server preview")).toHaveAttribute("sandbox", "");

    await user.click(screen.getByRole("button", { name: "Render preview" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("last successful preview");
    expect(screen.getByTitle("Server preview")).toHaveAttribute("srcdoc", "<article>Canonical CV</article>");
  });
});
