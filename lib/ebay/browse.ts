import { getEbayAccessToken } from "./auth";

const BROWSE_SEARCH = "https://api.ebay.com/buy/browse/v1/item_summary/search";

/** Wristwatches category on eBay US. */
export const WRISTWATCHES_CATEGORY_ID = "31387";

export type EbayItemSummary = {
  itemId: string;
  title: string;
  price?: { value: string; currency: string };
  condition?: string;
  conditionId?: string;
  itemWebUrl: string;
  image?: { imageUrl: string };
  thumbnailImages?: Array<{ imageUrl: string }>;
  itemLocation?: { country?: string; stateOrProvince?: string; postalCode?: string };
  seller?: { username?: string };
  categories?: Array<{ categoryId: string; categoryName: string }>;
};

type SearchResponse = {
  itemSummaries?: EbayItemSummary[];
  total?: number;
  next?: string;
  offset?: number;
  limit?: number;
};

export type BrowseSearchParams = {
  q?: string;
  categoryId?: string;
  limit?: number;
  offset?: number;
  /** Extra filter string appended to the eBay `filter` query param. */
  filter?: string;
};

export async function browseSearch(
  params: BrowseSearchParams,
): Promise<SearchResponse> {
  const token = await getEbayAccessToken();

  const url = new URL(BROWSE_SEARCH);
  if (params.q) url.searchParams.set("q", params.q);
  if (params.categoryId) url.searchParams.set("category_ids", params.categoryId);
  url.searchParams.set("limit", String(params.limit ?? 50));
  url.searchParams.set("offset", String(params.offset ?? 0));

  const filters = ["deliveryCountry:US"];
  if (params.filter) filters.push(params.filter);
  url.searchParams.set("filter", filters.join(","));

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      "X-EBAY-C-MARKETPLACE-ID": "EBAY_US",
      "Content-Type": "application/json",
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`eBay Browse API error ${res.status}: ${text}`);
  }

  return (await res.json()) as SearchResponse;
}

/** Map eBay condition/conditionId to our internal condition values. */
export function normalizeEbayCondition(
  conditionId?: string,
  condition?: string,
): "new" | "unworn" | "used" | "vintage" | null {
  if (conditionId) {
    switch (conditionId) {
      case "1000":
        return "new";
      case "1500":
      case "1750":
        return "unworn";
      case "2000":
      case "2010":
      case "2020":
      case "2030":
      case "2500":
      case "2750":
      case "3000":
      case "4000":
      case "5000":
      case "6000":
        return "used";
      case "7000":
        return "used";
      default:
        break;
    }
  }
  const c = condition?.toLowerCase() ?? "";
  if (c.includes("new with tag") || c === "new") return "new";
  if (c.includes("open box") || c.includes("unworn")) return "unworn";
  if (c.includes("pre-owned") || c.includes("used") || c.includes("refurb")) return "used";
  if (c.includes("vintage")) return "vintage";
  return null;
}
