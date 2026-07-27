import { spawn } from "node:child_process";
import path from "node:path";

const nextCli = path.resolve("node_modules/next/dist/bin/next");
const port = process.env.PORT ?? "3005";

function runNext(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [nextCli, ...args], {
      env: process.env,
      stdio: "inherit",
    });

    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(
        new Error(
          `Next.js ${args[0]} exited with ${signal ? `signal ${signal}` : `code ${code}`}`,
        ),
      );
    });
  });
}

await runNext(["build"]);

const server = spawn(process.execPath, [nextCli, "start", "-p", port], {
  env: process.env,
  stdio: "inherit",
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    if (!server.killed) {
      server.kill(signal);
    }
  });
}

server.once("error", (error) => {
  throw error;
});

server.once("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 1);
});
