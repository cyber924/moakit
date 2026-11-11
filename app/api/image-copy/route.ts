import {copyImageApi} from '../../../server/image-copy.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// This POST-only endpoint is authenticated and checks the administrator account.
export async function POST(request: Request) {
  return copyImageApi(request);
}
