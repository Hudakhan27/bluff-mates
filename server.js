const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const port = Number(process.env.PORT || 3000);
const publicDir = path.join(__dirname, 'public');
const rooms = new Map();
const questions = [
  ['Which animal has three hearts?', 'Octopus', ['Sea turtle','Blue whale','Giant squid','Manta ray']],
  ['Which planet has the shortest day?', 'Jupiter', ['Mars','Mercury','Saturn','Neptune']],
  ['What is the dot over a lowercase i or j called?', 'Tittle', ['A jot','A fleck','A pip','A jotlet']],
  ['Which country gifted the Statue of Liberty to the US?', 'France', ['Italy','Spain','Belgium','Canada']],
  ['What is the smallest country by area?', 'Vatican City', ['Monaco','San Marino','Liechtenstein','Andorra']],
  ['Which creature has blue blood?', 'Horseshoe crab', ['Dolphin','Sea star','Manatee','Moray eel']],
  ['How many sides does a hectagon have?', '100', ['80','90','110','120']],
  ['Which food can last thousands of years without spoiling?', 'Honey', ['Salt','Rice','Dark chocolate','Olive oil']],
  ['What is Scotland’s national animal?', 'Unicorn', ['Highland cow','Golden eagle','Red deer','Dragon']],
  ['Which bird can fly backwards?', 'Hummingbird', ['Kingfisher','Swift','Sparrow','Woodpecker']],
  ['What is the most abundant gas in Earth’s atmosphere?', 'Nitrogen', ['Oxygen','Argon','Carbon dioxide','Hydrogen']],
  ['Who painted The Starry Night?', 'Vincent van Gogh', ['Claude Monet','Paul Cézanne','Salvador Dalí','Edvard Munch']],
  ['What is the world’s largest desert?', 'Antarctic Desert', ['Sahara','Arabian Desert','Gobi Desert','Kalahari']],
  ['Which mammal is capable of true flight?', 'Bat', ['Flying squirrel','Sugar glider','Colugo','Lemur']],
  ['Which language has the most native speakers?', 'Mandarin Chinese', ['English','Spanish','Hindi','Arabic']],
  ['What is the longest bone in the human body?', 'Femur', ['Tibia','Humerus','Fibula','Radius']],
  ['What is the chemical symbol for silver?', 'Ag', ['Si','Au','Sr','Sv']],
  ['Which instrument has 47 strings and 7 pedals?', 'Concert harp', ['Grand piano','Autoharp','Zither','Koto']],
  ['What is the fear of long words humorously called?', 'Hippopotomonstrosesquipedaliophobia', ['Sesquipedalophobia','Lexicophobia','Verbophobia','Glossophobia']],
  ['Which city is known as the City of Canals?', 'Venice', ['Amsterdam','Bruges','Copenhagen','Stockholm']]
].map(([q,a,f]) => ({ q,a,f }));

const id = () => crypto.randomBytes(12).toString('hex');
function code() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let value;
  do { value = Array.from(crypto.randomBytes(5), b => alphabet[b % alphabet.length]).join(''); } while (rooms.has(value));
  return value;
}
function frame(socket, opcode, payload) {
  if (socket.destroyed) return;
  const body = Buffer.isBuffer(payload) ? payload : Buffer.from(payload);
  let head;
  if (body.length < 126) head = Buffer.from([128 | opcode, body.length]);
  else if (body.length < 65536) { head = Buffer.alloc(4); head[0] = 128 | opcode; head[1] = 126; head.writeUInt16BE(body.length,2); }
  else { head = Buffer.alloc(10); head[0] = 128 | opcode; head[1] = 127; head.writeBigUInt64BE(BigInt(body.length),2); }
  socket.write(Buffer.concat([head,body]));
}
const send = (socket,data) => frame(socket,1,JSON.stringify(data));
const online = room => [...room.players.values()].filter(p => p.socket && !p.socket.destroyed);
function view(room, viewer) {
  const me = room.players.get(viewer);
  const state = {
    code:room.code, phase:room.phase, round:room.round, rounds:room.rounds,
    isHost:viewer === room.host, myId:viewer, myAnswer:me?.answer || '',
    question:room.question?.q || '', category:'Curious facts', notice:room.notice,
    submitted:!!me?.answer, voted:!!me?.vote,
    players:[...room.players.values()].map(p=>({id:p.id,name:p.name,score:p.score,host:p.id===room.host,online:!!p.socket,submitted:!!p.answer,voted:!!p.vote}))
  };
  if (room.phase === 'voting') {
    state.options = room.options.map(o=>({id:o.id,text:o.text,isOwn:o.playerId===viewer}));
    state.notice = room.votes.size + ' of ' + online(room).length + ' votes in';
  }
  if (room.phase === 'writing') state.notice = room.answers.size + ' of ' + online(room).length + ' answers in';
  if (room.phase === 'reveal' || room.phase === 'finished') {
    state.truth = room.question.a;
    state.results = room.options.map(o=>({id:o.id,text:o.text,isTruth:o.truth,author:o.playerId ? room.players.get(o.playerId)?.name || 'A player' : 'The truth',votesCount:o.voters.length}));
    state.scoring = room.scoring;
    state.winner = room.winner;
  }
  return state;
}
function broadcast(room) {
  for (const p of room.players.values()) if (p.socket && !p.socket.destroyed) send(p.socket,{type:'state',state:view(room,p.id)});
}
function say(room,text) { room.notice = text; }
function enterVote(room) {
  room.options = online(room).filter(p=>p.answer.trim()).map(p=>({id:id(),text:p.answer.trim(),playerId:p.id,truth:false,voters:[]}));
  room.options.push({id:id(),text:room.question.a,playerId:null,truth:true,voters:[]});
  for(let i=room.options.length-1;i>0;i--){const j=crypto.randomInt(i+1);[room.options[i],room.options[j]]=[room.options[j],room.options[i]];}
  room.phase='voting'; say(room,'Pick the real answer. You can’t vote for your own bluff.'); broadcast(room);
}
function reveal(room) {
  const points = new Map([...room.players.keys()].map(pid=>[pid,0]));
  for(const pid of room.votes.keys()) if(room.options.find(o=>o.id===room.votes.get(pid))?.truth) points.set(pid,(points.get(pid)||0)+100);
  for(const option of room.options) if(!option.truth) points.set(option.playerId,(points.get(option.playerId)||0)+50*option.voters.length);
  room.scoring=[...points].filter(([,n])=>n>0).map(([pid,n])=>({id:pid,name:room.players.get(pid)?.name||'Player',points:n})).sort((a,b)=>b.points-a.points);
  for(const [pid,n] of points) room.players.get(pid).score+=n;
  room.phase='reveal'; say(room,'The truth is out. See who fooled whom.');
  if(room.round>=room.rounds) {
    const high=Math.max(...[...room.players.values()].map(p=>p.score));
    room.winner=[...room.players.values()].filter(p=>p.score===high).map(p=>({id:p.id,name:p.name,score:p.score}));
  }
  broadcast(room);
}
function startRound(room) {
  const available=questions.filter((_,i)=>!room.used.has(i));
  if(!available.length) room.used.clear();
  let candidates=questions.map((q,i)=>({q,i})).filter(x=>!room.used.has(x.i)); if(!candidates.length){room.used.clear();candidates=questions.map((q,i)=>({q,i}));} const index=candidates[crypto.randomInt(candidates.length)].i;
  room.question=questions[index]; room.used.add(index); room.round++;
  room.phase='writing'; room.answers.clear(); room.votes.clear(); room.options=[]; room.scoring=[];
  for(const p of room.players.values()){p.answer='';p.vote='';}
  say(room,'Write a believable fake answer. The best bluff earns points.'); broadcast(room);
}
function handleAction(client,msg) {
  const room=rooms.get(client.room); const player=room?.players.get(client.player);
  if(!player) return;
  if(msg.action==='start' && player.id===room.host && room.phase==='lobby' && online(room).length>=2) {
    room.rounds=Math.max(3,Math.min(7,Number(msg.rounds)||5)); room.round=0;room.used.clear();startRound(room); return;
  }
  if(msg.action==='answer' && room.phase==='writing' && !player.answer) {
    const answer=String(msg.answer||'').trim().slice(0,72); if(answer.length<2)return;
    player.answer=answer;room.answers.set(player.id,answer);
    const ps=online(room); if(ps.length>=2&&ps.every(p=>p.answer))enterVote(room);else broadcast(room);return;
  }
  if(msg.action==='vote' && room.phase==='voting' && !player.vote) {
    const option=room.options.find(o=>o.id===msg.optionId);if(!option||option.playerId===player.id)return;
    player.vote=option.id;room.votes.set(player.id,option.id);option.voters.push(player.id);
    const ps=online(room);if(ps.length>=2&&ps.every(p=>p.vote))reveal(room);else broadcast(room);return;
  }
  if(msg.action==='next' && player.id===room.host && room.phase==='reveal') {
    if(room.round>=room.rounds){room.phase='finished';broadcast(room);}else startRound(room);return;
  }
  if(msg.action==='again' && player.id===room.host && room.phase==='finished') {
    room.round=0;room.phase='lobby';room.winner=null;room.used.clear();
    for(const p of room.players.values()){p.score=0;p.answer='';p.vote='';}say(room,'Fresh game. Ready when you are.');broadcast(room);
  }
}
const server=http.createServer((req,res)=>{
  const pathname=new URL(req.url,'http://localhost').pathname;
  if(pathname==='/health'){res.writeHead(200,{'content-type':'text/plain'});return res.end('ok');}
  const requested=pathname==='/'?'index.html':pathname.slice(1);
  const file=path.resolve(publicDir,requested);
  if(!file.startsWith(publicDir+path.sep)&&file!==path.join(publicDir,'index.html')){res.writeHead(403);return res.end('Forbidden');}
  fs.readFile(file,(err,data)=>{
    if(err){res.writeHead(404);return res.end('Not found');}
    const type=file.endsWith('.css')?'text/css; charset=utf-8':file.endsWith('.js')?'text/javascript; charset=utf-8':'text/html; charset=utf-8';
    res.writeHead(200,{'content-type':type,'cache-control':'no-store'});res.end(data);
  });
});
server.on('upgrade',(req,socket)=>{
  const key=req.headers['sec-websocket-key'];
  if(!key||req.headers.upgrade?.toLowerCase()!=='websocket'){socket.destroy();return;}
  const accept=crypto.createHash('sha1').update(key+'258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
  socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: '+accept+'\r\n\r\n');
  const client={socket,room:null,player:null,buffer:Buffer.alloc(0)};
  socket.on('data',chunk=>{
    client.buffer=Buffer.concat([client.buffer,chunk]);
    while(client.buffer.length>=2){
      const opcode=client.buffer[0]&15,masked=client.buffer[1]&128;let len=client.buffer[1]&127,offset=2;
      if(len===126){if(client.buffer.length<4)return;len=client.buffer.readUInt16BE(2);offset=4;}
      else if(len===127){if(client.buffer.length<10)return;const big=client.buffer.readBigUInt64BE(2);if(big>1000000n){socket.destroy();return;}len=Number(big);offset=10;}
      const maskAt=offset;if(masked)offset+=4;if(client.buffer.length<offset+len)return;
      let body=client.buffer.subarray(offset,offset+len);
      if(masked){const mask=client.buffer.subarray(maskAt,maskAt+4);body=Buffer.from(body);for(let i=0;i<body.length;i++)body[i]^=mask[i%4];}
      client.buffer=client.buffer.subarray(offset+len);
      if(opcode===8){socket.end();return;}if(opcode===9){frame(socket,10,body);continue;}if(opcode!==1)continue;
      try {
        const msg=JSON.parse(body.toString());
        if(msg.type==='create'||msg.type==='join'){
          const name=String(msg.name||'').trim().slice(0,18);if(!name){send(socket,{type:'error',message:'Add a name first.'});continue;}
          if(msg.type==='create'){
            const room={code:code(),host:null,phase:'lobby',round:0,rounds:5,players:new Map(),used:new Set(),question:null,answers:new Map(),votes:new Map(),options:[],scoring:[],winner:null,notice:''};
            const player={id:id(),name,score:0,socket,answer:'',vote:''};room.host=player.id;room.players.set(player.id,player);rooms.set(room.code,room);client.room=room.code;client.player=player.id;
          } else {
            const room=rooms.get(String(msg.code||'').trim().toUpperCase());
            if(!room){send(socket,{type:'error',message:'Room code not found. Check it and try again.'});continue;}
            let player=msg.player&&room.players.get(msg.player);
            if(!player){
              if(room.players.size>=8){send(socket,{type:'error',message:'This room is full (8 players max).'});continue;}
              if(room.phase!=='lobby'){send(socket,{type:'error',message:'This game has started. Ask the host to create a new room.'});continue;}
              player={id:id(),name,score:0,socket,answer:'',vote:''};room.players.set(player.id,player);
            } else {if(player.socket&&player.socket!==socket)player.socket.end();player.name=name;player.socket=socket;}
            client.room=room.code;client.player=player.id;
          }
          send(socket,{type:'joined',code:client.room,player:client.player});broadcast(rooms.get(client.room));continue;
        }
        if(msg.type==='action')handleAction(client,msg);
      }catch{send(socket,{type:'error',message:'Could not read that message.'});}
    }
  });
  socket.on('close',()=>{const room=rooms.get(client.room),p=room?.players.get(client.player);if(p?.socket===socket){p.socket=null;if(room){if(room.host===p.id){const successor=online(room)[0];if(successor)room.host=successor.id;}broadcast(room);}}});
  socket.on('error',()=>{});
});
server.listen(port,'0.0.0.0',()=>console.log('Bluff Mates is ready on port '+port));

