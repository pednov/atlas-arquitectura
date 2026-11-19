/* ATLAS · Observatório da profissão (pedido do Pedro, 19 Nov. 2026)
   Gráficos do inquérito de 2022, questionário aberto (Netlify Forms) e backoffice de recolha e compilação.
   Os gráficos usam o azul do separador e, para as respostas recolhidas no ATLAS, um laranja que passa no validador
   de cores (daltonismo e contraste sobre o branco). Sem relação gráfica com o relatório original. */
(function(){
'use strict';
const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
const NF = new Intl.NumberFormat('pt-PT', {maximumFractionDigits: 1});
const pct = v => v == null || isNaN(v) ? '–' : NF.format(v) + '%';
const num = v => v == null || isNaN(v) ? '–' : NF.format(v);
const NF1 = new Intl.NumberFormat('pt-PT', {minimumFractionDigits: 1, maximumFractionDigits: 1});
const nota10 = v => v == null || isNaN(v) ? '–' : NF1.format(v);
const C1 = '#2563A8', C2 = '#C96A1B', NEUTRO = '#D6D3CC', C1L = '#8DB0DB';
const MINIMO = 30;                        /* respostas necessárias para mostrar a comparação na página pública */
const SITE = 'atlas-arquitectura.netlify.app';
const API = 'https://api.netlify.com/api/v1';

const root = $('#obs'); if (!root) return;
const snap = id => { const e = document.getElementById(id); try { return e ? JSON.parse(e.textContent) : null; } catch (x) { return null; } };
const CFG = snap('atlas-cfg') || {};
async function fresh(name, fallback){
  if (!CFG.data) return fallback;
  try { const r = await fetch(CFG.data + name + '?t=' + Math.floor(Date.now() / 3e5)); if (r.ok) return await r.json(); } catch (x) {}
  return fallback;
}

/* ---------------------------------------------------------------- dica ao passar o rato (os valores estão também na tabela de cada gráfico) */
let tip = null;
function dica(){
  if (tip) return;
  tip = document.createElement('div'); tip.className = 'ob-tip'; tip.hidden = true; document.body.appendChild(tip);
  const show = (t, x, y) => { tip.innerHTML = t; tip.hidden = false; const w = tip.offsetWidth, h = tip.offsetHeight;
    tip.style.left = Math.max(8, Math.min(innerWidth - w - 8, x - w / 2)) + 'px'; tip.style.top = Math.max(8, y - h - 12) + 'px'; };
  document.addEventListener('pointerover', ev => { const t = ev.target.closest('[data-tt]'); if (!t) return; const r = t.getBoundingClientRect(); show(t.dataset.tt, r.left + r.width / 2, r.top); });
  document.addEventListener('pointerout', ev => { if (ev.target.closest('[data-tt]')) tip.hidden = true; });
  document.addEventListener('focusin', ev => { const t = ev.target.closest('[data-tt]'); if (!t) return; const r = t.getBoundingClientRect(); show(t.dataset.tt, r.left + r.width / 2, r.top); });
  document.addEventListener('focusout', () => { tip.hidden = true; });
  addEventListener('scroll', () => { tip.hidden = true; }, {passive: true});
}
const tt = (cat, serie, v, extra) => esc(`<b>${esc(cat)}</b><span>${serie ? esc(serie) + ': ' : ''}${extra === 'n' ? nota10(v) : pct(v)}</span>`);

/* ---------------------------------------------------------------- gráficos */
function ordem(g, vals){
  const idx = g.cats.map((_, i) => i);
  if (g.tipo !== 'bar' || g.ordem) return idx;
  const last = g.ultimo ? idx.pop() : null;
  idx.sort((a, b) => vals[b] - vals[a]);
  if (last != null) idx.push(last);
  return idx;
}
function legenda(series){
  return `<div class="ob-leg">${series.map(s => `<span><i style="background:${s.c}"></i>${esc(s.nome)}</span>`).join('')}</div>`;
}
function tabela(g, series){
  const rows = g.tipo === 'heat'
    ? g.linhas.map((l, i) => `<tr><th scope="row">${esc(l)}</th>${series.map(s => g.cats.map((_, j) => `<td>${pct(s.v[i] ? s.v[i][j] : null)}</td>`).join('')).join('')}</tr>`).join('')
    : g.cats.map((c, i) => `<tr><th scope="row">${esc(c)}</th>${series.map(s => `<td>${g.tipo === 'media' && g.max === 10 ? nota10(s.v[i]) : pct(s.v[i])}</td>`).join('')}</tr>`).join('');
  const head = g.tipo === 'heat'
    ? `<tr><th></th>${series.map(s => g.cats.map(c => `<th scope="col">${esc(series.length > 1 ? s.nome + ' · ' : '')}${esc(c)}</th>`).join('')).join('')}</tr>`
    : `<tr><th></th>${series.map(s => `<th scope="col">${esc(s.nome)}</th>`).join('')}</tr>`;
  return `<details class="ob-tab"><summary>Ver os valores</summary><div class="ob-tw"><table>${head}${rows}</table></div></details>`;
}
function barras(g, series){                         /* horizontais: categorias sem ordem (da maior para a menor) ou com ordem própria */
  const max = g.tipo === 'media' ? g.max : Math.max(1, ...series.flatMap(s => s.v.filter(v => v != null)));
  const fmt = v => g.tipo === 'media' && g.max === 10 ? nota10(v) : pct(v);
  return `<div class="ob-bars${series.length > 1 ? ' two' : ''}">${ordem(g, series[0].v).map(i => `<div class="ob-row"><span class="ob-l">${esc(g.cats[i])}</span><span class="ob-tr">${series.map(s =>
    `<span class="ob-bw"><i class="ob-b" tabindex="0" style="width:${Math.max(s.v[i] ? .6 : 0, 100 * (s.v[i] || 0) / max)}%;background:${s.c}" data-tt="${tt(g.cats[i], series.length > 1 ? s.nome : '', s.v[i], g.tipo === 'media' && g.max === 10 ? 'n' : '')}"></i><span class="ob-v num">${fmt(s.v[i])}</span></span>`).join('')}</span></div>`).join('')}</div>`;
}
function colunas(g, series){                        /* verticais: categorias com ordem (idades, escalões) */
  const max = Math.max(1, ...series.flatMap(s => s.v.filter(v => v != null)));
  const many = g.cats.length > 7;
  return `<div class="ob-cols${many ? ' many' : ''}${series.length > 1 ? ' two' : ''}" style="--n:${g.cats.length}">${g.cats.map((c, i) => `<div class="ob-col"><div class="ob-ca">${series.map(s =>
    `<span class="ob-cw"><span class="ob-v num">${pct(s.v[i])}</span><i class="ob-c" tabindex="0" style="height:${Math.max(s.v[i] ? 1 : 0, 100 * (s.v[i] || 0) / max)}%;background:${s.c}" data-tt="${tt(c, series.length > 1 ? s.nome : '', s.v[i])}"></i></span>`).join('')}</div><span class="ob-cl">${esc(c)}</span></div>`).join('')}</div>`;
}
function segmento(g, series){                       /* uma barra repartida, alta, com a parte escrita dentro quando cabe */
  const cores = g.cats.length === 2 ? [C1, NEUTRO] : [C1, C1L, NEUTRO];
  const bar = s => `<div class="ob-seg">${g.cats.map((c, i) => s.v[i] ? `<span class="ob-sp" tabindex="0" style="flex:${s.v[i]} 1 0;background:${cores[i] || NEUTRO};color:${i === 0 ? '#fff' : '#1b1b1b'}" data-tt="${tt(c, series.length > 1 ? s.nome : '', s.v[i])}"><b class="num">${pct(s.v[i])}</b></span>` : '').join('')}</div>`;
  return `${series.map(s => `${series.length > 1 ? `<div class="ob-sl">${esc(s.nome)}</div>` : ''}${bar(s)}`).join('')}
<div class="ob-leg">${g.cats.map((c, i) => `<span><i style="background:${cores[i] || NEUTRO}"></i>${esc(c)}</span>`).join('')}</div>`;
}
const heatCor = v => { const t = Math.min(1, Math.max(0, (v || 0) / 100)), k = Math.pow(t, .75);
  const a = [242, 246, 251], b = [23, 63, 110]; return `rgb(${a.map((x, i) => Math.round(x + (b[i] - x) * k)).join(',')})`; };
function calor(g, s, nome){
  return `${nome ? `<div class="ob-sl">${esc(nome)}</div>` : ''}<div class="ob-hw"><table class="ob-heat"><thead><tr><th></th>${g.cats.map(c => `<th scope="col">${esc(c)}</th>`).join('')}</tr></thead><tbody>${g.linhas.map((l, i) =>
    `<tr><th scope="row">${esc(l)}</th>${g.cats.map((c, j) => { const v = s.v[i] ? s.v[i][j] : null;
      return `<td tabindex="0" style="background:${v == null ? '#fafaf8' : heatCor(v)};color:${(v || 0) > 42 ? '#fff' : '#1b1b1b'}" data-tt="${tt(l + ' · ' + c, nome || '', v)}">${v == null ? '' : pct(v)}</td>`; }).join('')}</tr>`).join('')}</tbody></table></div>`;
}
const ESTREITO = matchMedia('(max-width: 620px)');
const deitar = g => ESTREITO.matches && g.cats.length > 5;     /* em ecrãs estreitos, muitas colunas passam a barras deitadas, pela mesma ordem */
function grupos(g, series){
  return (deitar(g) ? barras(g, series) : colunas(g, series)) + legenda(series);
}
function estatisticas(g){
  return `<div class="ob-stats">${g.itens.map(x => `<div class="ob-st"><b>${pct(x.v)}</b><span>${esc(x.l)}</span></div>`).join('')}</div>`;
}
function grafico(g, cmp){
  /* cmp: respostas do ATLAS para este gráfico, {n, v} (ou {n, v:[[...],[...]]} nos grupos) */
  const s22 = {nome: 'Inquérito de 2022', c: C1, v: g.v};
  const sAT = cmp ? {nome: `Respostas no ATLAS (${cmp.n})`, c: C2, v: cmp.v} : null;
  let corpo = '', series = [s22];
  if (g.tipo === 'stat') corpo = estatisticas(g);
  else if (g.tipo === 'heat') { corpo = calor(g, s22, sAT ? s22.nome : '') + (sAT ? calor(g, sAT, sAT.nome) : ''); series = sAT ? [s22, sAT] : [s22]; }
  else if (g.tipo === 'grp') {
    const ss = g.series.map((n, k) => ({nome: n, c: k ? C2 : C1, v: g.v[k]}));
    corpo = (sAT ? '<div class="ob-sl">Inquérito de 2022</div>' : '') + grupos(g, ss);
    if (sAT) corpo += `<div class="ob-sl">${esc(sAT.nome)}</div>` + grupos(g, g.series.map((n, k) => ({nome: n, c: k ? C2 : C1, v: cmp.v[k] || []})));
    series = sAT ? [...ss.map(s => ({...s, nome: '2022 · ' + s.nome})), ...g.series.map((n, k) => ({nome: 'ATLAS · ' + n, v: cmp.v[k] || []}))] : ss;
  } else {
    if (sAT) series = [s22, sAT];
    corpo = g.tipo === 'col' && !deitar(g) ? colunas(g, series) : g.tipo === 'seg' ? segmento(g, series) : barras(g, series);
    if (sAT && g.tipo !== 'seg') corpo += legenda(series);
  }
  const wide = g.tipo === 'heat' || (g.tipo === 'col' && g.cats.length > 9) || (g.tipo === 'grp' && g.cats.length > 6);
  return `<figure class="ob-card${wide ? ' wide' : ''}" id="g-${esc(g.id)}"><figcaption><h3>${esc(g.q)}</h3>${g.nota ? `<p>${esc(g.nota)}</p>` : ''}</figcaption>${corpo}${g.tipo === 'stat' ? '' : tabela(g, series)}</figure>`;
}
function ajustarSegmentos(box){                      /* a percentagem só fica escrita dentro da parte quando cabe com folga */
  $$('.ob-sp', box).forEach(sp => { const b = sp.firstChild; sp.classList.toggle('nolab', b.scrollWidth + 14 > sp.clientWidth); });
}

/* ---------------------------------------------------------------- compilação das respostas (igual à do scripts/observatorio.py) */
function compilar(O, subs){
  const campos = {}; O.questionario.seccoes.forEach(s => s.perguntas.forEach(p => campos[p.id] = p));
  const graf = {}; O.blocos.forEach(b => b.graficos.forEach(g => graf[g.id] = g));
  const val = (d, k) => (d[k] == null ? '' : String(d[k])).trim();
  const multi = (d, k) => val(d, k).split(/\s*\|\s*|,\s(?=[A-ZÁÉÍÓÚÂÊÔ0-9])/).map(x => x.trim()).filter(Boolean);
  const dist = (rows, p) => { const c = p.op.map(() => 0); let n = 0;
    rows.forEach(v => { const i = p.op.indexOf(v); if (i >= 0) { c[i]++; n++; } }); return {n, v: n ? c.map(x => Math.round(1000 * x / n) / 10) : c.map(() => null)}; };
  const out = {};
  for (const [gid, cf] of Object.entries(O.compara)) {
    const g = graf[gid]; if (!g) continue;
    if (Array.isArray(cf)) {                         /* dois campos, duas séries (obra pública e privada) */
      const ds = cf.map(f => dist(subs.map(d => val(d, f)), campos[f]));
      out[gid] = {n: Math.max(...ds.map(d => d.n)), v: ds.map(d => d.v)}; continue;
    }
    const p = campos[cf];
    if (p.tipo === 'check') {
      const quem = subs.filter(d => multi(d, cf).length);
      const c = p.op.map(o => quem.filter(d => multi(d, cf).includes(o)).length);
      out[gid] = {n: quem.length, v: quem.length ? c.map(x => Math.round(1000 * x / quem.length) / 10) : c.map(() => null)};
    } else if (p.tipo === 'grid') {
      const linhas = p.linhas.map((_, i) => dist(subs.map(d => val(d, `${cf}__${i}`)), p));
      out[gid] = {n: Math.max(0, ...linhas.map(l => l.n)), v: linhas.map(l => l.v)};
    } else if (p.tipo === 'escala') {
      const linhas = p.linhas.map((_, i) => { const xs = subs.map(d => val(d, `${cf}__${i}`)).filter(x => x !== '').map(Number).filter(x => !isNaN(x));
        return {n: xs.length, m: xs.length ? Math.round(10 * xs.reduce((a, b) => a + b, 0) / xs.length) / 10 : null}; });
      out[gid] = {n: Math.max(0, ...linhas.map(l => l.n)), v: linhas.map(l => l.m)};
    } else if (g.tipo === 'grp') {                   /* um campo, duas séries: todos e quem exerce arquitectura */
      const a = dist(subs.map(d => val(d, cf)), p), b = dist(subs.filter(d => val(d, 'exerce') === 'Sim').map(d => val(d, cf)), p);
      out[gid] = {n: a.n, v: [a.v, b.v]};
    } else out[gid] = dist(subs.map(d => val(d, cf)), p);
  }
  return out;
}

/* ---------------------------------------------------------------- página pública */
function desenharBlocos(O, R){
  const box = $('#obs-blocos'); if (!box) return;
  const usa = R && R.n >= MINIMO ? R.graficos || {} : {};
  box.innerHTML = O.blocos.map(b => `<section class="ob-bloco" id="b-${esc(b.id)}"><h2 class="h2">${esc(b.titulo)}</h2>${b.intro ? `<p class="ob-intro">${esc(b.intro)}</p>` : ''}
<div class="ob-grid">${b.graficos.map(g => grafico(g, usa[g.id] && usa[g.id].n ? usa[g.id] : null)).join('')}</div></section>`).join('');
  ajustarSegmentos(box); dica();
  const nav = $('#obs-nav');
  if (nav) nav.innerHTML = O.blocos.map(b => `<a class="fb" href="#b-${esc(b.id)}">${esc(b.titulo)}</a>`).join('');
  const est = $('#obs-resp');
  if (est) {
    const n = R ? R.n || 0 : 0;
    est.innerHTML = n ? `<b class="num">${n}</b> ${n === 1 ? 'resposta recolhida' : 'respostas recolhidas'} no ATLAS${R.actualizado ? ', compiladas a ' + esc(fmtData(R.actualizado)) : ''}.${n < MINIMO ? ` A comparação com 2022 aparece nos gráficos a partir de ${MINIMO} respostas.` : ' Os gráficos comparam-nas com o inquérito de 2022.'}`
      : `Ainda não há respostas compiladas. A comparação com 2022 aparece nos gráficos a partir de ${MINIMO} respostas.`;
  }
  addEventListener('resize', () => ajustarSegmentos(box));
  ESTREITO.addEventListener('change', () => desenharBlocos(O, R));
}
const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const fmtData = s => { const [y, m, d] = String(s).slice(0, 10).split('-').map(Number); return `${d} de ${MESES[m - 1]} de ${y}`; };

/* ---------------------------------------------------------------- questionário: no início da página, uma janela de cada vez (pedido do Pedro, 19 Nov. 2026, 01:35) */
function questionario(){
  const f = $('#obs-form'); if (!f) return;
  const ant = $('#obs-ant'), seg = $('#obs-seg'), env = $('#obs-env'), win = $('#obs-win');
  const condOk = el => { const s = el.dataset.se; if (!s) return true; let c; try { c = JSON.parse(s); } catch (x) { return true; }
    return Object.entries(c).every(([k, vals]) => { const els = $$(`[name="${CSS.escape(k)}"]`, f).filter(x => !x.disabled);
      const v = els.filter(x => (x.type === 'radio' || x.type === 'checkbox') ? x.checked : true).map(x => x.value);
      return v.some(x => vals.includes(x)); }); };
  const passos = () => $$('.qs', f).filter(s => !s.hidden && $$('.qq', s).some(q => !q.hidden) || s.classList.contains('qfim') && !s.hidden);
  let atual = $('.qs', f).dataset.titulo;
  const actualizar = () => {
    for (let k = 0; k < 3; k++) {                    /* condições encadeadas (inscrição, forma de exercício, regiões) */
      $$('.qs', f).forEach(s => { const on = condOk(s); s.hidden = !on; $$('input,select,textarea', s).forEach(x => { if (!x.closest('.qq[data-off]')) x.disabled = !on; }); });
      $$('.qq', f).forEach(q => { const sec = q.closest('.qs'); const on = !sec.hidden && condOk(q); q.hidden = !on;
        if (on) q.removeAttribute('data-off'); else q.setAttribute('data-off', ''); $$('input,select,textarea', q).forEach(x => x.disabled = !on); });
    }
    const vis = $$('.qq', f).filter(q => !q.hidden), resp = vis.filter(q => $$('input,select,textarea', q).some(x => (x.type === 'radio' || x.type === 'checkbox') ? x.checked : x.value.trim()));
    const pr = $('#obs-prog'); if (pr) pr.textContent = `${resp.length} de ${vis.length} perguntas respondidas`;
  };
  const mostrar = (rolar) => {
    actualizar();
    const ps = passos();
    let i = ps.findIndex(s => s.dataset.titulo === atual);
    if (i < 0) i = 0;
    atual = ps[i].dataset.titulo;
    $$('.qs', f).forEach(s => s.classList.toggle('on', s === ps[i]));
    $('#obs-passo').textContent = `Passo ${i + 1} de ${ps.length}`;
    $('#obs-ptit').textContent = atual;
    $('#obs-pbar').style.width = `${Math.round(100 * (i + 1) / ps.length)}%`;
    ant.hidden = i === 0; seg.hidden = i === ps.length - 1; env.hidden = i !== ps.length - 1;
    if (rolar) { const r = win.getBoundingClientRect(); if (r.top < 0 || r.top > innerHeight * .4) win.scrollIntoView({behavior: 'smooth', block: 'start'});
      const p1 = $('.qs.on input:not([type=hidden]),.qs.on select', f); if (p1) p1.focus({preventScroll: true}); }
  };
  const valido = () => { const s = $('.qs.on', f); if (!s) return true;
    const mau = $$('input,select,textarea', s).find(x => !x.disabled && !x.checkValidity());
    if (mau) { mau.reportValidity(); return false; } return true; };
  const andar = d => { if (d > 0 && !valido()) return; const ps = passos(); let i = ps.findIndex(s => s.dataset.titulo === atual);
    i = Math.max(0, Math.min(ps.length - 1, i + d)); atual = ps[i].dataset.titulo; $('#obs-msg').textContent = ''; mostrar(true); };
  ant.addEventListener('click', () => andar(-1));
  seg.addEventListener('click', () => andar(1));
  f.addEventListener('change', () => mostrar(false)); f.addEventListener('input', actualizar);
  mostrar(false);
  let ja = null; try { ja = localStorage.getItem('atlas-obs-respondido'); } catch (x) {}
  if (ja) { const a = $('#obs-ja'); if (a) { a.hidden = false; a.textContent = `Este navegador já enviou uma resposta a ${fmtData(ja)}. Pedimos que cada arquitecto responda uma única vez.`; } }
  f.addEventListener('submit', async ev => {
    ev.preventDefault();
    if (env.hidden) { andar(1); return; }                   /* Enter a meio do questionário passa ao passo seguinte */
    const msg = $('#obs-msg'); msg.className = 'ob-msg'; msg.textContent = '';
    if (!valido()) return;
    const body = new URLSearchParams();
    body.set('form-name', f.getAttribute('name')); body.set('bot-field', ($('[name="bot-field"]', f) || {}).value || '');
    const grupos = {};
    $$('input,select,textarea', f).forEach(x => {
      if (x.disabled || !x.name || x.name === 'form-name' || x.name === 'bot-field') return;
      if (x.type === 'checkbox' && x.name !== 'declaracao') { if (x.checked) (grupos[x.name] ||= []).push(x.value); return; }
      if ((x.type === 'radio' || x.type === 'checkbox') && !x.checked) return;
      if (String(x.value).trim() !== '') body.set(x.name, String(x.value).trim());
    });
    for (const [k, v] of Object.entries(grupos)) body.set(k, v.join(' | '));
    env.disabled = true; msg.textContent = 'A enviar…';
    try {
      if (!/netlify\.app$|atlas/.test(location.hostname) || location.protocol === 'file:') throw new Error('pré-visualização');
      const r = await fetch('/', {method: 'POST', headers: {'Content-Type': 'application/x-www-form-urlencoded'}, body: body.toString()});
      if (!r.ok) throw new Error('HTTP ' + r.status);
      try { localStorage.setItem('atlas-obs-respondido', new Date().toISOString().slice(0, 10)); } catch (x) {}
      f.hidden = true; $('.qw-h', win).hidden = true; const ok = $('#obs-ok'); ok.hidden = false; win.scrollIntoView({behavior: 'smooth', block: 'start'});
    } catch (x) {
      env.disabled = false; msg.className = 'ob-msg err';
      msg.textContent = x.message === 'pré-visualização' ? 'O envio só funciona no ATLAS publicado (atlas-arquitectura.netlify.app). Nesta pré-visualização o questionário serve apenas para rever as perguntas.'
        : 'Não foi possível enviar a resposta. Tente de novo dentro de momentos.';
    }
  });
}

/* ---------------------------------------------------------------- backoffice */
function descarregar(nome, texto, tipo){
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([texto], {type: tipo})); a.download = nome;
  document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}
const FORA = new Set(['ip', 'user_agent', 'referrer', 'form-name', 'bot-field']);
function csv(O, subs){
  const campos = []; O.questionario.seccoes.forEach(s => s.perguntas.forEach(p => {
    if (p.tipo === 'grid' || p.tipo === 'escala') p.linhas.forEach((l, i) => campos.push([`${p.id}__${i}`, `${p.label} · ${l}`])); else campos.push([p.id, p.label]); }));
  campos.push(['versao', 'Versão do questionário']);
  const q = v => /[;"\n]/.test(v) ? '"' + String(v).replace(/"/g, '""') + '"' : String(v);
  const linhas = [['N.º', 'Data', ...campos.map(c => c[1])].map(q).join(';')];
  subs.forEach(s => linhas.push([s.number, s.created_at.slice(0, 16).replace('T', ' '), ...campos.map(c => s.data[c[0]] ?? '')].map(v => q(v ?? '')).join(';')));
  return '﻿' + linhas.join('\n');
}
async function backoffice(O){
  const box = $('#bo'); if (!box) return;
  const tk = $('#bo-token'), lembra = $('#bo-lembrar'), est = $('#bo-estado'), res = $('#bo-res');
  try { const t = localStorage.getItem('atlas-bo-token'); if (t) { tk.value = t; lembra.checked = true; } } catch (x) {}
  let dados = null;
  const ler = async () => {
    const token = tk.value.trim(); if (!token) { est.textContent = 'Indique a chave de acesso pessoal do Netlify.'; return; }
    try { if (lembra.checked) localStorage.setItem('atlas-bo-token', token); else localStorage.removeItem('atlas-bo-token'); } catch (x) {}
    const H = {Authorization: 'Bearer ' + token};
    est.textContent = 'A ler os formulários…'; res.innerHTML = '';
    try {
      const fr = await fetch(`${API}/sites/${SITE}/forms`, {headers: H});
      if (fr.status === 401) throw new Error('A chave de acesso não foi aceite pelo Netlify.');
      if (!fr.ok) throw new Error('O Netlify respondeu com o erro ' + fr.status + '.');
      const forms = await fr.json(), form = forms.find(x => x.name === O.questionario.form);
      if (!form) throw new Error('O formulário «' + O.questionario.form + '» ainda não existe no Netlify. É criado quando a detecção de formulários está ligada e o site é publicado de novo.');
      const subs = [];
      for (let p = 1; p < 200; p++) {
        est.textContent = `A ler as respostas (${subs.length})…`;
        const r = await fetch(`${API}/forms/${form.id}/submissions?per_page=100&page=${p}`, {headers: H});
        if (!r.ok) throw new Error('O Netlify respondeu com o erro ' + r.status + ' ao ler as respostas.');
        const lote = await r.json(); subs.push(...lote); if (lote.length < 100) break;
      }
      subs.sort((a, b) => a.created_at.localeCompare(b.created_at));
      /* respostas repetidas: o mesmo endereço e o mesmo navegador no mesmo dia (contam só uma vez na compilação) */
      const vistos = new Set(), unicas = [], repetidas = [];
      subs.forEach(s => { const k = [s.data.ip, s.data.user_agent, s.created_at.slice(0, 10)].join('|'); if (s.data.ip && vistos.has(k)) repetidas.push(s); else { vistos.add(k); unicas.push(s); } });
      const comp = compilar(O, unicas.map(s => s.data));
      const hoje = new Date().toISOString().slice(0, 10);
      dados = {subs, unicas, repetidas, comp, hoje, form};
      est.textContent = '';
      res.innerHTML = `<div class="bo-sum"><div class="ob-st"><b class="num">${subs.length}</b><span>respostas recebidas</span></div><div class="ob-st"><b class="num">${unicas.length}</b><span>contam para a compilação</span></div><div class="ob-st"><b class="num">${repetidas.length}</b><span>repetidas (mesmo endereço e navegador, no mesmo dia)</span></div>
<div class="ob-st"><b>${subs.length ? esc(fmtData(subs[0].created_at)) : '–'}</b><span>primeira resposta</span></div></div>
<div class="bo-act"><button class="btn on" type="button" data-bo="site">Descarregar a compilação para o site</button><button class="btn" type="button" data-bo="csv">Descarregar as respostas (CSV)</button><button class="btn" type="button" data-bo="arq">Descarregar o arquivo completo (JSON)</button></div>
<p class="bo-nota">A compilação para o site (observatorio-respostas.json) só tem valores agregados e vai para a pasta data do repositório, onde a página pública a lê. O CSV e o arquivo JSON têm as respostas uma a uma, sem endereços IP nem navegadores, e ficam só consigo.</p>
<h2 class="h2">Compilação, comparada com 2022</h2><div class="ob-grid">${O.blocos.flatMap(b => b.graficos).filter(g => comp[g.id] && comp[g.id].n).map(g => grafico(g, comp[g.id])).join('') || '<p class="empty">Sem respostas para compilar.</p>'}</div>
<h2 class="h2">Últimas respostas</h2><div class="ob-tw"><table class="bo-last"><tr><th>N.º</th><th>Data</th><th>Inscrição</th><th>Região</th><th>Forma principal</th></tr>${subs.slice(-25).reverse().map(s => `<tr><td class="num">${s.number}</td><td>${esc(s.created_at.slice(0, 16).replace('T', ' '))}</td><td>${esc(s.data.inscricao || '')}</td><td>${esc(s.data.regiao || s.data['est-regiao'] || '')}</td><td>${esc(s.data.forma || '')}</td></tr>`).join('')}</table></div>`;
      ajustarSegmentos(res); dica();
    } catch (x) {
      est.textContent = x.message && !/Failed to fetch|NetworkError/.test(x.message) ? x.message : 'Não foi possível ligar ao Netlify a partir deste navegador.';
    }
  };
  $('#bo-ler').addEventListener('click', ler);
  tk.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); ler(); } });
  res.addEventListener('click', e => {
    const b = e.target.closest('[data-bo]'); if (!b || !dados) return;
    const limpa = s => ({n: s.number, data: s.created_at, respostas: Object.fromEntries(Object.entries(s.data).filter(([k]) => !FORA.has(k)))});
    if (b.dataset.bo === 'site') descarregar('observatorio-respostas.json', JSON.stringify({actualizado: dados.hoje, n: dados.unicas.length, versao: O.questionario.versao, graficos: dados.comp}, null, 1) + '\n', 'application/json');
    if (b.dataset.bo === 'csv') descarregar(`observatorio-respostas-${dados.hoje}.csv`, csv(O, dados.subs), 'text/csv;charset=utf-8');
    if (b.dataset.bo === 'arq') descarregar(`observatorio-arquivo-${dados.hoje}.json`, JSON.stringify({gravado: new Date().toISOString(), formulario: O.questionario.form, versao: O.questionario.versao,
      total: dados.subs.length, unicas: dados.unicas.length, compilacao: dados.comp, respostas: dados.subs.map(limpa)}, null, 1), 'application/json');
  });
}

/* ---------------------------------------------------------------- arranque */
(async () => {
  const O0 = snap('snap-observatorio');
  const O = await fresh('observatorio.json', O0);
  if (!O) return;
  if (root.dataset.mode === 'backoffice') { backoffice(O); return; }
  const R = await fresh('observatorio-respostas.json', snap('snap-observatorio-resp'));
  desenharBlocos(O, R);
  questionario();
  if (location.hash) { const t = document.getElementById(location.hash.slice(1)); if (t) setTimeout(() => t.scrollIntoView(), 60); }
})();
})();
