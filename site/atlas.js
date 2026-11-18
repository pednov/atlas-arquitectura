/* ATLAS: concursos e notícias desenhados a partir dos dados, com recolha diária lida do repositório.
   A página traz uma cópia dos dados (para abrir sempre); se houver dados mais recentes no repositório, redesenha. */
(function(){
const $ = (s, r=document) => r.querySelector(s);
const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const fold = s => String(s||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase();
const MES = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
const MESES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
const DAY = 864e5;
const today0 = () => { const d = new Date(); d.setHours(0,0,0,0); return d; };
const fmt = d => `${d.getDate()} ${MES[d.getMonth()]} ${d.getFullYear()}`;
const fmtLong = s => { const [y,m,d] = s.split('-').map(Number); return `${d} de ${MESES[m-1]} de ${y}`; };
const parse = s => { const [a,b] = s.split('T'); const [y,m,d] = a.split('-').map(Number); const [h,mi] = (b||'23:59').split(':').map(Number); return new Date(y, m-1, d, h, mi); };
const eur = v => Math.round(v).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ' €';
const EXT = '<svg width="11" height="11" viewBox="0 0 12 12" aria-hidden="true"><path d="M4.5 2.5h5v5M9.5 2.5L3 9" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>';

const CFG = (() => { try { return JSON.parse($('#atlas-cfg').textContent); } catch(_) { return {}; } })();
const SEC = CFG.sec || {};
const SECORDER = CFG.secOrder || Object.keys(SEC);
const secOf = id => SEC[id] || {nome: 'Portugal', cor: '#bdbdbd'};

function statusOf(due){
  const now = new Date();
  if (due >= now) return 'aberto';
  return (now - due) <= 365*DAY ? 'encerrado' : 'arquivo';
}
const LABEL = {aberto:'Propostas abertas', encerrado:'Prazo encerrado', arquivo:'Arquivo'};
/* cor do prazo: verde com mais de 15 dias, amarelo nos últimos 15, vermelho depois de fechar */
const urgOf = (due, st) => st !== 'aberto' ? 'vermelho' : (daysTo(due) > 15 ? 'verde' : 'amarelo');
/* parecer: o Pedro pediu que a recomendação nomeie a OA (17 Nov. 2026) */
const REC = {sim: ['Recomendado pela OA', '✓', 'Recomendados pela OA', 'Recomendado pela Ordem dos Arquitectos'],
             nao: ['Não recomendado pela OA', '✕', 'Não recomendados pela OA', 'Não recomendado pela Ordem dos Arquitectos'],
             sem: ['Sem parecer', '–', 'Sem parecer', 'Sem parecer da Ordem dos Arquitectos']};
function recLabels(){
  document.querySelectorAll('.fb[data-k="rec"]').forEach(b => {
    const r = REC[b.dataset.v]; if (!r) return;
    const t = [...b.childNodes].find(n => n.nodeType === 3);
    if (t) t.textContent = r[2] + ' '; b.title = r[3];
    const lab = b.parentNode.querySelector('.lab'); if (lab) lab.textContent = 'Parecer da OA';
  });
}
const daysTo = due => Math.round((new Date(due.getFullYear(), due.getMonth(), due.getDate()) - today0()) / DAY);
function dueText(due, st){
  const days = daysTo(due);
  if (st === 'aberto') return `Entrega até <b>${fmt(due)}</b> · ${days === 0 ? 'termina hoje' : days === 1 ? 'termina amanhã' : `faltam ${days} dias`}`;
  const ago = -days, mo = Math.round(ago/30.4);
  const rel = ago < 31 ? `há ${ago} dia${ago===1?'':'s'}` : ago < 365 ? `há ${Math.max(1,mo)} ${mo > 1 ? 'meses' : 'mês'}` : 'há mais de um ano';
  return `Entrega a ${fmt(due)}, encerrou ${rel}`;
}

/* ---------- dados: cópia embutida e versão do repositório ---------- */
function snap(id){ try { return JSON.parse($('#' + id).textContent); } catch(_) { return null; } }
async function fresh(name, local){
  if (!CFG.data) return local;
  try {
    const r = await fetch(CFG.data + name + '?t=' + Math.floor(Date.now() / 36e5), {cache: 'no-store'});
    if (!r.ok) return local;
    const d = await r.json();
    return (!local || (d.actualizado || '') >= (local.actualizado || '')) ? d : local;
  } catch(_) { return local; }
}

/* ---------- concursos ---------- */
function concursoCard(c){
  const s = secOf(c.sec), due = parse(c.entrega), st = statusOf(due), u = urgOf(due, st);
  const rec = c.recomendacao || 'sem', days = daysTo(due);
  const figs = [];
  const pt = c.premios_total || (c.premios && c.premios.length ? c.premios.reduce((a,p) => a + p[1], 0) : null);
  if (c.premios && c.premios.length) {
    const f = c.premios[0];
    figs.push(['Prémios', eur(pt), c.premios_nota || (/º$/.test(f[0]) ? `${f[0]} prémio ${eur(f[1])}` : `${f[0]} ${eur(f[1])}`)]);
  }
  if (c.valor_base) figs.push(['Valor base do projecto', eur(c.valor_base), 'mais IVA']);
  if (c.custo_obra) figs.push(['Custo máximo da obra', eur(c.custo_obra), 'mais IVA']);
  if (c.esclarecimentos) figs.push(['Esclarecimentos até', fmt(parse(c.esclarecimentos)), '']);
  const fonte = (CFG.fontesC || {})[c.fonte] || {nome: c.fonte};
  const meta = [c.promotor, c.local, c.programa].filter(Boolean).join(' · ');
  const links = `<a class="lnk dark" href="${esc(c.url)}" target="_blank" rel="noopener">Ver em ${esc(fonte.curto || fonte.nome)} ${EXT}</a>` +
    (c.links || []).map(([t,uu]) => `<a class="lnk" href="${esc(uu)}" target="_blank" rel="noopener">${esc(t)} ${EXT}</a>`).join('');
  // marcador de tempo: dias que faltam, ou fecho
  let tm;
  if (st === 'aberto') tm = `<div class="tm" data-u="${u}" title="Entrega até ${fmt(due)}"><b>${days}</b><span>${days === 1 ? 'dia' : 'dias'}</span></div>`;
  else tm = `<div class="tm" data-u="vermelho" title="Prazo encerrado a ${fmt(due)}"><b>✕</b><span>fechado</span></div>`;
  // barra do tempo decorrido entre a publicação e a entrega
  let bar = '';
  if (c.publicado) {
    const p0 = parse(c.publicado), total = due - p0;
    const frac = st === 'aberto' ? Math.min(1, Math.max(0, (Date.now() - p0) / (total || 1))) : 1;
    bar = `<div class="tbar" data-u="${u}" aria-hidden="true"><i style="width:${(frac * 100).toFixed(1)}%"></i></div>
<div class="tdates"><span>Publicado a ${fmt(p0)}</span><span>Entrega a ${fmt(due)}</span></div>`;
  }
  const q = fold([c.titulo, c.promotor, c.local, c.programa, c.tipo, s.nome, REC[rec][0]].join(' '));
  const el = document.createElement('article');
  el.className = 'cc'; el.style.setProperty('--c', s.cor);
  Object.assign(el.dataset, {st, u, rec, sec: c.sec || '', prog: c.programa || '', q});
  el._due = due;
  el.innerHTML = `<div class="band"></div><div class="in">
<div class="top"><span class="st" data-s="${st}" data-u="${u}">${LABEL[st]}</span><span class="rec" data-r="${rec}" title="${REC[rec][3]}"><b>${REC[rec][1]}</b>${REC[rec][0]}</span></div>
<div class="due">${dueText(due, st)}</div>
<h3><a href="${esc(c.url)}" target="_blank" rel="noopener">${esc(c.titulo)}</a></h3>
${meta ? `<div class="meta">${esc(meta)}</div>` : ''}
${bar}
${c.tipo ? `<div class="tipo">${esc(c.tipo)}</div>` : ''}
${figs.length ? '<div class="figs">' + figs.map(([a,b,x]) => `<div class="fg"><small>${esc(a)}</small><b>${esc(b)}</b>${x ? `<span>${esc(x)}</span>` : ''}</div>`).join('') + '</div>' : ''}
${c.nota ? `<p class="note">${esc(c.nota)}</p>` : ''}
<div class="lnks">${links}</div>
<div class="src">Fonte: ${esc(fonte.nome)}</div></div>${tm}`;
  return el;
}
function renderConcursos(d){
  const list = $('#clist'); if (!list) return;
  const rank = {aberto:0, encerrado:1, arquivo:2};
  const cards = (d.concursos || []).map(concursoCard)
    .sort((a,b) => rank[a.dataset.st] - rank[b.dataset.st] || (a.dataset.st === 'aberto' ? a._due - b._due : b._due - a._due));
  const order = [...SECORDER, ''];
  const groups = order.map(id => {
    const own = cards.filter(cd => (cd.dataset.sec || '') === id);
    if (!own.length) return null;
    const s = id ? secOf(id) : {nome: 'Outras localizações', cor: '#bdbdbd'};
    const g = document.createElement('section');
    g.className = 'cgroup'; g.dataset.group = id || 'outras'; g.style.setProperty('--c', s.cor);
    g.innerHTML = `<h2 class="cgh"><i></i>${esc(s.nome)}<span class="gn num"></span></h2><div class="clist-in"></div>`;
    $('.clist-in', g).append(...own);
    return g;
  }).filter(Boolean);
  list.replaceChildren(...groups);
  const sel = $('select[data-k="prog"]');
  if (sel) {
    const progs = [...new Set((d.concursos || []).map(c => c.programa).filter(Boolean))].sort((a,b) => a.localeCompare(b, 'pt'));
    sel.innerHTML = '<option value="all">Todos os programas</option>' + progs.map(p => `<option>${esc(p)}</option>`).join('');
  }
  const upd = $('#upd-c'); if (upd && d.actualizado) upd.textContent = fmtLong(d.actualizado);
  const fl = $('#fontes-c');
  if (fl && d.fontes) fl.innerHTML = d.fontes.map(f => `<div class="fonte"><span class="pill ${f.estado === 'ligada' ? 'dark' : 'out'}">${f.estado === 'ligada' ? 'Ligada' : 'A ligar'}</span><b>${esc(f.nome)}</b><p>${esc(f.nota)}</p><a href="${esc(f.url)}" target="_blank" rel="noopener">Abrir a fonte ${EXT}</a></div>`).join('');
}

/* ---------- notícias ---------- */
/* por ordem do calendário, agrupadas por mês (pedido do Pedro, 18 Nov. 2026); cada notícia leva a cor da sua região,
   cinzento se for nacional (sem região própria) e verde se for internacional (no estrangeiro) */
const NEXTRA = {NAC: {nome: 'Nacional', cor: '#8c8c8c'}, INT: {nome: 'Internacional', cor: '#2F9E44'}};
const MESF = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const nsecOf = id => SEC[id] || NEXTRA[id] || NEXTRA.NAC;
const nsecId = n => (SEC[n.sec] || NEXTRA[n.sec]) ? n.sec : 'NAC';
function renderNoticias(d){
  const box = $('#nlist'); if (!box) return;
  const fontes = Object.fromEntries((d.fontes || []).map(f => [f.id, f]));
  const ns = (d.noticias || []).slice().sort((a,b) => b.d.localeCompare(a.d));
  const order = [...SECORDER, 'NAC', 'INT'];
  const meses = [...new Set(ns.map(n => n.d.slice(0, 7)))];
  box.innerHTML = meses.map(ym => {
    const items = ns.filter(n => n.d.startsWith(ym));
    const [yy, mo] = ym.split('-').map(Number);
    return `<section class="nmes" data-group="${esc(ym)}"><h2 class="nmonth">${MESF[mo - 1]} de ${yy}<span class="gn num"></span></h2><div class="nlist">${items.map(n => {
      const [y, mm, dd] = n.d.split('-').map(Number);
      const f = fontes[n.f] || {nome: n.f};
      const id = nsecId(n), s = nsecOf(id);
      const th = n.img ? `<a class="th" href="${esc(n.u)}" target="_blank" rel="noopener" tabindex="-1" aria-hidden="true"><img src="${esc(n.img)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" onerror="this.parentNode.remove()"></a>` : '';
      const q = fold([n.t, n.m, n.tema, f.nome, s.nome].join(' '));
      return `<article class="ni sc" style="--c:${s.cor}" data-f="${esc(n.f)}" data-tema="${esc(n.tema)}" data-sec="${esc(id)}" data-q="${esc(q)}">
<div class="dt"><b>${dd}</b>${MES[mm-1]}<span class="yr">${y}</span>${th}</div>
<div><div class="tg"><span class="pill rg"><i></i>${esc(s.nome)}</span><span class="pill f-${esc(n.f)}">${esc(f.nome)}</span><span class="pill out">${esc(n.tema)}</span></div>
<h3><a href="${esc(n.u)}" target="_blank" rel="noopener">${esc(n.t)}</a></h3>
${n.m ? `<div class="m">${esc(n.m)}</div>` : ''}</div></article>`;
    }).join('')}</div></section>`;
  }).join('');
  const fr = $('#fontes-n');
  if (fr && (d.fontes || []).length) {
    const on = ($('.fb[data-k="f"][aria-pressed="true"]', fr) || {}).dataset?.v || 'all';
    fr.innerHTML = '<span class="lab">Fonte</span>' + [{id: 'all', nome: 'Todas'}, ...d.fontes].map(f =>
      `<button class="fb" type="button" data-k="f" data-v="${esc(f.id)}" aria-pressed="${f.id === on ? 'true' : 'false'}">${esc(f.nome)}${f.id === 'all' ? '' : ' <span class="n num"></span>'}</button>`).join('');
  }
  const F = $('.filters[data-for=".ni"]');
  let rb = $('#regs');
  if (!rb && F) { rb = document.createElement('div'); rb.className = 'frow'; rb.id = 'regs'; F.insertBefore(rb, $('#temas', F) || F.firstChild); }
  if (rb) {
    const used = new Set(ns.map(nsecId));
    rb.innerHTML = '<span class="lab">Região</span><button class="fb" type="button" data-k="sec" data-v="all" aria-pressed="true">Todas</button>' +
      order.filter(id => used.has(id) || SEC[id]).map(id => { const s = nsecOf(id);
        return `<button class="fb" type="button" data-k="sec" data-v="${esc(id)}" aria-pressed="false" style="--c:${s.cor}"><i></i>${esc(s.nome)} <span class="n num"></span></button>`; }).join('');
  }
  const tb = $('#temas');
  if (tb) {
    const temas = [...new Set(ns.map(n => n.tema))].sort((a,b) => a.localeCompare(b, 'pt'));
    tb.innerHTML = '<span class="lab">Tema</span><button class="fb" type="button" data-k="tema" data-v="all" aria-pressed="true">Todos</button>' +
      temas.map(t => `<button class="fb" type="button" data-k="tema" data-v="${esc(t)}" aria-pressed="false">${esc(t)} <span class="n num"></span></button>`).join('');
  }
  const upd = $('#upd-n'); if (upd && d.actualizado) upd.textContent = fmtLong(d.actualizado);
  const ld = $('main p.lead');                         /* fontes da Imprensa, também nas páginas publicadas antes do Dezeen (18 Nov. 2026) */
  if (ld && d.excluidas) ld.textContent = 'Arquitectura, urbanismo e vida nas cidades, a partir da secção de arquitectura do Construir, das obras em Portugal publicadas no ArchDaily, do Lisboa Para Pessoas e do ECO, com a actualidade internacional da Arquitectura Viva e do Dezeen. ' + d.excluidas;
  const pu = upd && upd.parentNode;                    /* páginas publicadas antes de 18 Nov. 2026 ainda dizem «arrumadas por região» */
  if (pu && pu.textContent.includes('arrumadas por região'))
    pu.innerHTML = pu.innerHTML.replace(/As notícias estão arrumadas por região[^.]*\./, 'As notícias seguem a ordem do calendário e cada uma tem a cor da sua região, cinzenta quando não se prende a uma região e verde quando se passa no estrangeiro.');
}

/* ---------- entrada: prazos, últimas notícias e contagens ---------- */
function renderHome(c, n){
  const mc = $('#mini-c');
  if (mc && c) {
    const open = (c.concursos || []).map(x => ({x, due: parse(x.entrega)})).filter(o => statusOf(o.due) === 'aberto').sort((a,b) => a.due - b.due);
    mc.innerHTML = open.length ? open.slice(0,4).map(({x, due}) => { const dd = daysTo(due);
      return `<a href="${esc(mc.dataset.href)}"><span class="d" data-u="${dd > 15 ? 'verde' : 'amarelo'}">${dd}<small>${dd === 1 ? 'dia' : 'dias'}</small></span><span><b>${esc(x.titulo)}</b><span>${esc(x.local || '')} · entrega até ${fmt(due)}</span></span></a>`; }).join('')
      : '<p class="empty">Sem concursos com propostas abertas.</p>';
    $$('[data-open-count]').forEach(e => e.textContent = open.length);
    $$('[data-total-count]').forEach(e => e.textContent = (c.concursos || []).length);
  }
  const mn = $('#mini-n');
  if (mn && n) {
    const fontes = Object.fromEntries((n.fontes || []).map(f => [f.id, f]));
    const ns = (n.noticias || []).slice().sort((a,b) => b.d.localeCompare(a.d));
    mn.innerHTML = ns.slice(0,4).map(x => { const [, mm, dd] = x.d.split('-').map(Number);
      return `<a href="${esc(x.u)}" target="_blank" rel="noopener"><span class="d">${dd}<small>${MES[mm-1]}</small></span><span><b>${esc(x.t)}</b><span>${esc((fontes[x.f] || {}).nome || '')}${x.m ? ' · ' + esc(x.m) : ''}</span></span></a>`; }).join('');
    $$('[data-news-count]').forEach(e => e.textContent = ns.length);
  }
}

/* ---------- filtros ---------- */
function setupFilters(){
  const F = $('.filters[data-for]'); if (!F) return;
  const state = F._state || (F._state = {});
  $$('.fb[data-k]', F).forEach(b => {
    const v = state[b.dataset.k] || 'all';
    b.setAttribute('aria-pressed', b.dataset.v === v ? 'true' : 'false');
  });
  const sel = $('select[data-k]', F); if (sel && state[sel.dataset.k]) sel.value = state[sel.dataset.k];
  const items = () => $$(F.dataset.for);
  const count = $('.count', F), empty = $('#empty');
  function match(it, st){
    for (const k in st) { const v = st[k]; if (v && v !== 'all' && k !== 'q' && it.dataset[k] !== v) return false; }
    if (st.q) { const words = fold(st.q).split(/\s+/).filter(Boolean); if (!words.every(w => (it.dataset.q || '').includes(w))) return false; }
    return true;
  }
  function apply(){
    const all = items(); let n = 0;
    all.forEach(it => { const ok = match(it, state); it.hidden = !ok; if (ok) n++; });
    $$('[data-group]').forEach(g => {
      const vis = $$(F.dataset.for, g).filter(it => !it.hidden).length;
      g.hidden = !vis;
      const gn = $('.gn', g); if (gn) gn.textContent = vis;
    });
    if (count) count.textContent = n + (n === 1 ? ' resultado' : ' resultados');
    if (empty) empty.hidden = n > 0;
    $$('.fb[data-k] .n', F).forEach(el => {
      const b = el.closest('.fb'); const k2 = all.filter(it => match(it, Object.assign({}, state, {[b.dataset.k]: b.dataset.v}))).length;
      el.textContent = k2; b.classList.toggle('zero', k2 === 0);
    });
  }
  if (!F._wired) {
    F._wired = true;
    F.addEventListener('click', e => {
      const b = e.target.closest('.fb[data-k]'); if (!b) return;
      $$(`.fb[data-k="${b.dataset.k}"]`, F).forEach(x => x.setAttribute('aria-pressed', x === b ? 'true' : 'false'));
      state[b.dataset.k] = b.dataset.v; apply();
    });
    F.addEventListener('change', e => { const s = e.target.closest('select[data-k]'); if (s) { state[s.dataset.k] = s.value; apply(); } });
    const q = $('input[data-q]', F); if (q) q.addEventListener('input', () => { state.q = q.value.trim(); apply(); });
  }
  apply();
}

/* ---------- legislação (SILUC) ---------- */
/* abreviaturas que os arquitectos usam e que não aparecem nos títulos do SILUC */
const LEX_SIGLAS = {
  rjue: ['urbanizacao e edificacao', 'urbanizacao e da edificacao'], rgeu: ['regulamento geral das edificacoes urbanas'],
  scie: ['seguranca contra incendio'], rtscie: ['seguranca contra incendio'], rjru: ['reabilitacao urbana'],
  rjigt: ['instrumentos de gestao territorial'], ccp: ['codigo dos contratos publicos'], ren: ['reserva ecologica'],
  ran: ['reserva agricola'], rgr: ['regulamento geral do ruido'], rrae: ['requisitos acusticos'],
  sce: ['certificacao energetica'], reh: ['edificios de habitacao'], recs: ['comercio e servicos'], aia: ['impacte ambiental'],
  nrau: ['arrendamento urbano'], lbsotu: ['politica publica de solos'], pdm: ['planos diretores municipais'],
  ited: ['infraestruturas de telecomunicacoes em edificios'], acessibilidades: ['acessibilidade']};
const LEX_PASSO = 40;
const lexTerr = t => String(t).replace(/^Regi[ãa]o Aut[óo]noma d[aeo]s? /, '');
const lexEv = ev => { const f = fold(ev); return f.startsWith('em vigor') ? 'vigor' : f.startsWith('revog') ? 'revogado' : f ? 'outro' : 'outro'; };
function lexLoad(){
  const box = $('#lex'); if (!box) return null;
  const local = box.dataset.local;
  const get = u => fetch(u, {cache: 'no-store'}).then(r => r.ok ? r.json() : null).catch(() => null);
  const remote = CFG.data ? get(CFG.data + 'legislacao.json?t=' + Math.floor(Date.now() / 36e5)) : Promise.resolve(null);
  return Promise.all([remote, get(local)]).then(([a, b]) => {
    if (a && b) return (a.actualizado || '') >= (b.actualizado || '') ? a : b;
    return a || b;
  });
}
function lexItem(d, temas, ficha){
  const [y, m, dd] = (d.d || '----').split('-');
  const ev = lexEv(d.ev);
  const fs = fold(d.s), ft = fold(d.t);
  const sm = d.s && fs !== ft && !fs.startsWith(ft.slice(0, 60)) ? `<p class="sm">${esc(d.s)}</p>` : '';
  const terr = (d.terr || []).filter(t => fold(t) !== 'portugal');
  const tm = (d.temas || []).map(i => temas[i]).filter(Boolean);
  const meta = [tm.join(' · '), (d.sub || []).filter(x => !tm.includes(x)).slice(0, 3).join(', ')].filter(Boolean).join(' — ');
  const vig = d.fv ? `Vigorou até ${fmtLong(d.fv)}` : (d.iv ? `Em vigor desde ${fmtLong(d.iv)}` : '');
  return `<article class="lx" data-ev="${ev}">
<div class="dt">${d.d ? `<b>${Number(dd)}</b>${MES[Number(m)-1]}<span class="yr">${y}</span>` : '<b>–</b>'}</div>
<div><div class="tg"><span class="pill dark">${esc(d.tipo)}${d.num ? ' ' + esc(d.num) : ''}</span><span class="ev" data-ev="${ev}">${esc(d.ev || 'Sem estado')}</span>${terr.map(t => `<span class="pill out">${esc(lexTerr(t))}</span>`).join('')}</div>
<h3><a href="${esc(ficha + d.id)}" target="_blank" rel="noopener">${esc(d.t)}</a></h3>
${sm}${meta ? `<div class="m">${esc(meta)}</div>` : ''}
<div class="lk">${vig ? `<span class="vg">${esc(vig)}</span>` : ''}<a href="${esc(ficha + d.id)}" target="_blank" rel="noopener">Ficha no SILUC ↗</a>${d.dr ? `<a href="${esc(d.dr)}" target="_blank" rel="noopener">Diário da República ↗</a>` : ''}${d.pdf ? `<a href="${esc(d.pdf)}" target="_blank" rel="noopener">PDF ↗</a>` : ''}</div>
${lexRel(d, ficha)}
</div></article>`;
}
/* «Alterado por», «Regulamentado por», «Retificado por», «Regulamenta» e «Adaptado às RA por», lidos da ficha do SILUC */
const LEX_REL = [['alt', 'Alterações'], ['reg', 'Regulamentação'], ['ret', 'Rectificações'], ['regu', 'Regulamenta'], ['ra', 'Adaptação às regiões autónomas']];
const lexRelLink = (x, ficha) => x[3] && /^\d+$/.test(x[3]) ? ficha + x[3] : (x[2] || '');
const lexDia = s => s ? fmt(parse(s)) : '';
function lexRel(d, ficha){
  const grupos = LEX_REL.filter(([k]) => (d[k] || []).length);
  if (!grupos.length) return '';
  const alt = d.alt || [], ult = alt.slice().sort((a, b) => (b[1] || '').localeCompare(a[1] || ''))[0];
  const resumo = [alt.length ? `Alterado ${alt.length === 1 ? 'uma vez' : alt.length + ' vezes'}${ult ? `, a última pelo ${esc(ult[0])}` : ''}` : '',
    (d.reg || []).length ? `${d.reg.length === 1 ? 'uma portaria ou diploma' : d.reg.length + ' diplomas'} de regulamentação` : ''].filter(Boolean).join(' · ');
  const lista = ([k, nome]) => `<div class="rg"><b>${nome}</b><ol${(d[k] || []).length > 8 ? ' class="many"' : ''}>${(d[k] || []).slice().sort((a, b) => (b[1] || '').localeCompare(a[1] || '')).map(x => {
      const u = lexRelLink(x, ficha);
      return `<li>${u ? `<a href="${esc(u)}" target="_blank" rel="noopener">${esc(x[0])}</a>` : esc(x[0])}${x.includes('revogado') ? ' <span class="rv">revogado</span>' : ''}</li>`; }).join('')}</ol></div>`;
  return `<details class="rel"><summary>${resumo || 'Diplomas relacionados'}</summary>${grupos.map(lista).join('')}</details>`;
}
function renderLegislacao(L){
  const box = $('#lex'); if (!box || !L) return;
  const temas = Object.fromEntries((L.temas || []).map(t => [t.id, t.nome]));
  const ficha = (L.fonte && L.fonte.ficha) || 'https://www.siluc.pt/siluc/detalhe/';
  const relq = d => LEX_REL.map(([k]) => (d[k] || []).map(x => x[0]).join(' ')).join(' ');
  const ds = (L.diplomas || []).map(d => Object.assign(d, {_q: fold([d.t, d.s, d.tipo, d.num, (d.cls||[]).join(' '), (d.sub||[]).join(' '), (d.temas||[]).map(i => temas[i]).join(' '), relq(d)].join(' ')), _ev: lexEv(d.ev), _terr: (d.terr || []).map(fold)}));
  const set = (id, v) => { const el = $(id); if (el) el.textContent = v; };
  set('#upd-l', L.actualizado ? fmtLong(L.actualizado) : '');
  set('#tot-l', (L.total || ds.length).toLocaleString('pt-PT'));
  /* alterações recentes: alterações e regulamentação publicadas nos últimos seis meses (agrupadas pelo diploma que
     altera), mais os diplomas novos no SILUC; seguem o tema e o âmbito escolhidos nos filtros. Sem relações lidas,
     mostram as fichas mudadas nos últimos 30 dias */
  const base = L.actualizado ? parse(L.actualizado) : today0();
  const lim = new Date(base - 183 * DAY + 12 * 36e5).toISOString().slice(0, 10);
  const lim30 = new Date(base - 30 * DAY + 12 * 36e5).toISOString().slice(0, 10);
  const temRel = ds.some(d => d._r || d.alt || d.reg);
  const rb = $('#lex-rec'), rs = $('#lex-rec-n');
  let recTodas = false;
  const renderRec = (ok) => {
    if (!rb) return;
    const ev = new Map(), base_ = ds.filter(ok);
    for (const d of base_) for (const [k, verbo] of [['alt', 'altera'], ['reg', 'regulamenta']]) for (const x of d[k] || []) {
      if (!x[1] || x[1] < lim) continue;
      if (!ev.has(x[0])) ev.set(x[0], {dt: x[1], t: x[0], verbo, alvos: [], u: lexRelLink(x, ficha)});
      ev.get(x[0]).alvos.push(d);
    }
    const usados = new Set([...ev.values()].map(e => e.u));
    for (const d of base_) if (d.d && d.d >= lim && !usados.has(ficha + d.id))
      ev.set('novo' + d.id, {dt: d.d, t: `${d.tipo} n.º ${d.num || ''}`.trim(), verbo: 'novo', alvos: [d], u: ficha + d.id});
    let rec = [...ev.values()].sort((a, b) => b.dt.localeCompare(a.dt));
    if (!temRel) rec = base_.filter(d => d.mod && d.mod >= lim30).sort((a, b) => b.mod.localeCompare(a.mod)).map(d => ({dt: d.mod, t: `${d.tipo} n.º ${d.num || ''}`, verbo: 'ficha', alvos: [d], u: ficha + d.id}));
    const fraseV = {altera: 'altera', regulamenta: 'regulamenta', novo: '', ficha: ''};
    const mostra = recTodas ? rec : rec.slice(0, 9);
    rb.innerHTML = mostra.map(e => {
      const alvo = e.alvos[0], mais = e.alvos.length - 1;
      const etiqueta = e.verbo === 'altera' ? 'alteração' : e.verbo === 'regulamenta' ? 'regulamentação' : e.verbo === 'novo' ? 'diploma novo' : 'ficha actualizada';
      const titulo = (e.verbo === 'novo' || e.verbo === 'ficha') ? alvo.t : alvo.t + (mais > 0 ? ` e mais ${mais}` : '');
      return `<a href="${esc(e.u || ficha + alvo.id)}" target="_blank" rel="noopener"><span class="w">${esc(fmt(parse(e.dt)))} · ${etiqueta}</span><b>${esc(titulo)}</b><span class="n">${fraseV[e.verbo] ? esc(e.t.replace(/, de .*$/, '')) + ' ' + fraseV[e.verbo] : esc(e.t)}</span></a>`;
    }).join('') + (rec.length > 9 ? `<button type="button" class="recmore">${recTodas ? 'Mostrar só as mais recentes' : 'Mostrar todas (' + rec.length + ')'}</button>` : '')
      || '<p class="empty">Sem alterações nos últimos seis meses para os filtros escolhidos.</p>';
    if (rs) rs.textContent = rec.length ? (temRel ? `${rec.length} nos últimos seis meses` : `${rec.length} nos últimos 30 dias`) : '';
  };
  /* filtros */
  const state = {tema: 'all', sub: '', ev: 'all', terr: 'all', tipo: '', q: '', n: LEX_PASSO};
  const cnt = (f) => ds.filter(f).length;
  const tb = $('#lex-temas');
  tb.innerHTML = '<span class="lab">Tema</span><button class="fb" type="button" data-k="tema" data-v="all" aria-pressed="true">Todos</button>' +
    (L.temas || []).map(t => `<button class="fb" type="button" data-k="tema" data-v="${esc(t.id)}" aria-pressed="false">${esc(t.nome)} <span class="n num"></span></button>`).join('');
  const evs = [['all', 'Todos'], ['vigor', 'Em vigor'], ['revogado', 'Revogados'], ['outro', 'Outros']].filter(([k]) => k === 'all' || cnt(d => d._ev === k));
  $('#lex-ev').hidden = evs.length <= 2;
  $('#lex-ev').innerHTML = '<span class="lab">Estado</span>' + evs.map(([k, t], i) => `<button class="fb" type="button" data-k="ev" data-v="${k}" aria-pressed="${i ? 'false' : 'true'}">${t} ${k === 'all' ? '' : '<span class="n num"></span>'}</button>`).join('');
  const terrs = [...new Set(ds.flatMap(d => d.terr || []))].filter(t => fold(t) !== 'portugal').sort((a, b) => a.localeCompare(b, 'pt'));
  $('#lex-terr').innerHTML = '<span class="lab">Âmbito</span><button class="fb" type="button" data-k="terr" data-v="all" aria-pressed="true">Todos</button><button class="fb" type="button" data-k="terr" data-v="portugal" aria-pressed="false">Nacional <span class="n num"></span></button>' +
    terrs.map(t => `<button class="fb" type="button" data-k="terr" data-v="${esc(fold(t))}" aria-pressed="false">${esc(lexTerr(t))} <span class="n num"></span></button>`).join('');
  const tipos = Object.entries(ds.reduce((a, d) => (a[d.tipo] = (a[d.tipo] || 0) + 1, a), {})).sort((a, b) => b[1] - a[1]);
  $('#lex-tipo').innerHTML = '<option value="">Todos os tipos</option>' + tipos.map(([t, n]) => `<option value="${esc(t)}">${esc(t)} (${n})</option>`).join('');
  const subSel = $('#lex-sub');
  const fillSub = () => {
    const t = (L.temas || []).find(t => t.id === state.tema);
    subSel.hidden = !t || !(t.sub || []).length;
    subSel.innerHTML = '<option value="">Todos os subtemas</option>' + (t ? t.sub : []).map(x => `<option value="${esc(x)}">${esc(x)}</option>`).join('');
    state.sub = '';
  };
  /* cada palavra vale por si ou pela expansão da sigla; o número do diploma e o título contam mais na ordenação */
  const words = q => fold(q).split(/\s+/).filter(Boolean).map(w => [w, ...(LEX_SIGLAS[w.replace(/[^a-z0-9\-\/]/g, '')] || [])]);
  const hasW = (d, alts) => alts.some(a => d._q.includes(a));
  const score = d => { let n = 0; const ft = fold(d.t), fn = fold(d.num);
    for (const alts of state._w) { if (alts.some(a => fn === a || fn.startsWith(a + '/') || fn === a.replace(/^n\.?o?/, ''))) n += 8; if (alts.some(a => ft.includes(a))) n += 3; if (alts.some(a => ft.includes('(' + a + ')'))) n += 6; if (alts.slice(1).some(a => ft.startsWith(a))) n += 8; }
    const fq = fold(state.q).trim(); if (fq.length > 3 && ft.includes(fq)) n += 10;
    if (n && /^(regime juridico|regulamento geral|regulamento tecnico|codigo)/.test(ft)) n += 2;
    return n; };
  const match = (d, skip) => (skip === 'tema' || state.tema === 'all' || (d.temas || []).includes(state.tema))
    && (!state.sub || (d.sub || []).includes(state.sub))
    && (skip === 'ev' || state.ev === 'all' || d._ev === state.ev)
    && (skip === 'terr' || state.terr === 'all' || (state.terr === 'portugal' ? (!d._terr.length || d._terr.includes('portugal')) : d._terr.includes(state.terr)))
    && (!state.tipo || d.tipo === state.tipo)
    && (!state._w.length || state._w.every(alts => hasW(d, alts)));
  const list = $('#lex-list'), more = $('#lex-more'), empty = $('#lex-empty'), count = $('#lex-count');
  const apply = (keep) => {
    state._w = words(state.q);
    if (!keep) state.n = LEX_PASSO;
    renderRec(d => (state.tema === 'all' || (d.temas || []).includes(state.tema)) && (!state.sub || (d.sub || []).includes(state.sub))
      && (state.terr === 'all' || (state.terr === 'portugal' ? (!d._terr.length || d._terr.includes('portugal')) : d._terr.includes(state.terr))));
    let hits = ds.filter(d => match(d));
    if (state._w.length) hits = hits.map(d => [score(d), d]).sort((a, b) => b[0] - a[0] || (b[1].d || '').localeCompare(a[1].d || '')).map(x => x[1]);
    list.innerHTML = hits.slice(0, state.n).map(d => lexItem(d, temas, ficha)).join('');
    more.hidden = hits.length <= state.n;
    more.textContent = `Mostrar mais ${Math.min(LEX_PASSO, hits.length - state.n)} de ${(hits.length - state.n).toLocaleString('pt-PT')}`;
    empty.hidden = hits.length > 0;
    count.textContent = `${hits.length.toLocaleString('pt-PT')} ${hits.length === 1 ? 'diploma' : 'diplomas'}`;
    $$('.fb[data-k] .n', box).forEach(n => {
      const b = n.closest('.fb'), k = b.dataset.k, v = b.dataset.v, old = state[k];
      state[k] = v; const c = ds.filter(d => match(d)).length; state[k] = old;
      n.textContent = c.toLocaleString('pt-PT'); b.classList.toggle('zero', !c);
    });
  };
  if (!box.dataset.wired) {
    box.dataset.wired = '1';
    box.addEventListener('click', e => {
      const b = e.target.closest('.fb[data-k]'); if (!b) return;
      $$(`.fb[data-k="${b.dataset.k}"]`, box).forEach(x => x.setAttribute('aria-pressed', x === b ? 'true' : 'false'));
      state[b.dataset.k] = b.dataset.v; if (b.dataset.k === 'tema') fillSub(); apply();
    });
    subSel.addEventListener('change', () => { state.sub = subSel.value; apply(); });
    $('#lex-tipo').addEventListener('change', e => { state.tipo = e.target.value; apply(); });
    let tq; $('#lex-q').addEventListener('input', e => { clearTimeout(tq); tq = setTimeout(() => { state.q = e.target.value.trim(); apply(); }, 120); });
    more.addEventListener('click', () => { state.n += LEX_PASSO; apply(true); });
    if (rb) rb.addEventListener('click', e => { if (e.target.closest('.recmore')) { recTodas = !recTodas; apply(true); } });
  }
  /* «#q=163/2006»: pesquisa vinda de outra página do ATLAS (por exemplo, dos verificadores) */
  const hq = /[#&]q=([^&]+)/.exec(location.hash);
  if (hq) { try { state.q = decodeURIComponent(hq[1]); } catch(_) { state.q = hq[1]; } const qi = $('#lex-q'); if (qi) qi.value = state.q; }
  fillSub(); apply();
  box.classList.add('ready');
}

/* ---------- fotógrafos de arquitectura (Divisare) ---------- */
const foSec = id => id === 'NAC' ? {nome: 'Outros lugares', cor: '#8c8c8c'} : nsecOf(id);
const foCid = f => String(f.c || '').split(' e ')[0];
function foCard(f){
  const id = nsecId(f), s = foSec(id);
  const obras = (f.obras || []).slice(0, 4);
  const q = fold([f.n, f.c, s.nome, ...(f.obras || []).map(o => [o.t, o.l, o.a].join(' '))].join(' '));
  const host = f.w ? f.w.replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/$/, '') : '';
  const lis = obras.map(o => {
    const sub = [o.l, o.a ? 'arquitectura de ' + o.a : ''].filter(Boolean).join(' · ');
    return `<li><a href="${esc(o.u)}" target="_blank" rel="noopener">${esc(o.t)}</a>${sub ? `<span>${esc(sub)}</span>` : ''}</li>`;
  }).join('');
  return `<article class="fo" style="--c:${s.cor}" data-sec="${esc(id)}" data-c="${esc(foCid(f))}" data-q="${esc(q)}">
<div class="fh"><h3><a href="${esc(f.u)}" target="_blank" rel="noopener">${esc(f.n)}</a></h3><span class="pill rg"><i></i>${esc(f.c || s.nome)}</span></div>
${lis ? `<ol class="fobras">${lis}</ol>` : '<p class="fsem">Sem obras na primeira página do Divisare.</p>'}
<div class="lnks"><a class="lnk dark" href="${esc(f.u)}" target="_blank" rel="noopener">Ver no Divisare ${EXT}</a>${f.w ? `<a class="lnk" href="${esc(f.w)}" target="_blank" rel="noopener">${esc(host)} ${EXT}</a>` : ''}</div>
</article>`;
}
function renderFotografos(d){
  const box = $('#flist'); if (!box) return;
  const fs = d.fotografos || [];
  if (!fs.length) { box.innerHTML = '<p class="empty">A lista de fotógrafos ainda está a ser recolhida.</p>'; return; }
  const grupos = [...SECORDER, 'NAC'].filter(id => fs.some(f => nsecId(f) === id));
  box.innerHTML = grupos.map(id => { const s = foSec(id);
    return `<section class="fgrp" data-group="${esc(id)}"><h2 class="nmonth"><i style="background:${s.cor}"></i>${esc(s.nome)}<span class="gn num"></span></h2><div class="fgrid">${fs.filter(f => nsecId(f) === id).map(foCard).join('')}</div></section>`;
  }).join('');
  const rb = $('#regs-f');
  if (rb) rb.innerHTML = '<span class="lab">Região</span><button class="fb" type="button" data-k="sec" data-v="all" aria-pressed="true">Todas</button>' +
    grupos.map(id => { const s = foSec(id);
      return `<button class="fb" type="button" data-k="sec" data-v="${esc(id)}" aria-pressed="false" style="--c:${s.cor}"><i></i>${esc(s.nome)} <span class="n num"></span></button>`; }).join('');
  const sel = $('#cid-f');
  if (sel) {
    const conta = {}; fs.forEach(f => { const c = foCid(f); if (c) conta[c] = (conta[c] || 0) + 1; });
    sel.innerHTML = '<option value="all">Todas as cidades</option>' + Object.keys(conta).sort((a, b) => a.localeCompare(b, 'pt'))
      .map(c => `<option value="${esc(c)}">${esc(c)} (${conta[c]})</option>`).join('');
  }
  const upd = $('#upd-f'); if (upd && d.actualizado) upd.textContent = fmtLong(d.actualizado);
  const tot = $('#tot-f'); if (tot) tot.textContent = fs.length;
}

/* o separador «Notícias» passou a chamar-se «Imprensa» (pedido do Pedro, 18 Nov. 2026): corrige as páginas publicadas antes */
(function(){
  $$('.atabs a[href*="noticias"]').forEach(a => { if (a.textContent.trim() === 'Notícias') a.textContent = 'Imprensa'; });
  /* «Roteiros» passou a «Guias de Arquitectura», com o subtítulo «Roteiros Intersecções» (18 Nov. 2026) */
  $$('.atabs a[href*="roteiros"], .atabs a[href*="Lx7XNvU4"]').forEach(a => { if (a.textContent.trim() === 'Roteiros') a.innerHTML = '<span class="lg">Guias de Arquitectura</span><span class="sh">Guias</span>'; });
  $$('.tile h2').forEach(h => { const t = h.firstChild, sm = h.querySelector('small'); if (t && t.nodeType === 3 && t.textContent.trim() === 'Roteiros') { t.textContent = 'Guias de Arquitectura'; if (sm) sm.textContent = 'Roteiros Intersecções'; } });
  $$('.tile[href*="noticias"] h2').forEach(h => { const t = h.firstChild; if (t && t.nodeType === 3 && t.textContent.trim() === 'Notícias') t.textContent = 'Imprensa'; });
  $$('a.more-l[href*="noticias"]').forEach(a => { if (a.textContent.trim() === 'Todas as notícias') a.textContent = 'Toda a imprensa'; });
  if ($('#nlist')) {
    const h1 = $('h1.h1'); if (h1 && h1.textContent.trim() === 'Notícias') h1.textContent = 'Imprensa';
    const k = $('.kicker'); if (k && k.lastChild && k.lastChild.nodeType === 3 && k.lastChild.textContent.trim() === 'Imprensa') k.lastChild.textContent = 'Notícias de arquitectura';
    if (document.title.startsWith('Notícias')) document.title = document.title.replace(/^Notícias/, 'Imprensa');
  }
  $$('p').forEach(p => { if (p.textContent.includes('Os Concursos e as Notícias')) p.innerHTML = p.innerHTML.replace('Os Concursos e as Notícias', 'Os Concursos e a Imprensa'); });
  $$('p').forEach(p => { if (p.textContent.includes('Os Roteiros compilam')) p.innerHTML = p.innerHTML.replace('Os Roteiros compilam as obras publicadas nas revistas Intersecções.', 'Os Guias de Arquitectura reúnem os Roteiros Intersecções, com as obras publicadas nas revistas Intersecções.'); });
})();

/* ---------- arranque ---------- */
const sc = snap('snap-concursos'), sn = snap('snap-noticias');
if ($('#clist') && sc) { recLabels(); renderConcursos(sc); setupFilters(); fresh('concursos.json', sc).then(d => { if (d !== sc) { renderConcursos(d); setupFilters(); } }); }
if ($('#nlist') && sn) { renderNoticias(sn); setupFilters(); fresh('noticias.json', sn).then(d => { if (d !== sn) { renderNoticias(d); setupFilters(); } }); }
const sf = snap('snap-fotografos');
if ($('#flist') && sf) { renderFotografos(sf); setupFilters(); fresh('fotografos.json', sf).then(d => { if (d !== sf) { renderFotografos(d); setupFilters(); } }); }
if ($('[data-foto-count]')) fresh('fotografos.json', null).then(d => { const n = d && (d.fotografos || []).length; if (n) $$('[data-foto-count]').forEach(e => e.textContent = n); });
if ($('#lex')) { const p = lexLoad(); p && p.then(L => { if (L) renderLegislacao(L); else { const er = $('#lex-erro'); if (er) er.hidden = false; } }); }
if ($('#mini-c') || $('#mini-n')) {
  renderHome(sc, sn);
  Promise.all([fresh('concursos.json', sc), fresh('noticias.json', sn)]).then(([c, n]) => { if (c !== sc || n !== sn) renderHome(c, n); });
}
})();
