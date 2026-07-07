import { createApp } from "./app";
import { getEnv } from "./config/env";

try {
  const env = getEnv();
  const app = createApp();

  app.listen(env.PORT, () => {
    console.log(`API listening on http://localhost:${env.PORT}`);
  });
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
}
