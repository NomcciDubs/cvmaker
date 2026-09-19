import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CvmakerApi } from "../api/cvmaker";
import type { Messages } from "../i18n/messages";
import type { CvInputRecord, Locale, SavedCvRecord } from "../types";

interface CvLibraryProps {
  api: CvmakerApi;
  locale: Locale;
  messages: Messages;
  userId?: string;
  onUseInput: (input: CvInputRecord) => void;
  onUseCv: (cv: SavedCvRecord) => void;
}

export function CvLibrary({ api, locale, messages, userId, onUseInput, onUseCv }: CvLibraryProps) {
  const [view, setView] = useState<"inputs" | "outputs" | null>(null);
  const queryClient = useQueryClient();
  const inputs = useQuery({ queryKey: ["cv-inputs", userId], queryFn: api.listCvInputs, enabled: Boolean(userId) });
  const cvs = useQuery({ queryKey: ["cvs", userId], queryFn: api.listCvs, enabled: Boolean(userId) });
  const removeCv = useMutation({
    mutationFn: (id: string) => api.deleteCv(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["cvs", userId] }),
  });

  if (!userId) return null;
  const records = view === "inputs" ? inputs.data?.inputs : cvs.data?.cvs;
  const isPending = view === "inputs" ? inputs.isPending : cvs.isPending;
  const isError = view === "inputs" ? inputs.isError : cvs.isError;

  return <section className="library" aria-labelledby="library-title">
    <div className="library-heading">
      <h2 id="library-title">{messages.libraryTitle}</h2>
      <div className="library-tabs">
        <button type="button" className={`btn ${view === "inputs" ? "btn-primary" : "btn-secondary"}`} onClick={() => setView(view === "inputs" ? null : "inputs")}>{messages.inputs}</button>
        <button type="button" className={`btn ${view === "outputs" ? "btn-primary" : "btn-secondary"}`} onClick={() => setView(view === "outputs" ? null : "outputs")}>{messages.outputs}</button>
      </div>
    </div>
    {view && <div className="library-drawer">
      {isPending && <p>{messages.loadingLibrary}</p>}
      {isError && <p className="error" role="alert">{messages.libraryError}</p>}
      {!isPending && !isError && records?.length === 0 && <p className="empty-library">{messages.emptyLibrary}</p>}
      {view === "inputs" && inputs.data?.inputs.map((input) => <article className="library-item" key={input.id}>
        <div><strong>{input.name}</strong><small>{formatDate(input.updatedAt, locale)}</small><p>{input.content.slice(0, 150)}</p></div>
        <button type="button" className="btn btn-primary" onClick={() => onUseInput(input)}>{messages.useInput}</button>
      </article>)}
      {view === "outputs" && cvs.data?.cvs.map((cv) => <article className="library-item" key={cv.id}>
        <div><strong>{cv.name}</strong><small>{formatDate(cv.updatedAt, locale)} · {cv.style.replaceAll("_", " ")}</small><p>{cv.cv.personal_info.full_name || messages.unnamedCv}</p></div>
        <div className="library-item-actions">
          <button type="button" className="btn btn-secondary" onClick={() => onUseCv(cv)}>{messages.editCv}</button>
          <button type="button" className="btn btn-danger" disabled={removeCv.isPending} onClick={() => {
            if (window.confirm(messages.deleteCvConfirm)) removeCv.mutate(cv.id);
          }}>{messages.deleteCv}</button>
        </div>
      </article>)}
    </div>}
  </section>;
}

function formatDate(value: string, locale: Locale): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(date);
}
