import { env } from "../src/config/env.js";
import { getRuntimeConfigurationStatus } from "../src/config/runtimeConfig.js";

const status = getRuntimeConfigurationStatus(env);
console.log(
  JSON.stringify(
    {
      status: status.ready ? "ready" : "incomplete",
      environment: status.environment,
      release: status.release,
      trustProxyHops: status.trustProxyHops,
      required: status.required,
      capabilities: status.capabilities,
    },
    null,
    2,
  ),
);

if (!status.ready) process.exitCode = 1;
