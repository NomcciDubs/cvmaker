import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CvmakerApi } from "../api/cvmaker";
import type { Messages } from "../i18n/messages";
import { MAX_PHOTOS, readFileAsDataUrl, validatePhotoFile } from "../photo-file";

interface PhotoManagerProps {
  api: CvmakerApi;
  messages: Messages;
  userId?: string;
  selectedPhotoUrl?: string;
  onSelect: (dataUrl: string | undefined) => void;
}

export function PhotoManager({ api, messages, userId, selectedPhotoUrl, onSelect }: PhotoManagerProps) {
  const queryClient = useQueryClient();
  const [fileError, setFileError] = useState("");
  const [rotated, setRotated] = useState(false);
  const photos = useQuery({ queryKey: ["photos", userId], queryFn: api.listPhotos, enabled: Boolean(userId) });

  const upload = useMutation({
    mutationFn: async (file: File) => {
      const invalid = validatePhotoFile(file);
      if (invalid) throw new Error(invalid);
      const dataUrl = await readFileAsDataUrl(file);
      return {
        result: await api.uploadPhoto({ name: file.name.slice(0, 120) || undefined, dataUrl }),
        dataUrl,
      };
    },
    onSuccess: ({ result, dataUrl }) => {
      setRotated(result.deletedOldest);
      setFileError("");
      onSelect(dataUrl);
      void queryClient.invalidateQueries({ queryKey: ["photos", userId] });
    },
    onError: (error) => {
      const key = error instanceof Error ? error.message : "";
      setFileError(
        key === "photoInvalidType" ? messages.photoInvalidType
        : key === "photoTooLarge" ? messages.photoTooLarge
        : messages.photoUploadError,
      );
    },
  });

  const remove = useMutation({
    mutationFn: async (photo: { id: string; dataUrl: string }) => {
      await api.deletePhoto(photo.id);
      return photo;
    },
    onSuccess: (photo) => {
      if (photo.dataUrl === selectedPhotoUrl) onSelect(undefined);
      void queryClient.invalidateQueries({ queryKey: ["photos", userId] });
    },
  });

  if (!userId) return null;
  const items = photos.data?.photos ?? [];

  return (
    <section className="photo-manager" aria-labelledby="photo-title">
      <div className="photo-heading">
        <h3 id="photo-title">{messages.photoLibrary}</h3>
        <small>{messages.photoCount.replace("{count}", String(items.length)).replace("{max}", String(MAX_PHOTOS))}</small>
      </div>
      <p className="photo-hint">{messages.photoHint}</p>
      <label className="photo-drop">
        <span>{upload.isPending ? messages.photoUploading : messages.uploadPhoto}</span>
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp"
          disabled={upload.isPending}
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file) upload.mutate(file);
          }}
        />
      </label>
      {fileError && <p className="error" role="alert">{fileError}</p>}
      {rotated && <p className="notice">{messages.photoLimitWarning}</p>}
      {photos.isPending && <p>{messages.loadingPhotos}</p>}
      {photos.isError && <p className="error" role="alert">{messages.photoLoadError}</p>}
      {!photos.isPending && !photos.isError && items.length === 0 && <p className="empty-library">{messages.noPhotos}</p>}
      <div className="photo-grid">
        {items.map((photo) => {
          const selected = photo.dataUrl === selectedPhotoUrl;
          return (
            <article className={`photo-item ${selected ? "selected" : ""}`} key={photo.id}>
              <img src={photo.dataUrl} alt={photo.name} width={96} height={96} />
              <strong>{photo.name}</strong>
              {selected && <small>{messages.photoSelected}</small>}
              <div className="photo-item-actions">
                {!selected && <button type="button" onClick={() => onSelect(photo.dataUrl)}>{messages.usePhoto}</button>}
                <button
                  type="button"
                  className="danger"
                  disabled={remove.isPending}
                  onClick={() => {
                    if (window.confirm(messages.deletePhotoConfirm)) remove.mutate(photo);
                  }}
                >
                  {messages.deletePhoto}
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
