import { buildApp } from "./app.js";
import { config } from "./config.js";

const app = buildApp();

app.listen({ port: config.port, host: config.host }).catch((error: unknown) => {
  app.log.error(error);
  process.exit(1);
});
