import { createHash } from "node:crypto";
import { createServer } from "node:http";

const port = Number(process.env.PORT ?? 4010);
const keyId = process.env.E2E_RAZORPAY_KEY_ID ?? "rzp_test_e2e_checkout";
const keySecret =
  process.env.E2E_RAZORPAY_KEY_SECRET ?? "e2e-razorpay-key-secret";
const expectedAuthorization = `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString("base64")}`;
const ordersByReceipt = new Map();

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", `http://${request.headers.host}`);
  if (request.method === "GET" && url.pathname === "/health") {
    return send(response, 200, { ok: true, service: "e2e-razorpay-stub" });
  }
  if (request.headers.authorization !== expectedAuthorization) {
    return send(response, 401, { error: { code: "BAD_REQUEST_ERROR" } });
  }
  if (request.method === "POST" && url.pathname === "/v1/orders") {
    const body = await readJson(request);
    if (
      !body ||
      !Number.isInteger(body.amount) ||
      body.amount <= 0 ||
      typeof body.currency !== "string" ||
      typeof body.receipt !== "string" ||
      !body.receipt
    ) {
      return send(response, 400, { error: { code: "BAD_REQUEST_ERROR" } });
    }
    const order = {
      id: `order_e2e_${createHash("sha256").update(body.receipt).digest("hex").slice(0, 24)}`,
      amount: body.amount,
      currency: body.currency.toUpperCase(),
      receipt: body.receipt,
      status: "created",
      notes: body.notes ?? {},
    };
    ordersByReceipt.set(body.receipt, order);
    return send(response, 200, order);
  }
  if (request.method === "GET" && url.pathname === "/v1/orders") {
    const receipt = url.searchParams.get("receipt") ?? "";
    const order = ordersByReceipt.get(receipt);
    return send(response, 200, { items: order ? [order] : [], count: order ? 1 : 0 });
  }
  return send(response, 404, { error: { code: "NOT_FOUND" } });
});

server.listen(port, "127.0.0.1", () => {
  process.stdout.write(`E2E Razorpay stub ready on ${port}\n`);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => server.close(() => process.exit(0)));
}

async function readJson(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 1024 * 1024) return null;
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    return null;
  }
}

function send(response, status, body) {
  response.writeHead(status, { "Content-Type": "application/json" });
  response.end(JSON.stringify(body));
}
