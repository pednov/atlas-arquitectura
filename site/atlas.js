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
const REC = {sim: ['Recomendado', '✓'], nao: ['Não recomendado', '✕'], sem: ['Sem parecer', '–']};
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
<div class="top"><span class="st" data-s="${st}" data-u="${u}">${LABEL[st]}</span><span class="rec" data-r="${rec}"><b>${REC[rec][1]}</b>${REC[rec][0]}</span></div>
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
/* agrupadas por região, mais «Nacional» (sem região própria) e «Internacional» (no estrangeiro) */
const NEXTRA = {NAC: {nome: 'Nacional', cor: '#8c8c8c'}, INT: {nome: 'Internacional', cor: '#2b2b2b'}};
const nsecOf = id => SEC[id] || NEXTRA[id] || NEXTRA.NAC;
const nsecId = n => (SEC[n.sec] || NEXTRA[n.sec]) ? n.sec : 'NAC';
function renderNoticias(d){
  const box = $('#nlist'); if (!box) return;
  const fontes = Object.fromEntries((d.fontes || []).map(f => [f.id, f]));
  const ns = (d.noticias || []).slice().sort((a,b) => b.d.localeCompare(a.d));
  const order = [...SECORDER, 'NAC', 'INT'];
  box.innerHTML = order.map(id => {
    const items = ns.filter(n => nsecId(n) === id); if (!items.length) return '';
    const s = nsecOf(id);
    return `<section class="cgroup ngroup" data-group="${esc(id)}" style="--c:${s.cor}"><h2 class="cgh"><i></i>${esc(s.nome)}<span class="gn num"></span></h2><div class="nlist">${items.map(n => {
      const [y, mm, dd] = n.d.split('-').map(Number);
      const f = fontes[n.f] || {nome: n.f};
      const th = n.img ? `<a class="th" href="${esc(n.u)}" target="_blank" rel="noopener" tabindex="-1" aria-hidden="true"><img src="${esc(n.img)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" onerror="this.parentNode.remove()"></a>` : '';
      const q = fold([n.t, n.m, n.tema, f.nome, s.nome].join(' '));
      return `<article class="ni" data-f="${esc(n.f)}" data-tema="${esc(n.tema)}" data-sec="${esc(id)}" data-q="${esc(q)}">
<div class="dt"><b>${dd}</b>${MES[mm-1]}<span class="yr">${y}</span>${th}</div>
<div><div class="tg"><span class="pill f-${esc(n.f)}">${esc(f.nome)}</span><span class="pill out">${esc(n.tema)}</span></div>
<h3><a href="${esc(n.u)}" target="_blank" rel="noopener">${esc(n.t)}</a></h3>
${n.m ? `<div class="m">${esc(n.m)}</div>` : ''}</div></article>`;
    }).join('')}</div></section>`;
  }).join('');
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

/* ---------- arranque ---------- */
const sc = snap('snap-concursos'), sn = snap('snap-noticias');
if ($('#clist') && sc) { renderConcursos(sc); setupFilters(); fresh('concursos.json', sc).then(d => { if (d !== sc) { renderConcursos(d); setupFilters(); } }); }
if ($('#nlist') && sn) { renderNoticias(sn); setupFilters(); fresh('noticias.json', sn).then(d => { if (d !== sn) { renderNoticias(d); setupFilters(); } }); }
if ($('#mini-c') || $('#mini-n')) {
  renderHome(sc, sn);
  Promise.all([fresh('concursos.json', sc), fresh('noticias.json', sn)]).then(([c, n]) => { if (c !== sc || n !== sn) renderHome(c, n); });
}
})();
