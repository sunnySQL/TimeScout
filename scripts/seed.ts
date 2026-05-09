import "dotenv/config";
import { sql } from "drizzle-orm";
import { getDb, getPool } from "../db";
import { listings, sources } from "../db/schema";
import { parseWatch } from "../lib/watches/parse";

type SeedListing = {
  externalId: string;
  title: string;
  description?: string;
  brandRaw: string;
  modelRaw?: string;
  referenceRaw?: string;
  priceUsd: number;
  condition: "new" | "unworn" | "used" | "vintage";
  listingUrl: string;
  imageUrl?: string;
  region?: string;
};

const fakeListings: SeedListing[] = [
  {
    externalId: "demo-rolex-sub-1",
    title: "Rolex Submariner Date 126610LN - 2023 Box & Papers",
    brandRaw: "Rolex",
    modelRaw: "Submariner Date",
    referenceRaw: "126610LN",
    priceUsd: 14250,
    condition: "unworn",
    listingUrl: "https://example.com/listings/demo-rolex-sub-1",
    region: "NY",
  },
  {
    externalId: "demo-rolex-dj-1",
    title: "Rolex Datejust 41 Wimbledon 126334 - excellent condition",
    brandRaw: "Rolex",
    modelRaw: "Datejust 41",
    referenceRaw: "126334",
    priceUsd: 11800,
    condition: "used",
    listingUrl: "https://example.com/listings/demo-rolex-dj-1",
    region: "CA",
  },
  {
    externalId: "demo-omega-smp-1",
    title: "Omega Seamaster Diver 300M 210.30.42.20.01.001",
    brandRaw: "Omega",
    modelRaw: "Seamaster Diver 300M",
    referenceRaw: "210.30.42.20.01.001",
    priceUsd: 4950,
    condition: "used",
    listingUrl: "https://example.com/listings/demo-omega-smp-1",
    region: "TX",
  },
  {
    externalId: "demo-omega-speed-1",
    title: "Omega Speedmaster Professional Moonwatch 310.30.42.50.01.001",
    brandRaw: "Omega",
    modelRaw: "Speedmaster Professional",
    referenceRaw: "310.30.42.50.01.001",
    priceUsd: 6400,
    condition: "new",
    listingUrl: "https://example.com/listings/demo-omega-speed-1",
    region: "FL",
  },
  {
    externalId: "demo-tudor-bb58-1",
    title: "Tudor Black Bay 58 Blue 79030B - 2022",
    brandRaw: "Tudor",
    modelRaw: "Black Bay 58",
    referenceRaw: "79030B",
    priceUsd: 3650,
    condition: "used",
    listingUrl: "https://example.com/listings/demo-tudor-bb58-1",
    region: "IL",
  },
  {
    externalId: "demo-tudor-pel-1",
    title: "Tudor Pelagos 39 25407N - full set",
    brandRaw: "Tudor",
    modelRaw: "Pelagos 39",
    referenceRaw: "25407N",
    priceUsd: 4100,
    condition: "unworn",
    listingUrl: "https://example.com/listings/demo-tudor-pel-1",
    region: "WA",
  },
  {
    externalId: "demo-seiko-skx-1",
    title: "Seiko SKX007 Classic Dive - sapphire mod",
    brandRaw: "Seiko",
    modelRaw: "SKX007",
    referenceRaw: "SKX007",
    priceUsd: 375,
    condition: "used",
    listingUrl: "https://example.com/listings/demo-seiko-skx-1",
    region: "OR",
  },
  {
    externalId: "demo-seiko-5-1",
    title: "Seiko 5 Sports SRPD55 - brand new in box",
    brandRaw: "Seiko",
    modelRaw: "5 Sports",
    referenceRaw: "SRPD55",
    priceUsd: 195,
    condition: "new",
    listingUrl: "https://example.com/listings/demo-seiko-5-1",
    region: "GA",
  },
  {
    externalId: "demo-grandseiko-snowflake-1",
    title: "Grand Seiko Snowflake SBGA211 - titanium spring drive",
    brandRaw: "Grand Seiko",
    modelRaw: "Snowflake",
    referenceRaw: "SBGA211",
    priceUsd: 5700,
    condition: "used",
    listingUrl: "https://example.com/listings/demo-grandseiko-snowflake-1",
    region: "CA",
  },
  {
    externalId: "demo-ap-royaloak-1",
    title: "Audemars Piguet Royal Oak 15500ST Blue Dial",
    brandRaw: "Audemars Piguet",
    modelRaw: "Royal Oak",
    referenceRaw: "15500ST",
    priceUsd: 42500,
    condition: "used",
    listingUrl: "https://example.com/listings/demo-ap-royaloak-1",
    region: "NV",
  },
  {
    externalId: "demo-patek-nautilus-1",
    title: "Patek Philippe Nautilus 5711/1A Blue Dial - 2020",
    brandRaw: "Patek Philippe",
    modelRaw: "Nautilus",
    referenceRaw: "5711/1A",
    priceUsd: 128000,
    condition: "used",
    listingUrl: "https://example.com/listings/demo-patek-nautilus-1",
    region: "NY",
  },
  {
    externalId: "demo-cartier-tank-1",
    title: "Cartier Tank Must Large WSTA0041",
    brandRaw: "Cartier",
    modelRaw: "Tank Must",
    referenceRaw: "WSTA0041",
    priceUsd: 2850,
    condition: "unworn",
    listingUrl: "https://example.com/listings/demo-cartier-tank-1",
    region: "MA",
  },
  {
    externalId: "demo-iwc-pilot-1",
    title: "IWC Pilot's Watch Mark XVIII IW327011",
    brandRaw: "IWC",
    modelRaw: "Pilot Mark XVIII",
    referenceRaw: "IW327011",
    priceUsd: 3250,
    condition: "used",
    listingUrl: "https://example.com/listings/demo-iwc-pilot-1",
    region: "MI",
  },
  {
    externalId: "demo-panerai-luminor-1",
    title: "Panerai Luminor Marina PAM01312",
    brandRaw: "Panerai",
    modelRaw: "Luminor Marina",
    referenceRaw: "PAM01312",
    priceUsd: 4800,
    condition: "used",
    listingUrl: "https://example.com/listings/demo-panerai-luminor-1",
    region: "AZ",
  },
  {
    externalId: "demo-breitling-nav-1",
    title: "Breitling Navitimer B01 Chronograph 46 AB0137",
    brandRaw: "Breitling",
    modelRaw: "Navitimer B01",
    referenceRaw: "AB0137",
    priceUsd: 6250,
    condition: "unworn",
    listingUrl: "https://example.com/listings/demo-breitling-nav-1",
    region: "CO",
  },
  {
    externalId: "demo-jlc-reverso-1",
    title: "Jaeger-LeCoultre Reverso Classic Medium Q2548520",
    brandRaw: "Jaeger-LeCoultre",
    modelRaw: "Reverso Classic",
    referenceRaw: "Q2548520",
    priceUsd: 6900,
    condition: "used",
    listingUrl: "https://example.com/listings/demo-jlc-reverso-1",
    region: "NJ",
  },
  {
    externalId: "demo-hamilton-khaki-1",
    title: "Hamilton Khaki Field Mechanical 38mm H69439931",
    brandRaw: "Hamilton",
    modelRaw: "Khaki Field Mechanical",
    referenceRaw: "H69439931",
    priceUsd: 475,
    condition: "new",
    listingUrl: "https://example.com/listings/demo-hamilton-khaki-1",
    region: "OH",
  },
  {
    externalId: "demo-vintage-speedy-1",
    title: "Vintage Omega Speedmaster 145.022 - 1971 tropical dial",
    brandRaw: "Omega",
    modelRaw: "Speedmaster",
    referenceRaw: "145.022",
    priceUsd: 11500,
    condition: "vintage",
    listingUrl: "https://example.com/listings/demo-vintage-speedy-1",
    region: "PA",
  },
  {
    externalId: "demo-vintage-sub-1",
    title: "Vintage Rolex Submariner 5513 - 1978 matte dial",
    brandRaw: "Rolex",
    modelRaw: "Submariner",
    referenceRaw: "5513",
    priceUsd: 22500,
    condition: "vintage",
    listingUrl: "https://example.com/listings/demo-vintage-sub-1",
    region: "CA",
  },
  {
    externalId: "demo-cartier-santos-1",
    title: "Cartier Santos Medium WSSA0010",
    brandRaw: "Cartier",
    modelRaw: "Santos",
    referenceRaw: "WSSA0010",
    priceUsd: 7300,
    condition: "used",
    listingUrl: "https://example.com/listings/demo-cartier-santos-1",
    region: "TX",
  },
];

async function main() {
  const db = getDb();

  await db.execute(sql`DELETE FROM listings`);
  await db.execute(sql`DELETE FROM sources`);

  await db.insert(sources).values({
    slug: "demo",
    name: "Demo data",
    baseUrl: "https://example.com",
    isActive: true,
  });

  const [source] = await db
    .select()
    .from(sources)
    .where(sql`slug = 'demo'`);

  if (!source) {
    throw new Error("Failed to create demo source");
  }

  for (const l of fakeListings) {
    const parsed = parseWatch(l.title);
    await db.insert(listings).values({
      sourceId: source.id,
      externalId: l.externalId,
      title: l.title,
      description: l.description ?? null,
      brandRaw: l.brandRaw,
      modelRaw: l.modelRaw ?? null,
      referenceRaw: l.referenceRaw ?? null,
      brand: parsed.brand ?? l.brandRaw,
      reference: parsed.reference ?? l.referenceRaw ?? null,
      priceCents: Math.round(l.priceUsd * 100),
      currency: "USD",
      condition: l.condition,
      listingUrl: l.listingUrl,
      imageUrl: l.imageUrl ?? null,
      region: l.region ?? null,
    });
  }

  console.log(`Seeded ${fakeListings.length} listings for source "${source.slug}".`);
  await getPool().end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
