import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CvmakerApi } from "../api/cvmaker";
import type { Messages } from "../i18n/messages";
import type { Locale, PdfQuotaSettings } from "../types";

const BYTES_PER_MIB = 1_048_576;

interface AdminPanelProps {
  api: CvmakerApi;
  messages: Messages;
  locale: Locale;
  userRole?: string;
}

export function AdminPanel({ api, messages, locale, userRole }: AdminPanelProps) {
  const queryClient = useQueryClient();
  const metrics = useQuery({ queryKey: ["admin-metrics"], queryFn: api.getAdminMetrics, enabled: userRole === "SUPER_ADMIN" });
  const limits = useQuery({ queryKey: ["admin-pdf-limits"], queryFn: api.getPdfLimits, enabled: userRole === "SUPER_ADMIN" });
  const [form, setForm] = useState({ defaultDaily: "", friendDaily: "", superAdminDaily: "", maxArchivedPdfs: "", maxArchiveSizeMib: "" });
  const [initialized, setInitialized] = useState(false);
  if (limits.data && !initialized) {
    setInitialized(true);
    setForm({
      defaultDaily: String(limits.data.limits.defaultDaily),
      friendDaily: String(limits.data.limits.friendDaily),
      superAdminDaily: limits.data.limits.superAdminDaily === null ? "" : String(limits.data.limits.superAdminDaily),
      maxArchivedPdfs: String(limits.data.limits.maxArchivedPdfs),
      maxArchiveSizeMib: String(Math.round(limits.data.limits.maxArchivedPdfBytes / BYTES_PER_MIB)),
    });
  }

  const save = useMutation({
    mutationFn: () => {
      const body: PdfQuotaSettings = {
        defaultDaily: Number(form.defaultDaily),
        friendDaily: Number(form.friendDaily),
        superAdminDaily: form.superAdminDaily.trim() === "" ? null : Number(form.superAdminDaily),
        maxArchivedPdfs: Number(form.maxArchivedPdfs),
        maxArchivedPdfBytes: Math.round(Number(form.maxArchiveSizeMib) * BYTES_PER_MIB),
      };
      return api.updatePdfLimits(body);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin-pdf-limits"] }),
  });

  if (userRole !== "SUPER_ADMIN") return null;

  return (
    <section className="library admin-panel" aria-labelledby="admin-title">
      <div className="library-heading">
        <div>
          <p className="eyebrow">{messages.adminHint}</p>
          <h2 id="admin-title">{messages.adminTitle}</h2>
        </div>
      </div>
      <div className="library-drawer">
        {(metrics.isPending || limits.isPending) && <p>{messages.loadingAdmin}</p>}
        {(metrics.isError || limits.isError) && <p className="error" role="alert">{messages.adminError}</p>}
        {metrics.data && (
          <>
            <div className="metric-grid">
              <div><strong>{metrics.data.metrics.totals.applications}</strong><small>{messages.metricApplications}</small></div>
              <div><strong>{metrics.data.metrics.totals.users}</strong><small>{messages.metricUsers}</small></div>
              <div><strong>{metrics.data.metrics.totals.companies}</strong><small>{messages.metricCompanies}</small></div>
              <div><strong>{metrics.data.metrics.savedCvs.savedCvs}</strong><small>{messages.metricSavedCvs}</small></div>
              <div><strong>{metrics.data.metrics.usage.aiUses}</strong><small>{messages.metricAiUses}</small></div>
              <div><strong>{metrics.data.metrics.usage.aiUsers}</strong><small>{messages.metricAiUsers}</small></div>
            </div>
            <h3>{messages.topCompanies}</h3>
            {metrics.data.metrics.topCompanies.length === 0 && <p className="empty-library">{messages.emptyLibrary}</p>}
            {metrics.data.metrics.topCompanies.map((entry) => (
              <p className="metric-row" key={entry.company}><span>{entry.company}</span><span>{entry.applications}</span></p>
            ))}
            <h3>{messages.recentApplications}</h3>
            {metrics.data.metrics.recentApplications.length === 0 && <p className="empty-library">{messages.emptyLibrary}</p>}
            {metrics.data.metrics.recentApplications.map((entry, index) => (
              <p className="metric-row" key={`${entry.company}-${entry.createdAt}-${index}`}>
                <span>{entry.company} · {entry.role} · {entry.status}</span>
                <span>{formatDate(entry.createdAt, locale)}</span>
              </p>
            ))}
          </>
        )}
        {limits.data && (
          <form
            className="tracker-form"
            onSubmit={(event) => {
              event.preventDefault();
              if (!save.isPending) save.mutate();
            }}
          >
            <h3>{messages.pdfLimitsTitle}</h3>
            <div className="field-grid">
              <label>{messages.defaultDaily}<input type="number" min={1} max={100} value={form.defaultDaily} onChange={(event) => setForm({ ...form, defaultDaily: event.target.value })} /></label>
              <label>{messages.friendDaily}<input type="number" min={1} max={100} value={form.friendDaily} onChange={(event) => setForm({ ...form, friendDaily: event.target.value })} /></label>
            </div>
            <div className="field-grid">
              <label>{messages.superAdminDaily}<input type="number" min={1} max={100} value={form.superAdminDaily} onChange={(event) => setForm({ ...form, superAdminDaily: event.target.value })} /></label>
              <label>{messages.maxArchivedPdfs}<input type="number" min={1} max={100} value={form.maxArchivedPdfs} onChange={(event) => setForm({ ...form, maxArchivedPdfs: event.target.value })} /></label>
            </div>
            <label>{messages.maxArchiveSize}<input type="number" min={1} max={250} value={form.maxArchiveSizeMib} onChange={(event) => setForm({ ...form, maxArchiveSizeMib: event.target.value })} /></label>
            <div className="wizard-actions">
              <button type="submit" disabled={save.isPending}>{save.isPending ? messages.savingLimits : messages.saveLimits}</button>
            </div>
            {save.isSuccess && <p className="success" role="status">{messages.limitsSaved}</p>}
            {save.isError && <p className="error" role="alert">{messages.limitsError}</p>}
          </form>
        )}
      </div>
    </section>
  );
}

function formatDate(value: string, locale: Locale): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(date);
}
