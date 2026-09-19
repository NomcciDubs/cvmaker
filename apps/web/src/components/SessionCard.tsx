import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CvmakerApi } from "../api/cvmaker";
import type { Messages } from "../i18n/messages";

interface SessionCardProps {
  api: CvmakerApi;
  messages: Messages;
}

export function SessionCard({ api, messages }: SessionCardProps) {
  const queryClient = useQueryClient();
  const session = useQuery({
    queryKey: ["session"],
    queryFn: api.getSession,
    retry: false,
  });
  const logout = useMutation({
    mutationFn: api.logoutForDevelopment,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["session"] }),
  });

  return (
    <aside className="session-card" aria-label={messages.session}>
      <span className="status-dot" data-active={session.isSuccess} aria-hidden="true" />
      <div className="session-meta" aria-live="polite">
        {session.isPending && <strong>{messages.checking}</strong>}
        {session.isSuccess && (
          <>
            <strong>{session.data.user.email}</strong>
            <small>
              {messages.uses}: {session.data.usage.limit === null
                ? messages.unlimited
                : `${Math.max(0, session.data.usage.limit - session.data.usage.used)}/${session.data.usage.limit}`}
            </small>
          </>
        )}
        {session.isError && <strong>{messages.signedOut}</strong>}
      </div>
      <div className="session-actions">
        {session.isSuccess && (
          <button type="button" className="text-link" disabled={logout.isPending} onClick={() => logout.mutate()}>
            {messages.signOut}
          </button>
        )}
      </div>
    </aside>
  );
}
