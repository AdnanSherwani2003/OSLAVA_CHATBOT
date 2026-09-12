import { buildApp } from "./app.js";
import { getConfig } from "./config/env.js";
import { logger } from "./observability/logger.js";

async function main() {
  try {
    const config = getConfig();
    const app = await buildApp({ config });

    await app.listen({
      port: config.PORT,
      host: config.HOST,
    });

    logger.info(
      `Oslava Admin AI Backend listening at http://${config.HOST}:${config.PORT}`,
    );

    const shutdown = async (signal: string) => {
      logger.info(`Received ${signal}, shutting down gracefully...`);
      try {
        await app.close();
        logger.info("Server closed successfully.");
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
