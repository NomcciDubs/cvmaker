import { defineConfig, loadEnv, type Connect, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

const LOGIN_PATHS = new Set(["/login", "/login/", "/en/login", "/en/login/", "/es/login", "/es/login/"]);

function isAppRoute(pathname: string): boolean {
  return pathname === "/"
    || pathname === "/en" || pathname === "/en/"
    || pathname === "/es" || pathname === "/es/"
    || pathname.startsWith("/en/") || pathname.startsWith("/es/");
}

function appRoutes(): Plugin {
  const middleware: Connect.NextHandleFunction = (request, _response, next) => {
    const url = request.url ?? "/";
    const search = url.includes("?") ? url.slice(url.indexOf("?")) : "";
    const [pathname] = url.split("?");
    if (pathname && LOGIN_PATHS.has(pathname)) request.url = `/login.html${search}`;
    else if (pathname && isAppRoute(pathname)) request.url = `/index.html${search}`;
    next();
  };
  return {
    name: "cvmaker-app-routes",
    configureServer(server) { server.middlewares.stack.unshift({ route: "", handle: middleware }); },
    configurePreviewServer(server) { server.middlewares.stack.unshift({ route: "", handle: middleware }); },
  };
}

export default defineConfig(({ mode }) => {
  const environment = loadEnv(mode, process.cwd(), "");
  return {
    appType: "mpa",
    plugins: [react(), appRoutes()],
    server: {
      proxy: {
        "/api": environment.VITE_API_PROXY_TARGET || "http://127.0.0.1:3000",
      },
    },
    test: {
      environment: "jsdom",
      setupFiles: "./src/test/setup.ts",
    },
  };
});
