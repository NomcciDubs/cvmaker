import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CvmakerApi } from "../api/cvmaker";
import type { Messages } from "../i18n/messages";
import type { ApplicationSnapshot, Locale, RenderCvRequest } from "../types";

export interface ApplicationCvSnapshot extends RenderCvRequest {
  html: string;
  jobDescription?: string;
}

interface ApplicationTrackerProps {
  api: CvmakerApi;
  messages: Messages;
  locale: Locale;
  userId?: string;
  snapshot: ApplicationCvSnapshot;
  defaultRole?: string;
}

export function ApplicationTracker({ api, messages, locale, userId, snapshot, defaultRole }: ApplicationTrackerProps) {
  const queryClient = useQueryClient();
  const [company, setCompany] = useState("");
  const [role, setRole] = useState(defaultRole ?? "");
  const [status, setStatus] = useState("draft");
  const [jobUrl, setJobUrl] = useState("");

  const applications = useQuery({
    queryKey: ["applications", userId],
    queryFn: api.listApplications,
    enabled: Boolean(userId),
  });
  const track = useMutation({
    mutationFn: () => {
      const body: ApplicationSnapshot = { ...snapshot, company: company.trim(), role: role.trim() };
      if (status.trim()) body.status = status.trim();
      if (jobUrl.trim()) body.jobUrl = jobUrl.trim();
      return api.trackApplication(body);
    },
    onSuccess: () => {
      setCompany("");
      setJobUrl("");
      void queryClient.invalidateQueries({ queryKey: ["applications", userId] });
    },
  });

  if (!userId) return null;
  const ready = Boolean(snapshot.html && snapshot.cv.personal_info.full_name);

  return (
    <section className="library" aria-labelledby="applications-title">
      <div className="library-heading">
        <div>
          <p className="eyebrow">{messages.applicationsHint}</p>
          <h2 id="applications-title">{messages.applicationsTitle}</h2>
        </div>
      </div>
      <div className="library-drawer">
        <form
          className="tracker-form"
          onSubmit={(event) => {
            event.preventDefault();
            if (company.trim() && role.trim() && ready && !track.isPending) track.mutate();
          }}
        >
          <div className="field-grid">
            <label>{messages.company}<input value={company} onChange={(event) => setCompany(event.target.value)} /></label>
            <label>{messages.role}<input value={role} onChange={(event) => setRole(event.target.value)} /></label>
          </div>
          <div className="field-grid">
            <label>{messages.applicationStatus}<input value={status} onChange={(event) => setStatus(event.target.value)} /></label>
            <label>{messages.jobUrl}<input type="url" value={jobUrl} onChange={(event) => setJobUrl(event.target.value)} /></label>
          </div>
          <div className="wizard-actions">
            <button type="submit" disabled={!company.trim() || !role.trim() || !ready || track.isPending}>
              {track.isPending ? messages.savingApplication : messages.saveApplication}
            </button>
          </div>
          {track.isSuccess && <p className="success" role="status">{messages.applicationSaved}</p>}
          {track.isError && <p className="error" role="alert">{messages.applicationError}</p>}
        </form>
        {applications.isPending && <p>{messages.loadingApplications}</p>}
        {applications.isError && <p className="error" role="alert">{messages.applicationsError}</p>}
        {!applications.isPending && !applications.isError && applications.data.applications.length === 0 && (
          <p className="empty-library">{messages.noApplications}</p>
        )}
        {applications.data?.applications.map((application) => (
          <article className="library-item" key={application.id}>
            <div>
              <strong>{application.company} · {application.role}</strong>
              <small>{formatDate(application.createdAt, locale)} · {application.status}</small>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function formatDate(value: string, locale: Locale): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(date);
}
