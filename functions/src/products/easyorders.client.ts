import { defineString } from 'firebase-functions/params';
import { HttpsError } from 'firebase-functions/v2/https';

const BASE_URL = 'https://api.easy-orders.net/api/v1';
const EMPTY_CATALOGUE =
  'EasyOrders did not return any products. The store link or currency id may have changed.';

export const EASYORDERS_CURRENCY_ID = defineString('EASYORDERS_CURRENCY_ID', {
  default: 'd3379j525xzj5803jxx452d2fj24v4f6006fff9v2x66246jz6584z9d6z4v1v03',
  description: 'Public currency id from the Atteya EasyOrders store page.',
});

export const EASYORDERS_ORIGIN = defineString('EASYORDERS_ORIGIN', {
  default: 'https://www.atteyastore.com',
  description: 'Origin header EasyOrders requires before it returns products.',
});

export class EasyOrdersError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EasyOrdersError';
  }
}

export async function fetchEasyOrdersProductIds(): Promise<readonly string[]> {
  const ids: string[] = [];
  for (let page = 1; page <= 20; page += 1) {
    const body = await getJson(`/products?limit=100&page=${page}`);
    if (!isRecord(body) || !Array.isArray(body['data'])) {
      throw new HttpsError('failed-precondition', EMPTY_CATALOGUE);
    }
    if (body['data'].length === 0) break;
    for (const item of body['data']) {
      if (isRecord(item) && typeof item['id'] === 'string' && item['id'].trim()) {
        ids.push(item['id'].trim());
      }
    }
    if (body['next_page'] == null) break;
  }
  if (ids.length === 0) {
    throw new HttpsError('failed-precondition', EMPTY_CATALOGUE);
  }
  ids.sort();
  return ids;
}

export async function fetchEasyOrdersProduct(id: string): Promise<unknown> {
  const body = await getJson(`/products/${encodeURIComponent(id)}`);
  if (!isRecord(body) || typeof body['id'] !== 'string') {
    throw new EasyOrdersError('EasyOrders did not return that product.');
  }
  return body;
}

async function getJson(path: string): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(`${BASE_URL}${path}`, {
      headers: {
        Accept: 'application/json',
        'Currency-Id': EASYORDERS_CURRENCY_ID.value(),
        Origin: EASYORDERS_ORIGIN.value(),
      },
    });
  } catch {
    throw new EasyOrdersError('Could not reach EasyOrders. Please try again.');
  }
  if (!response.ok) {
    throw new EasyOrdersError('EasyOrders did not answer. Please try again.');
  }
  try {
    return await response.json() as unknown;
  } catch {
    throw new EasyOrdersError(EMPTY_CATALOGUE);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
