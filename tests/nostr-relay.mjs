// Minimal in-process Nostr relay for the RTC E2E (RTC_RELAY=local). It answers the game's default relay URLs through
// Playwright WebSocket routing, so the page code (GameKit createNostrDynamicRoom with its default relay list) is unchanged.
// Supports what the GameKit signaler uses: EVENT → OK + fan-out to matching subscriptions, REQ (kinds, #<tag>, since,
// until, authors, ids) → EOSE, CLOSE. Events are relayed as received (the signaler verifies them itself); nothing is stored,
// like an ephemeral-kind relay.
const RELAY_URL=/^wss:\/\/relay\.(primal\.net|damus\.io)\/?$/;
const matches=(f,e)=>(!f.ids||f.ids.includes(e.id))&&(!f.authors||f.authors.includes(e.pubkey))&&(!f.kinds||f.kinds.includes(e.kind))&&
 (f.since===undefined||e.created_at>=f.since)&&(f.until===undefined||e.created_at<=f.until)&&
 Object.entries(f).filter(([k])=>k[0]==='#').every(([k,v])=>(e.tags||[]).some(t=>t[0]===k.slice(1)&&v.includes(t[1])));
export function routeLocalNostrRelay(){
 const clients=new Set(),stats={connections:0,events:0,deliveries:0};
 const handle=ws=>{const client={ws,subs:new Map()};clients.add(client);stats.connections++;
  ws.onMessage(raw=>{let frame;try{frame=JSON.parse(String(raw));}catch{return;}if(!Array.isArray(frame))return;
   if(frame[0]==='EVENT'&&frame[1]&&typeof frame[1]==='object'){const e=frame[1];stats.events++;ws.send(JSON.stringify(['OK',String(e.id),true,'']));
    for(const c of clients)for(const [id,filters]of c.subs)if(filters.some(f=>matches(f,e))){stats.deliveries++;c.ws.send(JSON.stringify(['EVENT',id,e]));}}
   else if(frame[0]==='REQ'&&typeof frame[1]==='string'){client.subs.set(frame[1],frame.slice(2).filter(f=>f&&typeof f==='object'));ws.send(JSON.stringify(['EOSE',frame[1]]));}
   else if(frame[0]==='CLOSE'&&typeof frame[1]==='string')client.subs.delete(frame[1]);});
  ws.onClose(()=>clients.delete(client));};
 return{stats,attach:context=>context.routeWebSocket(RELAY_URL,handle),close:()=>clients.clear()};
}
