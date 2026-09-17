// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { CvmakerApi } from "../api/cvmaker";
import { getMessages } from "../i18n/messages";
import type { PhotoRecord } from "../types";
import { PhotoManager } from "./PhotoManager";

const photos: PhotoRecord[] = [
  { id: "photo-1", name: "Studio", dataUrl: "data:image/png;base64,YQ==", createdAt: "2026-09-16T00:00:00.000Z" },
  { id: "photo-2", name: "Outdoor", dataUrl: "data:image/png;base64,Yg==", createdAt: "2026-09-16T00:00:00.000Z" },
];

describe("PhotoManager", () => {
  it("selects a library photo and deletes the selected one", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const deletePhoto = vi.fn().mockResolvedValue(undefined);
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    const api = {
      listPhotos: vi.fn().mockResolvedValue({ photos }),
      uploadPhoto: vi.fn(),
      deletePhoto,
    } as unknown as CvmakerApi;

    renderManager(api, onSelect, photos[0]?.dataUrl);
    await user.click(await screen.findByRole("button", { name: "Use photo" }));
    expect(onSelect).toHaveBeenCalledWith("data:image/png;base64,Yg==");

    const deletes = screen.getAllByRole("button", { name: "Delete" });
    await user.click(deletes[0]!);
    await waitFor(() => expect(deletePhoto).toHaveBeenCalledWith("photo-1"));
    expect(onSelect).toHaveBeenCalledWith(undefined);
    confirm.mockRestore();
  });

  it("rejects unsupported image types before uploading", async () => {
    const user = userEvent.setup();
    const uploadPhoto = vi.fn();
    const api = {
      listPhotos: vi.fn().mockResolvedValue({ photos: [] }),
      uploadPhoto,
      deletePhoto: vi.fn(),
    } as unknown as CvmakerApi;

    renderManager(api, vi.fn(), undefined);
    await screen.findByText("No photos yet.");
    const input = screen.getByLabelText(/Upload photo/) as HTMLInputElement;
    const file = new File(["gif"], "fun.gif", { type: "image/gif" });
    fireEvent.change(input, { target: { files: [file] } });

    expect(await screen.findByRole("alert")).toHaveTextContent("PNG, JPEG or WebP");
    expect(uploadPhoto).not.toHaveBeenCalled();
  });
});

function renderManager(api: CvmakerApi, onSelect: (dataUrl: string | undefined) => void, selectedPhotoUrl?: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <PhotoManager api={api} messages={getMessages("en")} userId="user-a" selectedPhotoUrl={selectedPhotoUrl} onSelect={onSelect} />
    </QueryClientProvider>,
  );
}
