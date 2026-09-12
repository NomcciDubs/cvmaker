import { serve } from "@hono/node-server";

import { createDevelopmentComposition } from "./composition";

const port = Number.parseInt(process.env.PORT ?? "3000", 10);
const hostname = process.env.HOST ?? "127.0.0.1";
const { app, close } = createDevelopmentComposition({ enableLogin: process.env.NODE_ENV !== "production" });

const server = serve({ fetch: app.fetch, hostname, port }, (info) => {
  console.log(`CVMaker API listening on http://${hostname}:${info.port}`);
});

async function shutdown(): Promise<void> {
  server.close();
  await close();
}

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
