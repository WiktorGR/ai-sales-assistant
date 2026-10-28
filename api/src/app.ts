import Fastify, { type FastifyInstance } from "fastify";
import { config } from "./config.js";
import { guardRoutes } from "./routes/guard.js";
import { priceRoutes } from "./routes/price.js";
import { validateRoutes } from "./routes/validate.js";

/**
 * Business outcomes (validation failed, email flagged, unknown SKU) are returned as
 * HTTP 200 with `ok: false` so n8n can branch on the `ok` field with a plain IF node.
 */
export function buildApp(opts: { logger?: boolean } = {}): FastifyInstance {
  const app = Fastify({
    logger: opts.logger === false ? false : { level: config.logLevel },
    bodyLimit: 1024 * 1024,
  });

  app.setErrorHandler((error: { statusCode?: number }, req, reply) => {
    const status = error.statusCode ?? 500;
    if (status >= 500) req.log.error({ err: error }, "unhandled error");
    void reply.status(status).send({
      ok: false,
      error: status >= 500 ? "Internal server error" : "Malformed request",
      code: status >= 500 ? "INTERNAL_ERROR" : "BAD_REQUEST",
    });
  });

  app.get("/health", async () => ({ ok: true }));
  void app.register(validateRoutes);
  void app.register(guardRoutes);
  void app.register(priceRoutes);

  return app;
}
