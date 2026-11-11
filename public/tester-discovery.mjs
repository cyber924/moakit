import {isOpen} from './tester-core.mjs';
export const PUBLIC_CALL_STATUSES=['recruiting','closed','testing','completed'];
export function discoveryState(c,now=Date.now()){
 if(c.status==='recruiting')return isOpen(c,now)?'open':now<Date.parse(c.applyStart)?'upcoming':'closed';
 return c.status==='testing'?'testing':c.status==='completed'?'completed':c.status==='closed'?'closed':'private';
}
export function deadlineLabel(c,now=Date.now()){
 if(discoveryState(c,now)!=='open')return '';
 const day=s=>Date.parse(new Date(s).toLocaleDateString('en-CA',{timeZone:'Asia/Seoul'})+'T00:00:00+09:00');
 const days=Math.round((day(c.applyEnd)-day(now))/86400000);
 return days<=0?'오늘 마감':`D-${days}`;
}
export function discoverCalls(calls,f={},now=Date.now()){
 const q=String(f.query||'').trim().toLowerCase();
 const rows=calls.filter(c=>{const s=discoveryState(c,now),w=c.data?.snapshot||{};
 return s!=='private'&&(!f.status||f.status==='all'||(f.status==='closing'?s==='open'&&Date.parse(c.applyEnd)-now<=3*86400000:s===f.status))&&(!f.technique||w.technique===f.technique)&&(!f.level||String(w.level)===f.level)&&(!f.category||w.category===f.category)&&(!f.support||c.supportStatus==='approved')&&(!q||[w.title,w.sellerName,w.technique,c.data?.message].join(' ').toLowerCase().includes(q));});
 return rows.sort((a,b)=>f.sort==='deadline'?((discoveryState(a,now)==='open'?0:1)-(discoveryState(b,now)==='open'?0:1)||((Date.parse(a.applyEnd)||Infinity)-(Date.parse(b.applyEnd)||Infinity))):String(b.createdAt).localeCompare(String(a.createdAt)));
}
