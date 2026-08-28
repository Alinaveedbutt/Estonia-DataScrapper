import axios from 'axios';

export const YOLIST_API_BASE = 'https://yolist.uk/api/v1';

export interface YolistBusinessSummary {
  id: string;
  name: string;
  slug?: string;
  category?: string;
  city?: string;
  phone?: string | null;
  website?: string | null;
  rating?: number | null;
  reviewCount?: number;
  isVerified?: boolean;
}

export interface YolistListResponse {
  businesses: YolistBusinessSummary[];
  total: number;
  page: number;
  pages: number;
}

export interface YolistBusinessDetail extends YolistBusinessSummary {
  description?: string | null;
  addressLine1?: string;
  postcode?: string;
  county?: string | null;
}

export interface YolistSearchParams {
  postcode?: string;
  city?: string;
  category?: string;
  limit?: number;
  page?: number;
  apiKey?: string;
}

function citySlug(locality?: string): string | undefined {
  if (!locality) return undefined;
  return locality
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '');
}

function postcodeOutward(postalCode?: string): string | undefined {
  if (!postalCode) return undefined;
  const parts = postalCode.trim().split(/\s+/);
  return parts[0]?.toUpperCase();
}

export function buildYolistQueryParams(ctx: {
  locality?: string;
  postalCode?: string;
}): YolistSearchParams {
  return {
    postcode: postcodeOutward(ctx.postalCode),
    city: citySlug(ctx.locality),
    limit: 50,
    page: 1,
  };
}

export async function fetchYolistBusinesses(
  params: YolistSearchParams,
  timeoutMs = 8000
): Promise<YolistListResponse> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (params.apiKey) {
    headers.Authorization = `Bearer ${params.apiKey}`;
  }

  const response = await axios.get(`${YOLIST_API_BASE}/businesses`, {
    params: {
      postcode: params.postcode,
      city: params.city,
      category: params.category,
      limit: params.limit ?? 50,
      page: params.page ?? 1,
    },
    timeout: timeoutMs,
    headers,
    validateStatus: (s) => s < 500,
  });

  if (response.status === 429) {
    throw new Error('HTTP 429');
  }
  if (response.status === 401 || response.status === 403) {
    throw new Error(`HTTP ${response.status}`);
  }
  if (response.status !== 200) {
    throw new Error(`HTTP ${response.status}`);
  }

  return {
    businesses: response.data?.businesses ?? [],
    total: response.data?.total ?? 0,
    page: response.data?.page ?? 1,
    pages: response.data?.pages ?? 0,
  };
}

export async function fetchYolistBusinessDetail(
  id: string,
  apiKey?: string,
  timeoutMs = 8000
): Promise<YolistBusinessDetail | null> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

  const response = await axios.get(`${YOLIST_API_BASE}/businesses/${id}`, {
    timeout: timeoutMs,
    headers,
    validateStatus: (s) => s < 500,
  });

  if (response.status === 404) return null;
  if (response.status === 429) throw new Error('HTTP 429');
  if (response.status !== 200) throw new Error(`HTTP ${response.status}`);

  return response.data as YolistBusinessDetail;
}

function nameTokens(name: string): string[] {
  return name
    .toLowerCase()
    .replace(/\b(ltd|limited|llp|plc|inc|uk)\b/gi, '')
    .split(/[\s\-_&,]+/)
    .filter((t) => t.length > 2);
}

/** Match Yolist listings to a Companies House company name. */
export function filterYolistByCompanyName(
  businesses: YolistBusinessSummary[],
  companyName: string
): YolistBusinessSummary[] {
  const tokens = nameTokens(companyName);
  if (tokens.length === 0) return [];

  return businesses.filter((b) => {
    const name = (b.name || '').toLowerCase();
    const matched = tokens.filter((t) => name.includes(t));
    if (tokens.length === 1) return matched.length === 1;
    return matched.length / tokens.length >= 0.5;
  });
}

export function yolistBusinessToText(b: YolistBusinessSummary | YolistBusinessDetail): string {
  const parts = [
    b.name,
    b.category ? `Category: ${b.category}` : '',
    b.city ? `City: ${b.city}` : '',
    'addressLine1' in b && b.addressLine1 ? `Address: ${b.addressLine1}` : '',
    'postcode' in b && b.postcode ? `Postcode: ${b.postcode}` : '',
    b.phone ? `Phone: ${b.phone}` : '',
    b.website ? `Website: ${b.website}` : '',
    'description' in b && b.description ? b.description : '',
  ];
  return parts.filter(Boolean).join('. ');
}

export function isMaskedPhone(phone?: string | null): boolean {
  if (!phone) return false;
  return phone.includes('*') || phone.includes('xxxx');
}
