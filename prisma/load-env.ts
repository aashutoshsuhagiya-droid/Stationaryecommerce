import { existsSync } from "node:fs";
import { resolve } from "node:path";

const inheritedEnvironment = { ...process.env };
for (const filename of [".env.local", ".env"]) {
  const path = resolve(process.cwd(), filename);
  if (existsSync(path)) {
    process.loadEnvFile(path);
    break;
  }
}
Object.assign(process.env, inheritedEnvironment);
