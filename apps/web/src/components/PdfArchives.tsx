import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "../api/client";
import type { CvmakerApi } from "../api/cvmaker";
import type { Messages } from "../i18n/messages";
import type { Locale, RenderCvRequest } from "../types";

export interface PdfSnapshot extends RenderCvRequest {
  name?: string;
}

interface PdfExportButtonProps {
  api: CvmakerApi;
  messages: Messages;
  snapshot: PdfSnapshot;
  userId?: string;
  disabled?: boolean;
}

function exportErrorMessage(error: unknown, messages: Messages): string {
  const code = error instanceof ApiError ? error.message : "";
  switch (code) {
    case "pdf_daily_limit_reached": return messages.pdfDailyLimit;
    case "pdf_archive_limit_reached": return messages.pdfArchiveLimit;
    case "pdf_storage_limit_reached": return messages.pdfStorageLimit;
    case "pdf_too_large": return messages.pdfTooLarge;
    case "pdf_generation_failed": return messages.pdfGenerationFailed;
    default: return messages.pdfGenerationFailed;
  }
}

export function PdfExportButton({ api, messages, snapshot, userId, disabled }: PdfExportButtonProps) {
  const queryClient = useQueryClient();
  const exportPdf = useMutation({
    mutationFn: () => api.exportPdf(snapshot),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["archives", userId] }),
  });

  return (
    <div className="pdf-export">
      <button
        type="button"
        disabled={disabled || exportPdf.isPending}
        onClick={() => exportPdf.mutate()}
      >
        {exportPdf.isPending ? messages.exportingPdf : messages.exportPdf}
      </button>
      {exportPdf.isSuccess && (
        <p className="success" role="status">
          {messages.pdfReady}: <a href={exportPdf.data.downloadPath} download>{messages.downloadPdf}</a>
          {exportPdf.data.reused ? ` · ${messages.pdfReused}` : ""}
        </p>
      )}
      {exportPdf.isError && <p className="error" role="alert">{exportErrorMessage(exportPdf.error, messages)}</p>}
    </div>
  );
}

interface PdfArchivesProps {
  api: CvmakerApi;
  messages: Messages;
  locale: Locale;
  userId?: string;
}

export function PdfArchives({ api, messages, locale, userId }: PdfArchivesProps) {
  const queryClient = useQueryClient();
  const archives = useQuery({ queryKey: ["archives", userId], queryFn: api.listArchives, enabled: Boolean(userId) });
  const remove = useMutation({
    mutationFn: (id: string) => api.deleteArchive(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["archives", userId] }),
  });

  if (!userId) return null;

  return (
    <section className="library" aria-labelledby="archives-title">
      <div className="library-heading">
        <div>
          <p className="eyebrow">{messages.pdfArchiveHint}</p>
          <h2 id="archives-title">{messages.pdfArchiveTitle}</h2>
        </div>
      </div>
      <div className="library-drawer">
        {archives.isPending && <p>{messages.loadingArchives}</p>}
        {archives.isError && <p className="error" role="alert">{messages.archivesError}</p>}
        {!archives.isPending && !archives.isError && archives.data.archives.length === 0 && (
          <p className="empty-library">{messages.noArchives}</p>
        )}
        {archives.data?.archives.map((archive) => (
          <article className="library-item" key={archive.id}>
            <div>
              <strong>{archive.filename}</strong>
              <small>
                {formatDate(archive.createdAt, locale)} · {(archive.sizeBytes / 1_024).toFixed(1)} KB
              </small>
            </div>
            <div className="library-item-actions">
              <a className="button-link" href={archive.downloadPath} download={archive.filename}>{messages.downloadPdf}</a>
              <button
                type="button"
                className="danger"
                disabled={remove.isPending}
                onClick={() => {
                  if (window.confirm(messages.deleteArchiveConfirm)) remove.mutate(archive.id);
                }}
              >
                {messages.deleteArchive}
              </button>
            </div>
          </article>
        ))}
        {remove.isError && <p className="error" role="alert">{messages.archivesError}</p>}
      </div>
    </section>
  );
}

function formatDate(value: string, locale: Locale): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(date);
}
