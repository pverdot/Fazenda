import * as XLSX from 'xlsx';
import './styles.css';
import { lerChaveDaUrl, conectar, carregar, adaptador } from './db.js';

lerChaveDaUrl();
(() => {
const $ = s => document.querySelector(s);
const UNID = 1000;
const fmtN = v => Math.round(v).toLocaleString('pt-BR');
const brl = (v, d=0) => (v<0?'−':'') + 'R$ ' + Math.abs(v).toLocaleString('pt-BR',{minimumFractionDigits:d,maximumFractionDigits:d});
const sbrl = v => (v>0?'+':'') + brl(v);
const mi = v => { const a=Math.abs(v); const s=v<0?'−':''; return a>=1e6? s+'R$ '+(a/1e6).toLocaleString('pt-BR',{maximumFractionDigits:2})+' mi' : a>=1e3? s+'R$ '+(a/1e3).toLocaleString('pt-BR',{maximumFractionDigits:0})+' mil' : s+'R$ '+fmtN(a); };
const pct = (v,d=1) => (v*100).toLocaleString('pt-BR',{minimumFractionDigits:d,maximumFractionDigits:d})+'%';
const spct = v => (v>0?'+':'')+pct(v);
const cls = v => v>0?'gain':v<0?'loss':'muted';
const MESES = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
const dBR = iso => { const [y,m,d]=iso.split('-'); return d+'/'+m+'/'+y; };
const esc = s => String(s).replace(/[&<>"]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

const LEG = {
  'CDB-DI': {titulo:'Lavradores do CDI', papel:'Aram o campo do juro todo dia útil, sem reclamar.', cor:'gold'},
  'RAIZ4':  {titulo:'Cortadores de Cana', papel:'Raízen. A legião que entrou no canavial e voltou menor.', cor:'cane'},
  'CSAN3':  {titulo:'Tropeiros da Cosan', papel:'Cosan. Carregam a holding nas costas.', cor:'glaze'},
};
const FALLBACK = ['lapis','rose','gold','glaze','cane'];

let censos = [], serie = null, modo = 'reais', canEdit = true;

/* ---------- modelo ---------- */
function legioes(c){
  const L = []; const acoes = new Set((c.ativos||[]).map(a=>a.nome)); let k=0;
  for (const p of (c.produtos||[])) {
    if (acoes.has(p.nome)) continue;
    const m = LEG[p.nome] || {titulo:'Lavradores de '+p.nome, papel:'Renda fixa trabalhando no juro.', cor:FALLBACK[k++%FALLBACK.length]};
    L.push({id:p.nome, tipo:'rf', ...m, valor:p.saldo||0, custo:p.saldo||0, rendMes:p.rendMes, rendMesAnt:p.rendMesAnt});
  }
  for (const a of (c.ativos||[])) {
    const p = (c.produtos||[]).find(x=>x.nome===a.nome) || {};
    const m = LEG[a.nome] || {titulo:'Legião '+a.nome, papel:'Ação em carteira.', cor:FALLBACK[k++%FALLBACK.length]};
    L.push({id:a.nome, tipo:'acao', ...m, valor:a.valor, custo:a.custo ?? a.qtd*a.pm, qtd:a.qtd, preco:a.preco, pm:a.pm,
      varHoje:a.varHoje, rent:a.rent, rentProv:a.rentProv, rendProv:a.rendProv, rendMes:p.rendMes, rendMesAnt:p.rendMesAnt, rend12m:p.rend12m, rendAno:p.rendAno});
  }
  return L;
}
const escravos = v => Math.floor(v/UNID);
function cdiDiario(){
  if (!serie || serie.length<3) return null;
  const c = serie.slice(-21).map(p=>p[3]); const d=[];
  for (let i=1;i<c.length;i++) d.push((1+c[i])/(1+c[i-1])-1);
  return d.reduce((a,b)=>a+b,0)/d.length;
}

/* ---------- render principal ---------- */
function render(){
  const c = censos[censos.length-1];
  if (!c) { $('#censoData').textContent='Nenhum censo registrado'; $('#nEscravos').textContent='0'; renderCenso(); renderOrdens(); return; }
  const prev = censos[censos.length-2];
  const L = legioes(c);
  const total = L.reduce((s,l)=>s+l.valor,0);
  const n = escravos(total);
  $('#censoData').textContent = 'Censo de ' + dBR(c.data);
  $('#nEscravos').textContent = fmtN(n);
  if (prev) {
    const np = escravos(legioes(prev).reduce((s,l)=>s+l.valor,0)); const dn = n-np;
    $('#deltaCenso').innerHTML = `<span class="${cls(dn)}">${dn>0?'+':''}${fmtN(dn)} escravos</span> <span class="muted">desde o censo de ${dBR(prev.data)}</span>`;
  } else $('#deltaCenso').innerHTML = '<span class="muted">Primeiro censo. O próximo mostra quantos nasceram.</span>';
  const custo = L.reduce((s,l)=>s+l.custo,0);
  const fug = escravos(Math.max(0,custo-total));
  const hoje = L.filter(l=>l.tipo==='acao' && l.varHoje!=null).reduce((s,l)=>s+(l.valor - l.valor/(1+l.varHoje)),0);
  const mes = L.reduce((s,l)=>s+(l.rendMes||0),0);
  $('#chips').innerHTML = [
    `<span class="chip">Patrimônio ${brl(total)}</span>`,
    `<span class="chip ${hoje>=0?'g':'l'}">Hoje ${sbrl(hoje)}</span>`,
    `<span class="chip ${mes>=0?'g':'l'}">${esc(c.mesRef||'Mês')} ${sbrl(mes)}</span>`,
    fug>0?`<span class="chip l">${fmtN(fug)} fugiram</span>`:''
  ].join('');

  // legiões
  $('#legioes').innerHTML = L.map(l=>{
    const vivos = escravos(l.valor), recr = escravos(l.custo), baixas = Math.max(0,recr-vivos);
    const dV = Math.round(vivos/10), dR = Math.max(dV, Math.round(recr/10));
    let dots=''; for(let i=0;i<dR;i++) dots += i<dV?`<b style="background:var(--${l.cor})"></b>`:'<b class="dead"></b>';
    let facts='';
    if (l.tipo==='rf') {
      const cd = cdiDiario();
      facts = `<dt>Recrutados</dt><dd>${fmtN(recr)}</dd>
        <dt>Baixas</dt><dd>0</dd>
        ${cd!=null?`<dt>Salário por dia útil</dt><dd class="gain">${sbrl(l.valor*cd)}</dd>
        <dt>Filhos por mês (21 d.u.)</dt><dd class="gain">+${(l.valor*(Math.pow(1+cd,21)-1)/UNID).toLocaleString('pt-BR',{maximumFractionDigits:1})} escravos</dd>`:''}
        ${l.rendMes?`<dt>Produção em ${esc(c.mesRef)}</dt><dd class="${cls(l.rendMes)}">${sbrl(l.rendMes)}</dd>`:''}`;
    } else {
      const hj = l.varHoje!=null ? l.valor - l.valor/(1+l.varHoje) : null;
      facts = `<dt>Recrutados (preço médio)</dt><dd>${fmtN(recr)}</dd>
        <dt>Baixas</dt><dd class="${baixas?'loss':''}">${baixas?'−'+fmtN(baixas):'0'}</dd>
        <dt>Preço agora</dt><dd>${brl(l.preco,2)}</dd><dt>Preço médio</dt><dd>${brl(l.pm,2)}</dd>
        <dt>Para voltar ao médio</dt><dd>${l.preco<l.pm?spct(l.pm/l.preco-1):'já acima'}</dd>
        ${l.rendMes!=null?`<dt>${esc(c.mesRef)}</dt><dd class="${cls(l.rendMes)}">${sbrl(l.rendMes)}</dd><dt>${esc(c.mesAntRef||'Mês anterior')}</dt><dd class="${cls(l.rendMesAnt||0)}">${sbrl(l.rendMesAnt||0)}</dd>`:''}
        ${hj!=null?`<dt>Hoje</dt><dd class="${cls(hj)}">${sbrl(hj)} (${spct(l.varHoje)})</dd>`:''}`;
    }
    return `<article class="legion">
      <header><h3>${esc(l.titulo)}</h3><span class="tag">${esc(l.id)} · ${pct(l.valor/total,0)}</span></header>
      <div><div class="n" style="color:var(--${l.cor})">${fmtN(vivos)}</div><div class="role">${esc(l.papel)}</div></div>
      <div class="dots" aria-label="${vivos} em serviço de ${recr} recrutados">${dots}</div>
      <dl class="facts">${facts}</dl></article>`;
  }).join('');

  // KPIs
  const cd = cdiDiario();
  const rf = L.filter(l=>l.tipo==='rf').reduce((s,l)=>s+l.valor,0);
  const ac = L.filter(l=>l.tipo==='acao');
  const acMes = ac.reduce((s,l)=>s+(l.rendMes||0),0), acAnt = ac.reduce((s,l)=>s+(l.rendMesAnt||0),0);
  let fundo=null; if (serie) { fundo = serie.reduce((m,p)=>p[1]<m[1]?p:m, serie[0]); }
  const ult = serie ? serie[serie.length-1] : null;
  $('#kpis').innerHTML = [
    cd!=null && rf ? kpi('Salário diário da renda fixa', `<span class="gain">${sbrl(rf*cd)}</span>`, `CDI recente ${pct(Math.pow(1+cd,252)-1)} a.a. sobre ${mi(rf)}`):'',
    cd!=null && rf ? kpi('Filhos do ouro por ano', `<span class="gain">+${fmtN(rf*(Math.pow(1+cd,252)-1)/UNID)}</span>`, 'escravos novos só de juros, sem aportar nada'):'',
    ac.length ? kpi(`Ações em ${c.mesRef||'mês'} + ${c.mesAntRef||'anterior'}`, `<span class="${cls(acMes+acAnt)}">${sbrl(acMes+acAnt)}</span>`, `${fmtN((acMes+acAnt)/UNID)} escravos resgatados do canavial em dois meses`):'',
    fundo && ult ? kpi('Desde o fundo do poço', `<span class="${cls(ult[1]-fundo[1])}">${sbrl(ult[1]-fundo[1])}</span>`, `fundo em ${dBR(fundo[0])}: ${mi(fundo[1])} acumulado`):''
  ].join('');

  // leis
    const pior = ac.length ? [...ac].sort((a,b)=>(a.valor/a.custo)-(b.valor/b.custo))[0] : null;
  const leis = [
    {q:'O ouro trabalha com diligência para o dono sábio que lhe encontra emprego lucrativo.',
     s: rf>0?'ok':'na', v: rf>0? `${pct(rf/total,0)} do exército rende CDI todo dia`:'nenhum ouro no juro'},
    {q:'O ouro se apega ao dono cauteloso que o protege da perda.',
     s: pior && pior.valor/pior.custo < .8 ? 'bad':'ok',
     v: pior? `${pior.id} ${spct(pior.valor/pior.custo-1)} no médio · ainda pesa ${pct(pior.valor/total,0)} do exército`:'sem ações em carteira'},
    {q:'Uma parte de tudo o que ganhas é tua para guardar.',
     s:'na', v:'o censo não mostra aportes; julgamento suspenso'}
  ];
  $('#leis').innerHTML = leis.map(l=>`<div class="law"><div class="seal ${l.s}">${l.s==='ok'?'✓':l.s==='bad'?'✗':'?'}</div><q>${l.q}</q><div class="verdict ${l.s==='ok'?'gain':l.s==='bad'?'loss':'muted'}">${esc(l.v)}</div></div>`).join('');

  // profecia
  const prof = [];
  if (cd!=null && rf) {
    const a = Math.pow(1+cd,252);
    prof.push(kpi('Renda fixa em 12 meses', fmtN(rf*a/UNID), `escravos (hoje ${fmtN(rf/UNID)}) · ${mi(rf*a)}`));
    prof.push(kpi('Renda fixa em 36 meses', fmtN(rf*a*a*a/UNID), `se o CDI ficar em ${pct(a-1)} a.a. · ${mi(rf*a*a*a)}`));
  }
  for (const l of ac) prof.push(kpi(`${l.id} volta ao médio em`, brl(l.pm,2), `${l.preco<l.pm? spct(l.pm/l.preco-1)+' de alta':'já acima'} · recupera ${fmtN(escravos(Math.max(0,l.custo-l.valor)))} fugitivos`));
  $('#profecia').innerHTML = prof.join('');

  cena.set(L, total, custo);
  renderCronica(); renderColheita(); renderCenso(); renderOrdens();
}
const kpi = (t,v,s) => `<div class="kpi"><div class="eyebrow">${t}</div><div class="v">${v}</div><div class="s">${s}</div></div>`;

/* ---------- SVG helpers ---------- */
function ticks(min,max,n=5){
  const span = max-min || 1; const step0 = span/n; const p = Math.pow(10,Math.floor(Math.log10(step0)));
  const step = [1,2,2.5,5,10].map(m=>m*p).find(s=>span/s<=n) || p*10;
  const out=[]; for(let v=Math.ceil(min/step)*step; v<=max+1e-9; v+=step) out.push(+v.toFixed(10)); return out;
}
const tsOf = iso => Date.UTC(+iso.slice(0,4), +iso.slice(5,7)-1, +iso.slice(8,10));

function renderCronica(){
  const box = $('#cronica');
  if (!serie || serie.length<2) { box.innerHTML='<div class="empty">A crônica aparece quando o relatório de rentabilidade acumulada for enviado.</div>'; return; }
  const W = Math.max(300, box.clientWidth-16), H = W<500?240:300, ml=W<500?54:72, mr=14, mt=16, mb=26;
  const xs = serie.map(p=>tsOf(p[0])); const x0=xs[0], x1=xs[xs.length-1];
  const X = t => ml + (t-x0)/(x1-x0)*(W-ml-mr);
  let lines, yMin, yMax, fmtY;
  if (modo==='reais') {
    const v = serie.map(p=>p[1]); yMin=Math.min(0,...v); yMax=Math.max(0,...v); fmtY=mi;
    lines=[{v, cor:'var(--gold)', nome:'Rendimento'}];
  } else {
    const a = serie.map(p=>p[2]), b = serie.map(p=>p[3]); yMin=Math.min(0,...a,...b); yMax=Math.max(0,...a,...b); fmtY=v=>pct(v,0);
    lines=[{v:a, cor:'var(--gold)', nome:'Carteira'},{v:b, cor:'var(--glaze)', nome:'CDI'}];
  }
  const pad=(yMax-yMin)*.08; yMin-=pad; yMax+=pad;
  const Y = v => mt + (yMax-v)/(yMax-yMin)*(H-mt-mb);
  const tk = ticks(yMin,yMax,5);
  let s = `<svg viewBox="0 0 ${W} ${H}" height="${H}" role="img" aria-label="Crônica do rendimento acumulado">`;
  s += `<defs><clipPath id="cpUp"><rect x="0" y="0" width="${W}" height="${Y(0)}"/></clipPath><clipPath id="cpDn"><rect x="0" y="${Y(0)}" width="${W}" height="${H}"/></clipPath></defs>`;
  for (const t of tk) s += `<line x1="${ml}" x2="${W-mr}" y1="${Y(t)}" y2="${Y(t)}" stroke="var(--line)" stroke-width="${t===0?1.4:.6}"/><text x="${ml-6}" y="${Y(t)+4}" text-anchor="end">${fmtY(t)}</text>`;
  const y0=new Date(x0).getUTCFullYear(), y1=new Date(x1).getUTCFullYear();
  for (let y=y0+1;y<=y1;y++){ const xx=X(Date.UTC(y,0,1)); s+=`<line x1="${xx}" x2="${xx}" y1="${mt}" y2="${H-mb}" stroke="var(--line)" stroke-width=".5" stroke-dasharray="2 3"/><text x="${xx}" y="${H-8}" text-anchor="middle">${y}</text>`; }
  lines.forEach((L,li)=>{
    const d = L.v.map((v,i)=>(i?'L':'M')+X(xs[i]).toFixed(1)+','+Y(v).toFixed(1)).join('');
    if (li===0){
      const area = d + `L${X(x1)},${Y(0)}L${X(x0)},${Y(0)}Z`;
      s += `<path d="${area}" fill="var(--gain)" opacity=".16" clip-path="url(#cpUp)"/><path d="${area}" fill="var(--loss)" opacity=".16" clip-path="url(#cpDn)"/>`;
    }
    s += `<path d="${d}" fill="none" stroke="${L.cor}" stroke-width="${li?1.4:2}" ${li?'stroke-dasharray="4 3"':''}/>`;
  });
  // anotações
  const v0 = lines[0].v; let iMax=0,iMin=0; v0.forEach((v,i)=>{ if(v>v0[iMax]) iMax=i; if(v<v0[iMin]) iMin=i; });
  const ann = (i,txt,below) => { const ax=X(xs[i]), ay=Y(v0[i]); const anchor = ax>W*.75?'end':ax<W*.25?'start':'middle';
    return `<circle cx="${ax}" cy="${ay}" r="4" fill="var(--bg)" stroke="var(--ink)" stroke-width="1.5"/><text class="ann" x="${ax}" y="${below?ay+18:ay-9}" text-anchor="${anchor}">${txt}</text>`; };
  s += ann(iMax, `pico ${fmtY(v0[iMax])} · ${MESES[+serie[iMax][0].slice(5,7)-1]}/${serie[iMax][0].slice(2,4)}`, false);
  if (iMin!==iMax) s += ann(iMin, `fundo ${fmtY(v0[iMin])}`, true);
  const li=v0.length-1; s += `<circle cx="${X(xs[li])}" cy="${Y(v0[li])}" r="5" fill="var(--gold)"/>`;
  if (modo==='pct') s += `<text class="ann" x="${W-mr}" y="${Y(lines[1].v[li])-8}" text-anchor="end">CDI ${pct(lines[1].v[li],0)}</text><text class="ann" x="${W-mr}" y="${Y(v0[li])+18}" text-anchor="end">carteira ${pct(v0[li],0)}</text>`;
  else s += `<text class="ann" x="${W-mr}" y="${Y(v0[li])-10}" text-anchor="end">hoje ${fmtY(v0[li])}</text>`;
  s += `<line id="hx" x1="0" x2="0" y1="${mt}" y2="${H-mb}" stroke="var(--ink)" stroke-width=".6" opacity="0"/>`;
  s += `<rect x="${ml}" y="${mt}" width="${W-ml-mr}" height="${H-mt-mb}" fill="transparent" id="hov"/></svg><div class="tip" hidden></div>`;
  box.innerHTML = s;
  $('#cronicaNota').textContent = `${dBR(serie[0][0])} a ${dBR(serie[li][0])} · ${serie.length} dias úteis.`;
  const tip = box.querySelector('.tip'), hx = box.querySelector('#hx'), svg = box.querySelector('svg');
  box.querySelector('#hov').addEventListener('pointermove', e=>{
    const r = svg.getBoundingClientRect(); const px = (e.clientX-r.left)*W/r.width;
    const t = x0 + (px-ml)/(W-ml-mr)*(x1-x0); let lo=0,hi=xs.length-1; while(hi-lo>1){const m=(lo+hi)>>1; if(xs[m]<t) lo=m; else hi=m;}
    const i = Math.abs(xs[lo]-t)<Math.abs(xs[hi]-t)?lo:hi; const p=serie[i];
    hx.setAttribute('x1',X(xs[i])); hx.setAttribute('x2',X(xs[i])); hx.setAttribute('opacity','.5');
    tip.hidden=false; tip.style.left = (X(xs[i])*r.width/W + 8)+'px'; tip.style.top = (Y(lines[0].v[i])*r.height/H + 12)+'px';
    tip.textContent = modo==='reais' ? `${dBR(p[0])} · ${brl(p[1])}` : `${dBR(p[0])} · carteira ${pct(p[2])} · CDI ${pct(p[3])}`;
  });
  box.querySelector('#hov').addEventListener('pointerleave', ()=>{ tip.hidden=true; hx.setAttribute('opacity','0'); });
}

function renderColheita(){
  const box = $('#colheita');
  if (!serie || serie.length<2) { box.innerHTML='<div class="empty">Sem crônica, sem colheita.</div>'; return; }
  const meses=[]; let last=0, cur=null;
  for (const p of serie){ const m=p[0].slice(0,7); if (m!==cur){ if(cur) meses.push({m:cur, v:lastV-last}), last=lastV; cur=m; } var lastV=p[1]; }
  meses.push({m:cur, v:serie[serie.length-1][1]-last});
  const W = Math.max(300, box.clientWidth-16), H=W<500?200:240, ml=W<500?54:72, mr=10, mt=14, mb=26;
  const vs=meses.map(m=>m.v); let yMin=Math.min(0,...vs), yMax=Math.max(0,...vs);
  const Y=v=>mt+(yMax-v)/(yMax-yMin)*(H-mt-mb); const bw=(W-ml-mr)/meses.length;
  let s=`<svg viewBox="0 0 ${W} ${H}" height="${H}" role="img" aria-label="Rendimento por mês">`;
  for (const t of ticks(yMin,yMax,4)) s+=`<line x1="${ml}" x2="${W-mr}" y1="${Y(t)}" y2="${Y(t)}" stroke="var(--line)" stroke-width="${t===0?1.2:.5}"/><text x="${ml-6}" y="${Y(t)+4}" text-anchor="end">${mi(t)}</text>`;
  meses.forEach((m,i)=>{ const x=ml+i*bw+bw*.15, w=Math.max(1.5,bw*.7), y=Y(Math.max(0,m.v)), h=Math.max(1,Math.abs(Y(m.v)-Y(0)));
    const [yy,mm]=m.m.split('-'); const last=i===meses.length-1;
    s+=`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="1" fill="var(--${m.v>=0?'gain':'loss'})" opacity="${last?1:.78}"><title>${MESES[+mm-1]}/${yy}: ${sbrl(m.v)} (${m.v>=0?'+':''}${fmtN(m.v/UNID)} escravos)</title></rect>`;
    if (mm==='01') s+=`<text x="${x+w/2}" y="${H-8}" text-anchor="middle">${yy}</text>`; });
  const L=meses[meses.length-1]; const lx=ml+(meses.length-1)*bw+bw/2;
  s+=`<text class="ann" x="${lx}" y="${Y(Math.max(0,L.v))-6}" text-anchor="end">${MESES[+L.m.slice(5)-1]} ${sbrl(L.v)}</text></svg>`;
  box.innerHTML=s;
}

function renderCenso(){
  const box=$('#censoChart'), tb=$('#censoTbl tbody');
  if (!censos.length){ box.innerHTML='<div class="empty">Nenhum censo ainda. Envie os relatórios na seção VIII.</div>'; tb.innerHTML=''; return; }
  const dados = censos.map(c=>({c, L:legioes(c)}));
  const ids=[...new Set(dados.flatMap(d=>d.L.map(l=>l.id)))];
  const corDe=id=>{ for(const d of dados){ const l=d.L.find(x=>x.id===id); if(l) return l.cor; } return 'gold'; };
  const W=Math.max(280,box.clientWidth-16), H=260, ml=46, mt=14, mb=40, mr=8;
  const tot=dados.map(d=>escravos(d.L.reduce((s,l)=>s+l.valor,0)));
  const yMax=Math.max(...tot)*1.12||1; const Y=v=>mt+(1-v/yMax)*(H-mt-mb);
  const show=dados.slice(-12); const off=dados.length-show.length; const slot=(W-ml-mr)/Math.max(show.length,4); const bw=Math.min(56,slot*.62);
  let s=`<svg viewBox="0 0 ${W} ${H}" height="${H}" role="img" aria-label="Escravos por censo">`;
  for(const t of ticks(0,yMax,4)) s+=`<line x1="${ml}" x2="${W-mr}" y1="${Y(t)}" y2="${Y(t)}" stroke="var(--line)" stroke-width=".5"/><text x="${ml-6}" y="${Y(t)+4}" text-anchor="end">${fmtN(t)}</text>`;
  show.forEach((d,i)=>{ const x=ml+i*slot+(slot-bw)/2; let acc=0;
    for(const id of ids){ const l=d.L.find(z=>z.id===id); if(!l) continue; const n=escravos(l.valor);
      s+=`<rect x="${x}" y="${Y(acc+n)}" width="${bw}" height="${Math.max(0,Y(acc)-Y(acc+n)-1)}" fill="var(--${corDe(id)})"><title>${id}: ${fmtN(n)}</title></rect>`; acc+=n; }
    s+=`<text class="ann" x="${x+bw/2}" y="${Y(tot[i+off])-6}" text-anchor="middle">${fmtN(tot[i+off])}</text><text x="${x+bw/2}" y="${H-22}" text-anchor="middle">${d.c.data.slice(8,10)}/${d.c.data.slice(5,7)}</text><text x="${x+bw/2}" y="${H-8}" text-anchor="middle">${d.c.data.slice(0,4)}</text>`; });
  if (show.length===1) s+=`<text x="${ml+slot*1.5}" y="${Y(tot[0])+10}" class="ann" opacity=".7">← o próximo censo entra aqui</text>`;
  s+='</svg>'; box.innerHTML=s;
  tb.innerHTML = [...dados].reverse().map((d,ri)=>{ const i=dados.length-1-ri; const dn=i?tot[i]-tot[i-1]:null; const pat=d.L.reduce((s,l)=>s+l.valor,0);
    return `<tr><td>${dBR(d.c.data)}</td><td class="mono">${fmtN(tot[i])}</td><td class="mono ${dn==null?'muted':cls(dn)}">${dn==null?'—':(dn>0?'+':'')+fmtN(dn)}</td><td class="mono">${brl(pat)}</td><td>${canEdit?`<button class="del" type="button" data-id="${esc(d.c.data)}">remover</button>`:''}</td></tr>`; }).join('');
}

/* ---------- cena animada ---------- */
const cena = (() => {
  const cv=$('#cena'), ctx=cv.getContext('2d'); const reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;
  let W=0,H=0,dpr=1,T={}, workers=[], ghosts=[], frac=0, fracAlvo=0, info=null, raf=0, lay={}, t0=performance.now();
  const POR=20;
  function tokens(){ const s=getComputedStyle(document.documentElement); for(const k of ['gold','gold-hi','gold-lo','ink','muted','ghost','cane','glaze','lapis','rose','line','surface-2','bg']) T[k]=s.getPropertyValue('--'+k).trim(); }
  function layout(){ const r=cv.getBoundingClientRect(); dpr=Math.min(2,window.devicePixelRatio||1); W=r.width; H=r.height; cv.width=W*dpr; cv.height=H*dpr; ctx.setTransform(dpr,0,0,dpr,0,0);
    const g=H-34, caneW=Math.max(72,W*.2), zb=Math.min(W*.46,440), zc=W-zb/2-Math.max(18,W*.04), th=Math.min(30,(g-44)/7);
    lay={g,cane0:12,cane1:12+caneW,quarry:12+caneW+26,zc,zb,th,zl:zc-zb/2-8};
    seed(); }
  function seed(){ if(!info) return; workers=[]; ghosts=[];
    for(const l of info.L){ const n=Math.max(1,Math.round(escravos(l.valor)/POR)); for(let i=0;i<n;i++) workers.push({cor:l.cor, x:lay.quarry+Math.random()*(lay.zl-lay.quarry), dir:Math.random()<.5?1:-1, v:.35+Math.random()*.45, ph:Math.random()*6, lane:Math.random()}); }
    const nf=Math.min(80,Math.round(info.fug/POR)); for(let i=0;i<nf;i++) ghosts.push({x:lay.cane0+8+Math.random()*(lay.cane1-lay.cane0-16), lane:Math.random(), ph:Math.random()*6}); }
  function set(L,total,custo){ info={L,total,custo,fug:escravos(Math.max(0,custo-total))}; fracAlvo=custo>0?Math.min(1,total/custo):1;
    $('#legendaCena').innerHTML = L.map(l=>`<span><i style="background:var(--${l.cor})"></i>${esc(l.titulo)} · ${fmtN(escravos(l.valor))}</span>`).join('') +
      (info.fug?`<span><i style="background:var(--ghost)"></i>Fugitivos no canavial · ${fmtN(info.fug)}</span>`:'') + `<span>Cada figura = ${POR} escravos. Zigurate completo = ${mi(custo)}, todo o ouro já recrutado.</span>`;
    tokens(); layout(); if(reduce) frac=fracAlvo; if(!raf) raf=requestAnimationFrame(loop); }
  function pessoa(x,y,cor,ph,carrega,dir,alpha=1){ const s=1.5, perna=Math.sin(ph)*3*s; ctx.globalAlpha=alpha;
    ctx.strokeStyle=cor; ctx.lineWidth=1.6; ctx.beginPath(); ctx.moveTo(x,y-6*s); ctx.lineTo(x-perna*.5,y); ctx.moveTo(x,y-6*s); ctx.lineTo(x+perna*.5,y); ctx.stroke();
    ctx.fillStyle=cor; ctx.fillRect(x-2.5*s,y-12*s,5*s,6.5*s); ctx.beginPath(); ctx.arc(x,y-14.5*s,2.4*s,0,7); ctx.fill();
    if(carrega){ ctx.fillStyle=T['gold-hi']; ctx.fillRect(x-4*s,y-19.5*s,8*s,3*s); ctx.strokeStyle=T['gold-lo']; ctx.lineWidth=.8; ctx.strokeRect(x-4*s,y-19.5*s,8*s,3*s); }
    ctx.globalAlpha=1; }
  function zigurate(){ const {g,zc,zb,th}=lay; const ws=[...Array(7)].map((_,i)=>zb*(1-i*.12)); const tot=ws.reduce((a,b)=>a+b,0); let rest=frac*tot;
    ctx.font='11px "IBM Plex Mono", monospace';
    ws.forEach((w,i)=>{ const y=g-(i+1)*th, x=zc-w/2; const f=Math.max(0,Math.min(1,rest/w)); rest-=w;
      ctx.setLineDash([3,3]); ctx.strokeStyle=T.muted; ctx.globalAlpha=.55; ctx.lineWidth=1; ctx.strokeRect(x+.5,y+.5,w-1,th-1); ctx.setLineDash([]); ctx.globalAlpha=1;
      if(f>0){ const fw=w*f; ctx.fillStyle=T.gold; ctx.fillRect(x,y,fw,th);
        ctx.strokeStyle=T['gold-lo']; ctx.lineWidth=.7; const bh=th/2;
        for(let r=0;r<2;r++){ const yy=y+r*bh; ctx.beginPath(); ctx.moveTo(x,yy); ctx.lineTo(x+fw,yy); ctx.stroke(); for(let bx=x+(r?8:0);bx<x+fw;bx+=16){ ctx.beginPath(); ctx.moveTo(bx,yy); ctx.lineTo(bx,yy+bh); ctx.stroke(); } }
        if(f<1){ const tw=(Math.sin(performance.now()/180)+1)/2; ctx.fillStyle=T['gold-hi']; ctx.globalAlpha=.4+.6*tw; ctx.beginPath(); ctx.arc(x+fw,y+th/2,3+2*tw,0,7); ctx.fill(); ctx.globalAlpha=1; } } });
    // rampa
    ctx.fillStyle=T['surface-2']; ctx.globalAlpha=.55; ctx.beginPath(); ctx.moveTo(zc-12,g); ctx.lineTo(zc+12,g); ctx.lineTo(zc+5,g-th*3); ctx.lineTo(zc-5,g-th*3); ctx.closePath(); ctx.fill(); ctx.globalAlpha=1;
    ctx.fillStyle=T.ink; ctx.textAlign='center'; ctx.fillText(`ZIGURATE ${Math.round(frac*100)}% CONSTRUÍDO`, zc, g-7*th-10); }
  function canavial(t){ const {g,cane0,cane1}=lay;
    ghosts.forEach(p=>{ const y=g-2-p.lane*14; pessoa(p.x+Math.sin(t/900+p.ph)*2, y, T.ghost, Math.sin(t/500+p.ph), false, 1, .55); });
    ctx.strokeStyle=T.cane; ctx.lineWidth=1.6;
    for(let x=cane0;x<cane1;x+=5){ const h=34+((x*37)%17), sw=Math.sin(t/700+x*.3)*3; ctx.globalAlpha=.85; ctx.beginPath(); ctx.moveTo(x,g); ctx.quadraticCurveTo(x+sw*.5,g-h*.6,x+sw,g-h); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x+sw*.6,g-h*.7); ctx.lineTo(x+sw*.6+5,g-h*.78); ctx.stroke(); }
    ctx.globalAlpha=1; ctx.fillStyle=T.muted; ctx.font='11px "IBM Plex Mono", monospace'; ctx.textAlign='left'; ctx.fillText('CANAVIAL', cane0, g+20); }
  function loop(t){ raf=0; if(!info||!W) return;
    if(frac<fracAlvo) frac=Math.min(fracAlvo, frac+(fracAlvo-0)/90); if(frac>fracAlvo) frac=fracAlvo;
    ctx.clearRect(0,0,W,H); const {g,quarry,zl}=lay;
    ctx.strokeStyle=T.line; ctx.lineWidth=1; ctx.beginPath(); ctx.moveTo(0,g+.5); ctx.lineTo(W,g+.5); ctx.stroke();
    canavial(t);
    // pedreira de ouro
    ctx.fillStyle=T['gold-lo']; for(let i=0;i<6;i++) ctx.fillRect(quarry-18+(i%3)*9-(i>2?-4:0), g-6-(i>2?6:0), 8, 5);
    ctx.fillStyle=T.muted; ctx.font='11px "IBM Plex Mono", monospace'; ctx.textAlign='left'; if(W>520) ctx.fillText('MINA DE OURO', quarry-20, g+20);
    zigurate();
    const corC=k=>T[k]||T.gold;
    workers.forEach(w=>{ if(!reduce){ w.x+=w.v*w.dir; w.ph+=w.v*.22; if(w.x>zl){w.x=zl;w.dir=-1;} if(w.x<quarry){w.x=quarry;w.dir=1;} }
      pessoa(w.x, g-2-w.lane*14, corC(w.cor), w.ph, w.dir>0, w.dir); });
    if(!reduce) raf=requestAnimationFrame(loop); }
  let rt; addEventListener('resize',()=>{clearTimeout(rt); rt=setTimeout(()=>{ if(info){layout(); if(!raf) raf=requestAnimationFrame(loop);} renderCronica(); renderColheita(); renderCenso(); renderOrdens(); },150);});
  const retheme=()=>{ tokens(); if(!raf&&info) raf=requestAnimationFrame(loop); };
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change',retheme);
  new MutationObserver(retheme).observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});
  document.addEventListener('visibilitychange',()=>{ if(!document.hidden && info && !raf) raf=requestAnimationFrame(loop); });
  return {set};
})();

/* ---------- toggle ---------- */
for (const [id,m] of [['#mReais','reais'],['#mPct','pct']]) $(id).addEventListener('click',()=>{ modo=m; $('#mReais').setAttribute('aria-pressed',m==='reais'); $('#mPct').setAttribute('aria-pressed',m==='pct'); renderCronica(); });

/* ---------- leitura dos xlsx ---------- */
let pendente = {};
const serialISO = v => { if (typeof v==='number') return new Date(Date.UTC(1899,11,30)+Math.round(v)*864e5).toISOString().slice(0,10);
  if (typeof v==='string'){ let m=v.match(/^(\d{2})\/(\d{2})\/(\d{4})/); if(m) return `${m[3]}-${m[2]}-${m[1]}`; m=v.match(/^(\d{4}-\d{2}-\d{2})/); if(m) return m[1]; } return null; };
const numv = v => { if (v==null||v==='') return null; if (typeof v==='number') return v;
  let s = String(v).replace(/[R$\s%]/g,''); if (s.includes(',')) s = s.replace(/\./g,'').replace(',','.'); else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g,'');
  const n = parseFloat(s); return isNaN(n)?null:n; };
function colunas(row){ const k=Object.keys(row); const mes=k.filter(x=>/^Rend\. [A-Za-zÀ-ú]+ \(R\$\)$/.test(x) && !/Ult/.test(x)); const ano=k.find(x=>/^Rend\. \d{4} \(R\$\)$/.test(x));
  const n=x=>x?x.match(/^Rend\. (.+) \(R\$\)$/)[1]:null; return {m0:mes[0], m1:mes[1], ano, nm0:n(mes[0]), nm1:n(mes[1]), r0:mes[0]&&mes[0].replace('Rend.','Rent.').replace('(R$)','(%)'), r1:mes[1]&&mes[1].replace('Rend.','Rent.').replace('(R$)','(%)'), rAno:ano&&ano.replace('Rend.','Rent.').replace('(R$)','(%)')}; }
async function ler(files){
  if (typeof XLSX==='undefined'){ status('Não consegui carregar o leitor de planilhas. Recarregue a página.','loss'); return; }
  for (const f of files){
    try{
      const wb = XLSX.read(await f.arrayBuffer());
      const m = f.name.match(/_(20\d{2})(\d{2})(\d{2})\d{0,6}\.xls/); if (m) pendente.data = `${m[1]}-${m[2]}-${m[3]}`;
      for (const sn of wb.SheetNames){
        const rows = XLSX.utils.sheet_to_json(wb.Sheets[sn],{defval:null,raw:true});
        if (!rows.length) continue; const h=Object.keys(rows[0]);
        if (h.includes('Nome ativo')) pendente.ativos = rows.filter(r=>r['Nome ativo']).map(r=>{ const qtd=numv(r['Quantidade']), pm=numv(r['Preço médio (R$)']);
          return {nome:String(r['Nome ativo']).trim(), qtd, preco:numv(r['Preço agora (R$)']), pm, pmProv:numv(r['Preço médio c/ proventos (R$)']), valor:numv(r['Total investido (R$)']), custo:Math.round(qtd*pm*100)/100,
            varHoje:numv(r['Variação hoje']), rent:numv(r['Rentabilidade']), rentProv:numv(r['Rentabilidade c/ proventos']), rend:numv(r['Rendimento (R$)']), rendProv:numv(r['Rendimento c/ proventos (R$)'])}; });
        else if (h.includes('Dia') && h.includes('Rendimento')) pendente.serie = rows.map(r=>[serialISO(r['Dia']), numv(r['Rendimento']), numv(r['Rentabilidade com GrossUp']), numv(r['Var. CDI'])]).filter(p=>p[0]&&p[1]!=null);
        else if (h.includes('Produto')) { const c=colunas(rows[0]); pendente.mesRef=c.nm0; pendente.mesAntRef=c.nm1;
          pendente.produtos = rows.filter(r=>r['Produto']).map(r=>({nome:String(r['Produto']).trim(), cat:r['Categoria'], rendMes:numv(r[c.m0]), rentMes:numv(r[c.r0]), rendMesAnt:numv(r[c.m1]), rentMesAnt:numv(r[c.r1]),
            rend12m:numv(r['Rend. Ult. 12 m (R$)']), rent12m:numv(r['Rent. Ult. 12 m (%)']), rendAno:numv(r[c.ano]), rentAno:numv(r[c.rAno]), saldo:numv(r['Saldo Investido (R$)'])})); }
        else if (h.includes('Categoria') && h.includes('Saldo Investido (R$)')) { const c=colunas(rows[0]);
          pendente.categorias = rows.filter(r=>r['Categoria']).map(r=>({nome:r['Categoria'], rendMes:numv(r[c.m0]), rendMesAnt:numv(r[c.m1]), rend12m:numv(r['Rend. Ult. 12 m (R$)']), rendAno:numv(r[c.ano]), saldo:numv(r['Saldo Investido (R$)'])})); }
      }
    } catch(e){ status(`Não consegui ler ${f.name}. Confira se é o .xlsx exportado do banco.`,'loss'); }
  }
  document.querySelectorAll('#check li').forEach(li=>li.classList.toggle('ok', !!pendente[li.dataset.k]));
  const ok = !!pendente.produtos;
  $('#salvar').disabled = !ok || !db || !canEdit;
  if (ok){ const pat = pendente.produtos.reduce((s,p)=>s+(p.saldo||0),0);
    status(`Pronto: censo de ${dBR(pendente.data||hojeISO())} com ${fmtN(escravos(pat))} escravos (${brl(pat)}).${pendente.serie?'':' Sem a rentabilidade acumulada, a crônica fica como está.'}${db?'':' Ainda conectando ao banco.'}`, 'muted'); }
  else status('Falta o relatório "Meus produtos". Ele traz o saldo de cada legião.','loss');
}
const hojeISO = () => { const d=new Date(); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); };
function status(t,c){ const s=$('#status'); s.textContent=t; s.className='status '+(c||''); }
const drop=$('#drop'), inp=$('#arq');
inp.addEventListener('change',()=>ler([...inp.files]));
['dragenter','dragover'].forEach(ev=>drop.addEventListener(ev,e=>{e.preventDefault(); drop.classList.add('over');}));
['dragleave','drop'].forEach(ev=>drop.addEventListener(ev,e=>{e.preventDefault(); drop.classList.remove('over');}));
drop.addEventListener('drop',e=>ler([...e.dataTransfer.files]));
$('#limpar').addEventListener('click',()=>{ pendente={}; inp.value=''; document.querySelectorAll('#check li').forEach(li=>li.classList.remove('ok')); $('#salvar').disabled=true; status(''); });

/* ---------- ordens ---------- */
let ordens = [], oAtivo = null, oImport = [];
const quando = iso => !iso ? 'sem data' : iso.length===7 ? MESES[+iso.slice(5,7)-1]+'/'+iso.slice(0,4) : dBR(iso);
const ORIGEM = {informado:'você informou', inferido:'inferido', importado:'extrato do banco', manual:'lançada aqui'};
const TIPO = {C:'Compra', V:'Venda', A:'Aplicação'};
const ultimo = () => censos[censos.length-1];
const precoAtual = n => { const a = ultimo() && (ultimo().ativos||[]).find(x=>x.nome===n); return a ? a.preco : null; };
const saldoProd = n => { const p = ultimo() && (ultimo().produtos||[]).find(x=>x.nome===n); return p ? p.saldo : null; };
const ordenar = arr => [...arr].sort((a,b)=> (a.data||a.ref||'9999').localeCompare(b.data||b.ref||'9999') || (a.seq||0)-(b.seq||0));
const corAtivo = n => (LEG[n] && LEG[n].cor) || 'lapis';
function valeHoje(o){
  if (o.tipo==='V') return null;
  if (o.tipo==='A'){ const s=saldoProd(o.ativo); if (s==null) return null;
    const tot = ordens.filter(x=>x.ativo===o.ativo && x.tipo==='A' && x.status==='executada').reduce((t,x)=>t+x.qtd*x.preco,0);
    return tot ? s*(o.qtd*o.preco)/tot : null; }
  const p = precoAtual(o.ativo); return p==null ? null : o.qtd*p;
}
function posicao(ativo, comPend){
  const ex = ordenar(ordens.filter(o=>o.ativo===ativo && o.tipo!=='A' && o.status==='executada'));
  const pd = comPend ? ordens.filter(o=>o.ativo===ativo && o.tipo==='C' && o.status==='pendente').sort((a,b)=>b.preco-a.preco) : [];
  let qtd=0, cost=0; const pts=[];
  for (const o of [...ex, ...pd]) {
    if (o.tipo==='V'){ const pm = qtd?cost/qtd:0; qtd-=o.qtd; cost-=o.qtd*pm; } else { qtd+=o.qtd; cost+=o.qtd*o.preco; }
    pts.push({o, qtd, pm: qtd>0?cost/qtd:0, pend:o.status==='pendente'});
  }
  return pts;
}
function renderOrdens(){
  const vazio = '<div class="empty">Nenhuma ordem no livro ainda. Importe o extrato do banco ou lance na seção VI.</div>';
  const ex = ordenar(ordens.filter(o=>o.status==='executada'));
  const pend = ordens.filter(o=>o.status==='pendente').sort((a,b)=>a.ativo.localeCompare(b.ativo) || b.preco-a.preco);
  const compras = ex.filter(o=>o.tipo!=='V');
  const ouro = compras.reduce((s,o)=>s+o.qtd*o.preco,0);
  const comValor = compras.filter(o=>valeHoje(o)!=null);
  const pagoCV = comValor.reduce((s,o)=>s+o.qtd*o.preco,0), hoje = comValor.reduce((s,o)=>s+valeHoje(o),0);
  const desemb = pend.filter(o=>o.tipo==='C').reduce((s,o)=>s+o.qtd*o.preco,0);
  $('#oKpis').innerHTML = !ordens.length ? '' : [
    kpi('Ordens executadas', fmtN(ex.length), `${ex.filter(o=>o.tipo==='C').length} compras · ${ex.filter(o=>o.tipo==='V').length} vendas · ${ex.filter(o=>o.tipo==='A').length} aplicações`),
    kpi('Escravos recrutados', fmtN(ouro/UNID), `${brl(ouro)} pagos nas ordens executadas`),
    kpi('Desses, vivos hoje', `<span class="${cls(hoje-pagoCV)}">${fmtN(hoje/UNID)}</span>`, pagoCV ? `${spct(hoje/pagoCV-1)} sobre o que foi pago` : 'sem preço atual'),
    kpi('Ordens pendentes', fmtN(pend.length), pend.length ? `${brl(desemb)} a desembolsar se todas executarem` : 'nada esperando no livro')
  ].join('');

  // I · recrutamentos
  const rb = $('#oRecr');
  if (!compras.length) rb.innerHTML = vazio; else {
    const W = Math.max(300, rb.clientWidth-16), lw = W<520?124:178, rh = 40, H = compras.length*rh+6, mr = W<520?78:96;
    const mx = Math.max(...compras.map(o=>Math.max(o.qtd*o.preco, valeHoje(o)||0)));
    const X = v => lw + v/mx*(W-lw-mr);
    let s = `<svg viewBox="0 0 ${W} ${H}" height="${H}" role="img" aria-label="Escravos pagos por ordem e quanto valem hoje">`;
    compras.forEach((o,i)=>{ const y=i*rh+4, pago=o.qtd*o.preco, v=valeHoje(o);
      s += `<text class="ann" x="0" y="${y+12}">${esc(o.ativo)} · ${quando(o.data)}</text><text x="0" y="${y+27}">${o.tipo==='A'?brl(pago):fmtN(o.qtd)+' @ '+brl(o.preco,2)}</text>`;
      s += `<rect x="${lw}" y="${y+2}" width="${Math.max(1,X(pago)-lw)}" height="12" fill="none" stroke="var(--muted)" stroke-dasharray="3 2"><title>Pagos: ${fmtN(pago/UNID)} escravos (${brl(pago)})</title></rect>`;
      if (v!=null) s += `<rect x="${lw}" y="${y+17}" width="${Math.max(1,X(v)-lw)}" height="12" rx="2" fill="var(--${corAtivo(o.ativo)})"><title>Hoje: ${fmtN(v/UNID)} escravos (${brl(v)})</title></rect>`;
      s += `<text class="ann" x="${Math.max(X(pago), v!=null?X(v):0)+6}" y="${y+21}">${fmtN(pago/UNID)} → <tspan fill="var(--${v==null?'muted':v>=pago?'gain':'loss'})">${v==null?'?':fmtN(v/UNID)}</tspan></text>`; });
    rb.innerHTML = s + '</svg>';
  }

  // II · curva
  const ativos = [...new Set(ordens.filter(o=>o.tipo!=='A').map(o=>o.ativo))].sort();
  if (!ativos.includes(oAtivo)) oAtivo = ativos.includes('RAIZ4') ? 'RAIZ4' : ativos[0] || null;
  $('#oAtivos').innerHTML = ativos.map(a=>`<button type="button" data-a="${esc(a)}" aria-pressed="${a===oAtivo}">${esc(a)}</button>`).join('');
  renderCurva();

  // III · pendentes
  const lb = $('#oLadder');
  if (!pend.length) lb.innerHTML = '<div class="empty">Nenhuma ordem pendente.</div>'; else {
    const porAtivo = {}; for (const o of pend) (porAtivo[o.ativo] ||= []).push(o);
    let h = '';
    for (const [a, lista] of Object.entries(porAtivo)) {
      const pa = precoAtual(a); const base = posicao(a,false); let qtd = base.length?base[base.length-1].qtd:0, cost = base.length?base[base.length-1].pm*qtd:0;
      for (const o of lista) {
        if (o.tipo==='C'){ qtd+=o.qtd; cost+=o.qtd*o.preco; }
        const dist = pa ? o.preco/pa-1 : null; const deveria = pa!=null && o.tipo==='C' && o.preco>=pa;
        h += `<div class="rung"><div class="rp">${brl(o.preco,2)}</div>
          <div class="track" title="Preço atual ${pa!=null?brl(pa,2):'desconhecido'}"><span class="fill" style="width:${pa?Math.min(100,o.preco/pa*100):0}%;background:var(--${corAtivo(a)})"></span></div>
          <div class="rinfo"><span><b>${esc(a)}</b> · ${TIPO[o.tipo]||o.tipo} de ${fmtN(o.qtd)} · ${brl(o.qtd*o.preco)}${dist!=null?` · <span class="${deveria?'gain':'loss'}">${deveria?'limite acima do preço atual: confira se executou':spct(dist)+' até executar'}</span>`:''}</span>
          <span class="muted">${o.tipo==='C'?`Se executar: ${fmtN(qtd)} ações, preço médio ${brl(cost/qtd,2)}`:''}${o.nota?' · '+esc(o.nota):''}</span></div></div>`;
      }
    }
    lb.innerHTML = h;
  }

  // IV · tabela
  const tb = $('#oTbl tbody');
  const todas = [...ordenar(ordens.filter(o=>o.status!=='pendente')), ...pend];
  tb.innerHTML = !todas.length ? `<tr><td colspan="10" class="muted">Nenhuma ordem registrada.</td></tr>` : todas.map(o=>{ const pago=o.qtd*o.preco, v=o.status==='executada'?valeHoje(o):null;
    const st = canEdit ? `<select class="tsel" data-id="${esc(o._id)}" aria-label="Status">${['executada','pendente','cancelada'].map(x=>`<option value="${x}"${x===o.status?' selected':''}>${x}</option>`).join('')}</select>` : esc(o.status);
    return `<tr><td>${quando(o.data)}</td><td><b>${esc(o.ativo)}</b></td><td>${TIPO[o.tipo]||esc(o.tipo)}</td><td class="mono">${o.tipo==='A'?'—':fmtN(o.qtd)}</td><td class="mono">${o.tipo==='A'?'—':brl(o.preco,2)}</td><td class="mono">${brl(pago)}</td>
      <td class="mono">${o.tipo==='V'?'—':fmtN(pago/UNID)+' → '+(v==null?'—':`<span class="${cls(v-pago)}">${fmtN(v/UNID)}</span>`)}</td><td>${st}</td><td>${ORIGEM[o.fonte]||esc(o.fonte||'')}${o.nota?`<small>${esc(o.nota)}</small>`:''}</td>
      <td>${canEdit?`<button class="del" type="button" data-id="${esc(o._id)}">remover</button>`:''}</td></tr>`; }).join('');

  // V · conferência
  const cb = $('#oConf tbody'); const c = ultimo();
  if (!c) cb.innerHTML = '<tr><td colspan="6" class="muted">Sem censo para comparar.</td></tr>'; else {
    const linhas = (c.ativos||[]).map(a=>{ const p=posicao(a.nome,false); const q=p.length?p[p.length-1].qtd:0, pm=p.length?p[p.length-1].pm:null, d=a.qtd-q;
      const sit = !p.length ? '<span class="chip l">nenhuma ordem no livro</span>' : d===0 ? '<span class="chip g">quantidade bate</span>' : d>0 ? `<span class="chip l">faltam ${fmtN(d)} ações</span>` : `<span class="chip l">livro tem ${fmtN(-d)} a mais</span>`;
      return `<tr><td><b>${esc(a.nome)}</b></td><td class="mono">${fmtN(q)}</td><td class="mono">${fmtN(a.qtd)}</td><td class="mono">${pm!=null?brl(pm,3):'—'}</td><td class="mono">${brl(a.pm,3)}<small class="muted" style="display:block">${a.pmProv!=null?'c/ proventos '+brl(a.pmProv,3):''}</small></td><td>${sit}</td></tr>`; });
    for (const p of (c.produtos||[])) { if ((c.ativos||[]).some(a=>a.nome===p.nome)) continue;
      const apl = ordens.filter(o=>o.ativo===p.nome && o.tipo==='A' && o.status==='executada').reduce((s,o)=>s+o.qtd*o.preco,0);
      linhas.push(`<tr><td><b>${esc(p.nome)}</b></td><td class="mono">${brl(apl)}</td><td class="mono">${brl(p.saldo||0)}</td><td class="mono">—</td><td class="mono">—</td><td>${!apl?'<span class="chip l">nenhuma aplicação no livro</span>':`<span class="chip ${(p.saldo||0)>=apl?'g':'l'}">rendeu ${sbrl((p.saldo||0)-apl)}</span>`}</td></tr>`); }
    cb.innerHTML = linhas.join('');
  }
  $('#oLista').innerHTML = [...new Set([...ordens.map(o=>o.ativo), ...((c&&c.produtos)||[]).map(p=>p.nome)])].map(a=>`<option value="${esc(a)}">`).join('');
}
function renderCurva(){
  const box = $('#oPM'), cap = $('#oPMcap');
  if (!oAtivo) { box.innerHTML = '<div class="empty">Sem ordens de ações no livro.</div>'; cap.textContent=''; return; }
  const pts = posicao(oAtivo, true); const pa = precoAtual(oAtivo);
  const W = Math.max(300, box.clientWidth-16), H = W<500?240:290, ml = 58, mr = 14, mt = 18, mb = 36, n = pts.length;
  const yMax = Math.max(...pts.map(p=>Math.max(p.pm, p.o.preco)), pa||0) * 1.12;
  const cw = (W-ml-mr)/n, X = i => ml+(i+.5)*cw, Y = v => mt+(1-v/yMax)*(H-mt-mb), hw = cw/2;
  let s = `<svg viewBox="0 0 ${W} ${H}" height="${H}" role="img" aria-label="Preço médio de ${esc(oAtivo)} ordem a ordem">`;
  for (const t of ticks(0,yMax,4)) s += `<line x1="${ml}" x2="${W-mr}" y1="${Y(t)}" y2="${Y(t)}" stroke="var(--line)" stroke-width=".5"/><text x="${ml-6}" y="${Y(t)+4}" text-anchor="end">${brl(t,2)}</text>`;
  let dEx = '', dPd = '';
  pts.forEach((p,i)=>{ const seg = i===0 ? `M${X(0)-hw},${Y(p.pm)}H${X(0)+hw}` : `V${Y(p.pm)}H${X(i)+hw}`;
    if (!p.pend) dEx += seg; else { if (!dPd) dPd = `M${X(i)-hw},${Y(pts[i-1]?pts[i-1].pm:p.pm)}`; dPd += seg; } });
  if (dEx) s += `<path d="${dEx}" fill="none" stroke="var(--gold)" stroke-width="2.5"/>`;
  if (dPd) s += `<path d="${dPd}" fill="none" stroke="var(--gold)" stroke-width="2" stroke-dasharray="5 4" opacity=".8"/>`;
  if (pa!=null) s += `<line x1="${ml}" x2="${W-mr}" y1="${Y(pa)}" y2="${Y(pa)}" stroke="var(--glaze)" stroke-width="1.4" stroke-dasharray="2 3"/><text class="ann" x="${W-mr}" y="${Y(pa)-6}" text-anchor="end" fill="var(--glaze)">preço hoje ${brl(pa,2)}</text>`;
  const k = Math.ceil(n/(W<500?5:9));
  pts.forEach((p,i)=>{ s += `<circle cx="${X(i)}" cy="${Y(p.o.preco)}" r="4.5" fill="${p.pend?'var(--bg)':'var(--'+corAtivo(oAtivo)+')'}" stroke="var(--${corAtivo(oAtivo)})" stroke-width="1.6"><title>${TIPO[p.o.tipo]} ${fmtN(p.o.qtd)} @ ${brl(p.o.preco,2)} · PM depois: ${brl(p.pm,3)}</title></circle>`;
    if (i%k===0 || i===n-1) s += `<text x="${X(i)}" y="${H-20}" text-anchor="middle">${p.pend?'limite':quando(p.o.data).replace('sem data','s/d')}</text><text x="${X(i)}" y="${H-6}" text-anchor="middle">${brl(p.o.preco,2)}</text>`; });
  box.innerHTML = s + '</svg>';
  const ex = pts.filter(p=>!p.pend), lastEx = ex[ex.length-1], lastAll = pts[n-1];
  const a = (ultimo()&&(ultimo().ativos||[]).find(x=>x.nome===oAtivo));
  cap.innerHTML = [lastEx?`Livro: ${fmtN(lastEx.qtd)} ações, PM ${brl(lastEx.pm,3)}`:'Nenhuma ordem executada',
    a?`Banco: PM ${brl(a.pm,3)} (${brl(a.pmProv,3)} c/ proventos)`:'',
    lastAll.pend?`Se as pendentes executarem: ${fmtN(lastAll.qtd)} ações, PM ${brl(lastAll.pm,3)}`:''].filter(Boolean).join(' · ');
}
$('#oAtivos').addEventListener('click', e=>{ const b=e.target.closest('button[data-a]'); if(!b) return; oAtivo=b.dataset.a; $('#oAtivos').querySelectorAll('button').forEach(x=>x.setAttribute('aria-pressed', x===b)); renderCurva(); });

const normTk = s => { s = String(s||'').trim().toUpperCase(); return /^[A-Z]{4}\d{1,2}F$/.test(s) ? s.slice(0,-1) : s; };
const idOrdem = o => [o.ativo, o.data||'sd', o.tipo, o.qtd, o.preco].join('_').replace(/[^A-Za-z0-9_\-.~:@+]/g,'-').slice(0,190);
function msg(el,t,c){ el.textContent=t; el.className='status '+(c||''); }
$('#oForm').addEventListener('submit', async e=>{
  e.preventDefault(); const st=$('#oFormStatus');
  if (!db) return msg(st,'Ainda conectando ao banco. Tente em instantes.','loss');
  const o = {data:$('#oData').value||null, ativo:normTk($('#oAtivoIn').value), tipo:$('#oTipo').value, qtd:numv($('#oQtd').value), preco:numv($('#oPreco').value), status:$('#oStatusIn').value, fonte:'manual', nota:$('#oNota').value.trim()||null, seq:Date.now()};
  if (!o.ativo || !o.qtd || !o.preco) return msg(st,'Preencha ativo, quantidade e preço.','loss');
  try { await db.collection('ordens').doc(idOrdem(o)).set(o); msg(st,`${TIPO[o.tipo]} de ${o.tipo==='A'?brl(o.preco):fmtN(o.qtd)+' '+o.ativo} registrada.`,'gain'); e.target.reset(); }
  catch(err){ msg(st, err&&err.code==='invalid_argument'?'A chave deste navegador não abre o tesouro. Abra pelo link de acesso.':'Não deu para gravar agora. Tente de novo.','loss'); }
});
$('#oTbl').addEventListener('change', async e=>{ const s=e.target.closest('select[data-id]'); if(!s||!db) return;
  try{ await db.collection('ordens').doc(s.dataset.id).update({status:s.value}); }catch(_){ msg($('#oFormStatus'),'Não consegui mudar o status.','loss'); } });
$('#oTbl').addEventListener('click', async e=>{ const b=e.target.closest('.del'); if(!b||!db) return;
  if(!b.classList.contains('armed')){ b.classList.add('armed'); b.textContent='confirmar'; setTimeout(()=>{b.classList.remove('armed'); b.textContent='remover';},4000); return; }
  b.disabled=true; try{ await db.collection('ordens').doc(b.dataset.id).delete(); }catch(_){ b.disabled=false; } });

function extrairOrdens(m){
  const norm = s => String(s??'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').trim();
  for (let i=0; i<Math.min(25,m.length); i++){
    const r = (m[i]||[]).map(norm);
    const acha = (...res) => { for (const re of res){ const j=r.findIndex(c=>re.test(c)); if (j>=0) return j; } return -1; };
    const mp = {ativo:acha(/^(ativo|papel|codigo|ticker|cod\.? negociacao|titulo|produto)$/,/(ativo|papel|codigo|ticker|produto)/),
      qtd:acha(/(qtd|quantidade|qtde)\.? exec/,/^(qtd|qtde|quantidade)/,/quantidade/),
      preco:acha(/preco (medio )?exec/,/preco medio/,/^preco/,/preco/,/valor unit/,/cotacao/),
      data:acha(/^data$/,/^(dt|pregao|data (da )?(ordem|operacao|negociacao|execucao|pregao))/,/data/),
      tipo:acha(/^(c\/v|cv|tipo|natureza|lado|compra\/venda|operacao|tipo de operacao)$/,/(c\/v|natureza|compra|venda)/),
      status:acha(/(status|situacao)/)};
    if (mp.ativo<0 || mp.qtd<0 || mp.preco<0) continue;
    const out=[];
    for (let k=i+1; k<m.length; k++){ const row=m[k]||[];
      const ativo=normTk(row[mp.ativo]), qtd=numv(row[mp.qtd]), preco=numv(row[mp.preco]);
      if (!ativo || !qtd || !preco || /total/i.test(ativo)) continue;
      let tipo='C'; if (mp.tipo>=0){ const t=norm(row[mp.tipo]); if (/^c|compra/.test(t)) tipo='C'; else if (/^v|venda/.test(t)) tipo='V'; else continue; }
      let status='executada'; if (mp.status>=0){ const t=norm(row[mp.status]); if (/cancel|expir|rejeit|recus/.test(t)) status='cancelada'; else if (/abert|pendent|aguard|ativa|enviad/.test(t)) status='pendente'; }
      out.push({data: mp.data>=0 ? serialISO(row[mp.data]) : null, ativo, tipo, qtd:Math.abs(qtd), preco, status, fonte:'importado', nota:null, seq:k});
    }
    return out;
  }
  return [];
}
$('#oArq').addEventListener('change', async ()=>{
  const st=$('#oImpStatus'); oImport=[];
  if (typeof XLSX==='undefined') return msg(st,'Não consegui carregar o leitor de planilhas. Recarregue a página.','loss');
  for (const f of $('#oArq').files){ try{ const wb=XLSX.read(await f.arrayBuffer()); for (const sn of wb.SheetNames) oImport.push(...extrairOrdens(XLSX.utils.sheet_to_json(wb.Sheets[sn],{header:1,defval:null,raw:true}))); }
    catch(_){ msg(st,`Não consegui ler ${f.name}.`,'loss'); } }
  const ids = new Set(ordens.map(o=>o._id)); const novas = oImport.filter(o=>!ids.has(idOrdem(o)));
  if (!oImport.length) { $('#oImportar').disabled=true; return msg(st,'Não achei colunas de ativo, quantidade e preço. Confira se é o extrato de ordens ou negociações.','loss'); }
  $('#oImportar').disabled = !db || !canEdit || !novas.length;
  msg(st, `${oImport.length} ordens reconhecidas (${oImport.filter(o=>o.tipo==='C').length} compras, ${oImport.filter(o=>o.tipo==='V').length} vendas) · ${novas.length} novas no livro.${db?'':' Ainda conectando ao banco.'}`, 'muted');
});
['dragenter','dragover'].forEach(ev=>$('#oDrop').addEventListener(ev,e=>{e.preventDefault(); $('#oDrop').classList.add('over');}));
['dragleave','drop'].forEach(ev=>$('#oDrop').addEventListener(ev,e=>{e.preventDefault(); $('#oDrop').classList.remove('over');}));
$('#oDrop').addEventListener('drop',e=>{ const dt=new DataTransfer(); [...e.dataTransfer.files].forEach(f=>dt.items.add(f)); $('#oArq').files=dt.files; $('#oArq').dispatchEvent(new Event('change')); });
$('#oImportar').addEventListener('click', async ()=>{
  const st=$('#oImpStatus'), b=$('#oImportar'); const ids=new Set(ordens.map(o=>o._id)); const novas=oImport.filter(o=>!ids.has(idOrdem(o)));
  b.disabled=true; let ok=0;
  for (const o of novas){ try{ await db.collection('ordens').doc(idOrdem(o)).set(o); ok++; msg(st,`Importando… ${ok}/${novas.length}`); }
    catch(err){ msg(st, err&&err.code==='quota_exceeded'?'O banco recusou o envio.':`Parei em ${ok}/${novas.length}. Tente de novo; as já gravadas não duplicam.`,'loss'); return; } }
  msg(st,`${ok} ordens importadas.`,'gain'); oImport=[]; $('#oArq').value='';
});

/* ---------- abas ---------- */
function aba(n, rolar){ const o = n==='ordens';
  $('#pTesouraria').hidden=o; $('#pOrdens').hidden=!o; $('#tTes').setAttribute('aria-selected',!o); $('#tOrd').setAttribute('aria-selected',o);
  try{ history.replaceState(null,'','#'+(o?'ordens':'tesouraria')); }catch(_){}
  dispatchEvent(new Event('resize')); if (rolar) scrollTo(0,0); }
$('#tTes').addEventListener('click',()=>aba('tesouraria',true));
$('#tOrd').addEventListener('click',()=>aba('ordens',true));
if (location.hash==='#ordens') aba('ordens');

/* ---------- banco ---------- */
let db = null;
$('#salvar').addEventListener('click', async ()=>{
  if (!db || !pendente.produtos) return;
  const b=$('#salvar'); b.disabled=true; status('Contando o exército…');
  const data = pendente.data || hojeISO();
  const patrimonio = Math.round(pendente.produtos.reduce((s,p)=>s+(p.saldo||0),0)*100)/100;
  const censo = {data, mesRef:pendente.mesRef||null, mesAntRef:pendente.mesAntRef||null, ativos:pendente.ativos||[], categorias:pendente.categorias||[], produtos:pendente.produtos, patrimonio,
    serieAte: pendente.serie? pendente.serie[pendente.serie.length-1][0] : null, rendAcum: pendente.serie? pendente.serie[pendente.serie.length-1][1] : null, registradoEm:new Date().toISOString()};
  try{
    await db.doc('censos/'+data).set(censo);
    if (pendente.serie) await db.doc('historico/serie').set({atualizadoEm:data, pontos:pendente.serie});
    status(`Censo de ${dBR(data)} registrado.`,'gain'); pendente={}; inp.value=''; document.querySelectorAll('#check li').forEach(li=>li.classList.remove('ok'));
  } catch(e){ b.disabled=false;
    status(e&&e.code==='invalid_argument'?'A chave deste navegador não abre o tesouro. Abra pelo link de acesso.': e&&e.code==='quota_exceeded'?'O banco recusou o tamanho do envio.':'Não deu para gravar agora. Tente de novo em instantes.','loss'); }
});
$('#censoTbl').addEventListener('click', async e=>{
  const b=e.target.closest('.del'); if(!b||!db) return;
  if(!b.classList.contains('armed')){ b.classList.add('armed'); b.textContent='confirmar'; setTimeout(()=>{b.classList.remove('armed'); b.textContent='remover';},4000); return; }
  b.disabled=true; try{ await db.doc('censos/'+b.dataset.id).delete(); }catch(_){ b.disabled=false; status('Não consegui remover o censo.','loss'); }
});

(async ()=>{
  render();
  const sb = await conectar();
  const recarregar = async () => {
    try { const d = await carregar(sb); censos = d.censos; serie = d.serie; ordens = d.ordens; render(); }
    catch (_) { status('Não consegui ler o banco. Recarregue a página.','loss'); }
  };
  db = adaptador(sb, recarregar);
  await recarregar();
  addEventListener('focus', recarregar);
})();
})();
