import {aiDraft} from '../../../server/ai-draft.mjs';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=180;
export const POST=(request:Request)=>aiDraft(request);
