import {env} from 'cloudflare:workers';
import {imageLibraryApi} from '../../../server/image-library.mjs';
export async function GET(request:Request){return imageLibraryApi(request,env);}

export async function POST(request:Request){return imageLibraryApi(request,env);}
