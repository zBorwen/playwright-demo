import { readFile } from 'fs/promises';
import type { NetworkEntry } from '@playwright-demo/shared';

const STATIC_MIME_TYPES = [
  'text/css',
  'application/javascript',
  'application/x-javascript',
  'text/javascript',
  'image/svg+xml',
  'image/webp',
  'font/woff',
  'font/woff2',
  'font/ttf',
  'font/otf',
  'application/pdf',
  'application/x-font',
];

function isStaticAsset(mimeType: string): boolean {
  const normalized = mimeType.toLowerCase().split(';')[0].trim();
  for (const pattern of STATIC_MIME_TYPES) {
    if (pattern.endsWith('/')) {
      if (normalized.startsWith(pattern)) return true;
    } else if (normalized === pattern) {
      return true;
    }
  }
  // Prefix match for image/*, audio/*, video/*
  if (normalized.startsWith('image/') || normalized.startsWith('audio/') || normalized.startsWith('video/')) {
    return true;
  }
  return false;
}

interface HarEntry {
  request: {
    url: string;
    method: string;
    headers?: { name: string; value: string }[];
    postData?: { text: string };
  };
  response: {
    status: number;
    statusText: string;
    content: { text?: string; mimeType: string; size: number };
    headers?: { name: string; value: string }[];
  };
  startedDateTime?: string;
  time: number;
  timings?: {
    blocked?: number;
    dns?: number;
    connect?: number;
    send?: number;
    wait?: number;
    receive?: number;
  };
}

interface HarLog {
  log: {
    entries: HarEntry[];
  };
}

export async function parseAndFilterHar(harPath: string): Promise<NetworkEntry[]> {
  const content = await readFile(harPath, 'utf-8');
  const har: HarLog = JSON.parse(content);

  let idCounter = 0;
  return har.log.entries
    .filter((entry) => !isStaticAsset(entry.response.content.mimeType))
    .map((entry) => ({
      id: `entry-${idCounter++}`,
      url: entry.request.url,
      method: entry.request.method,
      status: entry.response.status,
      statusText: entry.response.statusText || '',
      mimeType: entry.response.content.mimeType,
      requestHeaders: headersToRecord(entry.request.headers),
      requestBody: entry.request.postData?.text,
      responseBody: entry.response.content.text ?? '',
      responseHeaders: headersToRecord(entry.response.headers),
      timing: {
        blocked: entry.timings?.blocked ?? 0,
        dns: entry.timings?.dns ?? 0,
        connect: entry.timings?.connect ?? 0,
        send: entry.timings?.send ?? 0,
        wait: entry.timings?.wait ?? 0,
        receive: entry.timings?.receive ?? 0,
      },
      startedDateTime: entry.startedDateTime,
      contentSize: entry.response.content.size,
    }));
}

function headersToRecord(
  headers: { name: string; value: string }[] | undefined,
): Record<string, string> | undefined {
  if (!headers) return undefined;
  const record: Record<string, string> = {};
  for (const h of headers) {
    record[h.name.toLowerCase()] = h.value;
  }
  return record;
}
