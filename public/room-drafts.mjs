const key=(uid,room,post)=>'moakit-room-draft:'+uid+':'+room+':'+(post||'new');
export function readRoomDraft(storage,uid,room,post=''){try{const d=JSON.parse(storage.getItem(key(uid,room,post))||'null');return d&&Date.now()-d.savedAt<7*86400000?d:null;}catch{return null;}}
export function saveRoomDraft(storage,uid,room,post,fields){try{storage.setItem(key(uid,room,post),JSON.stringify({kind:String(fields.kind||'question'),title:String(fields.title||'').slice(0,120),body:String(fields.body||'').slice(0,6000),savedAt:Date.now()}));return true;}catch{return false;}}
export function clearRoomDraft(storage,uid,room,post=''){try{storage.removeItem(key(uid,room,post));}catch{}}
