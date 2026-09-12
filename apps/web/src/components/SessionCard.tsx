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
  const login = useMutation({
    mutationFn: api.loginForDevelopment,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["session"] }),
  });

  return (
    <aside className="session-card" aria-labelledby="session-title">
      <span className="status-dot" data-active={session.isSuccess} />
      <div>
        <p className="label" id="session-title">{messages.session}</p>
        {session.isPending && <p>{messages.checking}</p>}
        {session.isSuccess && (
          <>
            <strong>{messages.signedIn}</strong>
            <p>{session.data.user.email} · {session.data.currentPage.role}</p>
            <small>
              {messages.uses}: {session.data.usage.limit === null
                ? messages.unlimited
                : `${Math.max(0, session.data.usage.limit - session.data.usage.used)}/${session.data.usage.limit}`}
            </small>
          </>
        )}
        {session.isError && (
          <>
            <strong>{messages.signedOut}</strong>
            <p>{messages.loginHint}</p>
            <button type="button" className="text-link" disabled={login.isPending} onClick={() => login.mutate()}>
              {messages.signIn}
            </button>
          </>
        )}
      </div>
    </aside>
  );
}
