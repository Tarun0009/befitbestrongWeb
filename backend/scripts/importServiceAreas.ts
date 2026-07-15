import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { PrismaClient, type ServiceZone } from "@prisma/client";

const prisma = new PrismaClient();

function parseCsv(input: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index]!;
    const next = input[index + 1];
    if (char === '"' && quoted && next === '"') {
      field += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      row.push(field);
      field = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(field);
      if (row.some((value) => value.trim())) rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function key(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function pick(record: Record<string, string>, names: string[]) {
  for (const name of names) {
    const value = record[key(name)];
    if (value) return value.trim();
  }
  return "";
}

function classify(state: string, district: string): ServiceZone | null {
  const stateKey = key(state);
  const districtKey = key(district);
  if (stateKey === "delhi") return "DELHI";
  if (
    districtKey.includes("gautambuddhanagar") ||
    districtKey.includes("gautambudhnagar") ||
    districtKey === "noida"
  ) {
    return "NOIDA";
  }
  if (districtKey.includes("ghaziabad")) return "GHAZIABAD";
  return null;
}

async function main() {
  const fileArg = process.argv.find((value) => value.startsWith("--file="));
  if (!fileArg) {
    throw new Error(
      "Usage: npm run service-areas:import -- --file=C:\\path\\pincode.csv [--activate]",
    );
  }
  const activate = process.argv.includes("--activate");
  const csv = await readFile(resolve(fileArg.slice("--file=".length)), "utf8");
  const [headers, ...rows] = parseCsv(csv);
  if (!headers) throw new Error("CSV is empty");

  const headerKeys = headers.map(key);
  const unique = new Map<
    string,
    { pincode: string; zone: ServiceZone; city: string; state: string }
  >();

  for (const row of rows) {
    const record = Object.fromEntries(
      headerKeys.map((header, index) => [header, row[index]?.trim() ?? ""]),
    );
    const pincode = pick(record, ["pincode", "pin code"]);
    const state = pick(record, ["statename", "state name", "state"]);
    const district = pick(record, ["district", "districtname"]);
    const city =
      pick(record, ["taluk", "city", "district"]) ||
      (state.toLowerCase() === "delhi" ? "Delhi" : district);
    const zone = classify(state, district);

    if (!/^\d{6}$/.test(pincode) || !zone) continue;
    unique.set(pincode, {
      pincode,
      zone,
      city: zone === "NOIDA" ? "Noida" : zone === "GHAZIABAD" ? "Ghaziabad" : city,
      state: zone === "DELHI" ? "Delhi" : "Uttar Pradesh",
    });
  }

  let created = 0;
  let updated = 0;
  for (const area of unique.values()) {
    const existing = await prisma.serviceArea.findUnique({
      where: { pincode: area.pincode },
      select: { id: true },
    });
    await prisma.serviceArea.upsert({
      where: { pincode: area.pincode },
      update: {
        zone: area.zone,
        city: area.city,
        state: area.state,
        ...(activate ? { active: true } : {}),
      },
      create: {
        ...area,
        active: activate,
        prepaidEnabled: true,
        codEnabled: true,
        codMaxOrderAmount: 500_000,
        codFee: 0,
        estimatedDeliveryMinDays: 1,
        estimatedDeliveryMaxDays: 3,
      },
    });
    existing ? (updated += 1) : (created += 1);
  }

  console.log({
    source: resolve(fileArg.slice("--file=".length)),
    activate,
    matched: unique.size,
    created,
    updated,
  });
  if (!activate) {
    console.log(
      "Imported rows are inactive. Review them in Admin > Service areas before activation.",
    );
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

