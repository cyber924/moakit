import { extract } from '../../../../server/extract.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 180;

export async function POST(request: Request) {
  // Never initialize the provider at build time or expose its key to the browser.
  return extract(request, {
    GEMINI_API_KEY: process.env.GEMINI_API_KEY,
    GEMINI_PDF_MODEL: process.env.GEMINI_PDF_MODEL,
  });
}
