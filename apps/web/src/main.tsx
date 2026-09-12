import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { App } from "./App";
import { createApiClient } from "./api/client";
import { createCvmakerApi } from "./api/cvmaker";
import "./styles.css";

const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: 30_000 } } });
const api = createCvmakerApi(createApiClient(import.meta.env.VITE_API_BASE));

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App api={api} />
    </QueryClientProvider>
  </StrictMode>,
);
