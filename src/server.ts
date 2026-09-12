import { buildApp } from "./app.js";
import { getConfig } from "./config/env.js";
import { logger } from "./observability/logger.js";
import { closePool } from "./persistence/database.js";

async function main() {
  try {
    const config = getConfig();
    const app = await buildApp({ config });

    await app.listen({
      port: config.PORT,
      host: config.HOST,
    });

    logger.info(
      `Oslava Admin AI Backend listening at http://${config.HOST}:${config.PORT} [mode: ${config.NODE_ENV}, persistence: ${config.CHAT_PERSISTENCE_MODE}]`,
    );

    let shuttingDown = false;

    const shutdown = async (signal: string) => {
      if (shuttingDown) return;
      shuttingDown = true;

      logger.info(`Received ${signal}, initiating bounded graceful shutdown...`);

      // Hard timeout of 10 seconds to prevent hanging processes
      const forceExitTimer = setTimeout(() => {
        logger.fatal("Graceful shutdown timed out after 10s. Forcefully terminating.");
        process.exit(1);
      }, 10_000);

      if (forceExitTimer.unref) {
        forceExitTimer.unref();
      }

      try {
        // 1. Stop accepting new HTTP requests and wait for in-flight requests to complete
        await app.close();
        logger.info("Fastify server closed.");

        // 2. Close PostgreSQL pool if active
        await closePool();

        clearTimeout(forceExitTimer);
        logger.info("Graceful shutdown completed successfully.");
        process.exit(0);
      } catch (err) {
        logger.error({ err }, "Error during graceful shutdown");
        process.exit(1);
      }
    };

    process.on("SIGINT", () => shutdown("SIGINT"));
    process.on("SIGTERM", () => shutdown("SIGTERM"));
  } catch (error) {
    logger.fatal({ err: error }, "Failed to start application server");
    process.exit(1);
  }
}

main();
