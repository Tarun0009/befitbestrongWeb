import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";

const execFileAsync = promisify(execFile);
const backendDirectory = path.resolve(process.cwd(), "../backend");
const tsxCli = path.join(backendDirectory, "node_modules", "tsx", "dist", "cli.mjs");

export type CheckoutFlow = "cod" | "prepaid";

export interface CheckoutFixture {
  flow: CheckoutFlow;
  runId: string;
  categoryId: string;
  productId: string;
  variantId: string;
  productName: string;
  pincode: string;
  city: string;
  email: string;
  expectedTotal: number;
}

export async function setupCheckoutFixture(
  flow: CheckoutFlow,
  runId: string,
): Promise<CheckoutFixture> {
  return runFixtureCommand<CheckoutFixture>("setup", flow, runId);
}

export async function cleanupCheckoutFixture(
  flow: CheckoutFlow,
  runId: string,
  cartSid?: string,
) {
  await runFixtureCommand<{ ok: true }>("cleanup", flow, runId, cartSid);
}

async function runFixtureCommand<T>(
  command: "setup" | "cleanup",
  flow: CheckoutFlow,
  runId: string,
  cartSid?: string,
): Promise<T> {
  const args = [
    tsxCli,
    "scripts/e2e/checkout/checkoutFixture.ts",
    command,
    flow,
    runId,
    ...(cartSid ? [cartSid] : []),
  ];
  const { stdout } = await execFileAsync(process.execPath, args, {
    cwd: backendDirectory,
    env: { ...process.env, E2E_FIXTURE_MODE: "1" },
    timeout: 30_000,
  });
  const jsonLine = stdout
    .trim()
    .split(/\r?\n/)
    .findLast((line) => line.trim().startsWith("{"));
  if (!jsonLine) {
    throw new Error(`Checkout fixture ${flow} ${command} returned no JSON`);
  }
  return JSON.parse(jsonLine) as T;
}
