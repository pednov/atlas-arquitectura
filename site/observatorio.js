/* ATLAS · Observatório da profissão (pedido do Pedro, 19 Nov. 2026)
   Questionário aberto (Netlify Forms), gráficos das respostas recolhidas no ATLAS, gráficos do inquérito de 2022 e
   backoffice de recolha e compilação.
   20 Nov. 2026, pedido do Pedro: as respostas ficam guardadas e os gráficos das respostas fazem-se só com o que foi
   enviado pelo questionário desta página, à parte dos resultados de 2022 (sem mistura nem sobreposição).
   Os gráficos de 2022 usam o azul do separador e os das respostas do ATLAS um laranja, com valores escritos e
   tabela em cada gráfico. Sem relação gráfica com o relatório original. */
(function(){
'use strict';
const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
const NF = new Intl.NumberFormat('pt-PT', {maximumFractionDigits: 1});
const pct = v => v == null || isNaN(v) ? '–' : NF.format(v) + '%';
const num = v => v == null || isNaN(v) ? '–' : NF.format(v);
const NF1 = new Intl.NumberFormat('pt-PT', {minimumFractionDigits: 1, maximumFractionDigits: 1});
const nota10 = v => v == null || isNaN(v) ? '–' : NF1.format(v);
const C1 = '#2563A8', C2 = '#C96A1B', C3 = '#2F8F5B', NEUTRO = '#D6D3CC', C1L = '#8DB0DB';   /* C2 só para as respostas do ATLAS; C3, segunda série de 2022 (passa no validador com C1) */
const MINIMO = 5;                         /* respostas a uma pergunta necessárias para o seu gráfico aparecer na página pública */
const minimo = O => (O && O.questionario && O.questionario.minimo) || MINIMO;
const ORIGEM = 'atlas-observatorio';      /* campo escondido do formulário da página do Observatório */
const SITE = 'atlas-arquitectura.netlify.app';
const SITES = [SITE];                     /* endereços do ATLAS de onde as respostas podem vir (juntar aqui um domínio próprio) */
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
/* mapas de calor: uma só cor, do claro para o escuro (azul em 2022, laranja nas respostas do ATLAS);
   o texto de cada célula fica branco ou escuro conforme o que tiver mais contraste com o fundo */
const RAMPA_22 = [[242, 246, 251], [23, 63, 110]], RAMPA_AT = [[254, 246, 238], [238, 160, 92], [138, 62, 12]];
const heatRgb = (v, R) => { const k = Math.pow(Math.min(1, Math.max(0, (v || 0) / 100)), .75) * (R.length - 1), j = Math.min(R.length - 2, Math.floor(k)), t = k - j;
  return R[j].map((x, i) => Math.round(x + (R[j + 1][i] - x) * t)); };
const lum = c => { const f = x => { x /= 255; return x <= .03928 ? x / 12.92 : Math.pow((x + .055) / 1.055, 2.4); }; return .2126 * f(c[0]) + .7152 * f(c[1]) + .0722 * f(c[2]); };
const tinta = c => { const L = lum(c); return 1.05 / (L + .05) > (L + .05) / (lum([27, 27, 27]) + .05) ? '#fff' : '#1b1b1b'; };
function calor(g, s, nome, R = RAMPA_22){
  return `${nome ? `<div class="ob-sl">${esc(nome)}</div>` : ''}<div class="ob-hw"><table class="ob-heat"><thead><tr><th></th>${g.cats.map(c => `<th scope="col">${esc(c)}</th>`).join('')}</tr></thead><tbody>${g.linhas.map((l, i) =>
    `<tr><th scope="row">${esc(l)}</th>${g.cats.map((c, j) => { const v = s.v[i] ? s.v[i][j] : null, rgb = heatRgb(v, R);
      return `<td tabindex="0" style="background:${v == null ? '#fafaf8' : `rgb(${rgb.join(',')})`};color:${v == null ? '#1b1b1b' : tinta(rgb)}" data-tt="${tt(l + ' · ' + c, nome || '', v)}">${v == null ? '' : pct(v)}</td>`; }).join('')}</tr>`).join('')}</tbody></table></div>`;
}
const ESTREITO = matchMedia('(max-width: 620px)');
const deitar = g => ESTREITO.matches && g.cats.length > 5;     /* em ecrãs estreitos, muitas colunas passam a barras deitadas, pela mesma ordem */
function grupos(g, series){
  return (deitar(g) ? barras(g, series) : colunas(g, series)) + legenda(series);
}
function estatisticas(g){
  return `<div class="ob-stats">${g.itens.map(x => `<div class="ob-st"><b>${pct(x.v)}</b><span>${esc(x.l)}</span></div>`).join('')}</div>`;
}
function figura(g, corpo, tab){
  const wide = g.tipo === 'heat' || (g.tipo === 'col' && g.cats.length > 9) || (g.tipo === 'grp' && g.cats.length > 6);
  return `<figure class="ob-card${wide ? ' wide' : ''}" id="g-${esc(g.id)}"><figcaption><h3>${esc(g.q)}</h3>${g.nota ? `<p>${esc(g.nota)}</p>` : ''}</figcaption>${corpo}${tab || ''}</figure>`;
}
function grafico(g){                                 /* inquérito de 2022, só com os valores de 2022 */
  const s22 = {nome: 'Inquérito de 2022', c: C1, v: g.v};
  let corpo = '', series = [s22];
  if (g.tipo === 'stat') corpo = estatisticas(g);
  else if (g.tipo === 'heat') corpo = calor(g, s22, '', RAMPA_22);
  else if (g.tipo === 'grp') { series = g.series.map((n, k) => ({nome: n, c: k ? C3 : C1, v: g.v[k]})); corpo = grupos(g, series); }
  else corpo = g.tipo === 'col' && !deitar(g) ? colunas(g, series) : g.tipo === 'seg' ? segmento(g, series) : barras(g, series);
  return figura(g, corpo, g.tipo === 'stat' ? '' : tabela(g, series));
}

/* ---------------------------------------------------------------- gráficos das respostas do ATLAS: um por pergunta, feitos só com essas respostas */
let MAPA = null, GRAF = null;                       /* pergunta → gráfico de 2022 com as mesmas categorias (só para escolher a forma) */
function formas(O){
  if (MAPA) return; MAPA = {}; GRAF = {};
  O.blocos.forEach(b => b.graficos.forEach(g => GRAF[g.id] = g));
  Object.entries(O.compara || {}).forEach(([gid, cf]) => (Array.isArray(cf) ? cf : [cf]).forEach(f => MAPA[f] = gid));
}
function graficoAtlas(O, p, r, extra){
  formas(O);
  const g22 = GRAF[MAPA[p.id]] || {};
  const s = {nome: 'Respostas no ATLAS', c: C2, v: r.v};
  const nr = `${r.n} ${r.n === 1 ? 'resposta' : 'respostas'}.`;
  const g = {id: 'a-' + p.id, q: p.label};
  let corpo;
  if (p.tipo === 'grid') {
    Object.assign(g, {tipo: 'heat', cats: p.op, linhas: p.linhas, nota: `${nr} Em cada linha, a repartição das respostas pela parte do tempo.`});
    corpo = calor(g, s, '', RAMPA_AT);
  } else if (p.tipo === 'escala') {
    Object.assign(g, {tipo: 'media', max: 10, cats: p.linhas, nota: `${nr} Média de cada acto, de 0 a 10.`});
    corpo = barras(g, [s]);
  } else if (p.tipo === 'check') {
    Object.assign(g, {tipo: 'bar', cats: p.op, ordem: g22.ordem, ultimo: g22.ultimo != null ? g22.ultimo : /^(outr|nenhum)/i.test(p.op[p.op.length - 1]),
      nota: `${nr} Percentagem de quem respondeu, que podia escolher várias opções.`});
    corpo = barras(g, [s]);
  } else {
    const col = g22.tipo === 'col' || g22.tipo === 'grp';
    Object.assign(g, {tipo: col ? 'col' : 'bar', cats: p.op, ordem: g22.tipo === 'bar' ? g22.ordem : true, ultimo: g22.ultimo, nota: nr});
    corpo = col && !deitar(g) ? colunas(g, [s]) : barras(g, [s]);
  }
  if (extra) g.nota += ' ' + extra;
  return figura(g, corpo, tabela(g, [s]));
}
function ajustarSegmentos(box){                      /* a percentagem só fica escrita dentro da parte quando cabe com folga */
  $$('.ob-sp', box).forEach(sp => { const b = sp.firstChild; sp.classList.toggle('nolab', b.scrollWidth + 14 > sp.clientWidth); });
}

/* ---------------------------------------------------------------- respostas: quais contam e como se compilam (igual a scripts/observatorio.py) */
const val = (d, k) => (d[k] == null ? '' : String(d[k])).trim();
const multi = (d, k) => val(d, k).split(/\s*\|\s*|,\s(?=[A-ZÁÉÍÓÚÂÊÔ0-9])/).map(x => x.trim()).filter(Boolean);
const pc = (x, n) => Math.round(1000 * x / n) / 10;
const dist = (vals, op) => { const c = op.map(() => 0); let n = 0;
  vals.forEach(v => { const i = op.indexOf(v); if (i >= 0) { c[i]++; n++; } }); return {n, v: n ? c.map(x => pc(x, n)) : c.map(() => null)}; };
const pergunta = (O, id) => { for (const s of O.questionario.seccoes) for (const p of s.perguntas) if (p.id === id) return p; return null; };
function doAtlas(O, d){
  /* só contam as respostas enviadas pelo questionário da página do Observatório do ATLAS: com o campo de origem do
     formulário, a declaração assinalada, uma situação de inscrição válida e, quando o navegador o indica, vindas dessa página */
  if (val(d, 'origem') !== ORIGEM || val(d, 'declaracao') !== 'sim') return false;
  if (!((pergunta(O, 'inscricao') || {}).op || []).includes(val(d, 'inscricao'))) return false;
  const ref = val(d, 'referrer'); if (!ref) return true;
  const m = ref.match(/^https?:\/\/([^/?#]+)(\/[^?#]*)?/); if (!m) return false;
  const host = m[1].toLowerCase(), path = m[2] || '/';
  return (SITES.includes(host) || SITES.some(h => host.endsWith('--' + h))) && /^\/observatorio(\/(index\.html)?)?$/.test(path);
}
function separar(O, subs){
  /* subs: envios do Netlify, com data e created_at. Põe de parte os que não vieram do questionário do ATLAS e os repetidos
     (o mesmo endereço e o mesmo navegador no mesmo dia, conta só o primeiro) */
  const vistos = new Set(), unicas = [], repetidas = [], fora = [];
  subs.slice().sort((a, b) => a.created_at.localeCompare(b.created_at)).forEach(s => { const d = s.data || {};
    if (!doAtlas(O, d)) { fora.push(s); return; }
    const k = [d.ip, d.user_agent, s.created_at.slice(0, 10)].join('|');
    if (d.ip && vistos.has(k)) repetidas.push(s); else { vistos.add(k); unicas.push(s); } });
  return {unicas, repetidas, fora};
}
function compilar(O, subs){
  /* subs: os dados de cada resposta que conta. Uma entrada por pergunta, {n: quantos responderam, v: valores} */
  const out = {};
  O.questionario.seccoes.forEach(s => s.perguntas.forEach(p => {
    const id = p.id, k = i => `${id}__${i}`;
    if (p.tipo === 'check') {
      const quem = subs.filter(d => multi(d, id).some(x => p.op.includes(x)));
      out[id] = {n: quem.length, v: p.op.map(o => quem.length ? pc(quem.filter(d => multi(d, id).includes(o)).length, quem.length) : null)};
    } else if (p.tipo === 'grid') {
      const quem = subs.filter(d => p.linhas.some((_, i) => p.op.includes(val(d, k(i)))));
      out[id] = {n: quem.length, v: p.linhas.map((_, i) => dist(quem.map(d => val(d, k(i))), p.op).v)};
    } else if (p.tipo === 'escala') {
      const nota = (d, i) => { const x = val(d, k(i)); return p.op.includes(x) ? Number(x) : null; };
      const quem = subs.filter(d => p.linhas.some((_, i) => nota(d, i) != null));
      out[id] = {n: quem.length, v: p.linhas.map((_, i) => { const xs = quem.map(d => nota(d, i)).filter(x => x != null);
        return xs.length ? Math.round(10 * xs.reduce((a, b) => a + b, 0) / xs.length) / 10 : null; })};
    } else if (p.op && p.op.length) out[id] = dist(subs.map(d => val(d, id)), p.op);
  }));
  return out;
}
/* o que vai para a página pública: perguntas com menos respostas do que o mínimo levam só a contagem */
const publico = (O, comp) => Object.fromEntries(Object.entries(comp).map(([k, r]) => [k, r.n >= minimo(O) ? r : {n: r.n, v: null}]));

/* ---------------------------------------------------------------- página pública */
function desenharBlocos(O){                          /* resultados de 2022, à parte */
  const box = $('#obs-blocos'); if (!box) return;
  box.innerHTML = O.blocos.map(b => `<section class="ob-bloco" id="b-${esc(b.id)}"><h2 class="h2">${esc(b.titulo)}</h2>${b.intro ? `<p class="ob-intro">${esc(b.intro)}</p>` : ''}
<div class="ob-grid">${b.graficos.map(g => grafico(g)).join('')}</div></section>`).join('');
  ajustarSegmentos(box);
  const nav = $('#obs-nav');
  if (nav) nav.innerHTML = O.blocos.map(b => `<a class="fb" href="#b-${esc(b.id)}">${esc(b.titulo)}</a>`).join('');
}
function desenharAtlas(O, R){                        /* respostas ao questionário do ATLAS, só elas */
  let box = $('#obs-atlas');
  if (!box) {                                        /* página publicada antes desta versão: a secção cria-se aqui */
    const res = $('#resultados'); if (!res) return;
    const old = $('#obs-resp'); if (old) old.remove();
    const sec = document.createElement('section'); sec.className = 'ob-res ob-atlas'; sec.id = 'respostas';
    sec.innerHTML = '<h2 class="h2">Respostas ao questionário do ATLAS</h2><p class="upd" id="obs-resp"></p><nav class="ob-nav frow" id="obs-anav" aria-label="Partes das respostas"></nav><div id="obs-atlas"></div>';
    res.before(sec); box = $('#obs-atlas');
  }
  const min = minimo(O), n = (R && R.n) || 0, P = (R && R.perguntas) || {};
  const est = $('#obs-resp');
  if (est) est.innerHTML = (n ? `<b class="num">${n}</b> ${n === 1 ? 'resposta guardada' : 'respostas guardadas'}${R.actualizado ? `, ${n === 1 ? 'compilada' : 'compiladas'} a ` + esc(fmtQuando(R.actualizado)) : ''}. ` : 'Ainda não há respostas compiladas. ')
    + `Os gráficos fazem-se só com as respostas enviadas por este questionário, sem mistura com o inquérito de 2022, e cada pergunta aparece quando tiver ${min} respostas, para que ninguém possa ser identificado.`;
  const mostra = p => P[p.id] && P[p.id].v && P[p.id].n >= min;
  const secs = O.questionario.seccoes.map(s => {
    const qs = s.perguntas.filter(mostra); if (!qs.length) return '';
    const falta = s.perguntas.filter(p => p.op && p.op.length && !mostra(p)).length;
    return `<section class="ob-bloco" id="a-${esc(s.id)}"><h2 class="h2">${esc(s.titulo)}</h2><div class="ob-grid">${qs.map(p => graficoAtlas(O, p, P[p.id])).join('')}</div>${falta ? `<p class="ob-falta">${falta === 1 ? 'Outra pergunta desta parte aparece' : `Outras ${falta} perguntas desta parte aparecem`} quando tiverem ${min} respostas.</p>` : ''}</section>`;
  }).filter(Boolean);
  box.innerHTML = secs.length ? secs.join('') : n ? `<p class="ob-falta">Ainda nenhuma pergunta tem ${min} respostas.</p>` : '';
  const nav = $('#obs-anav');
  if (nav) { nav.innerHTML = secs.length > 1 ? O.questionario.seccoes.filter(s => s.perguntas.some(mostra)).map(s => `<a class="fb" href="#a-${esc(s.id)}">${esc(s.titulo)}</a>`).join('') : ''; nav.hidden = secs.length < 2; }
  ajustarSegmentos(box);
}
const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const fmtData = s => { const [y, m, d] = String(s).slice(0, 10).split('-').map(Number); return `${d} de ${MESES[m - 1]} de ${y}`; };
const fmtQuando = s => {                              /* «20 de Novembro de 2026, às 17h41» (hora de Lisboa) quando a data traz a hora */
  if (String(s).length <= 10) return fmtData(s);
  const t = new Date(s); if (isNaN(t)) return fmtData(s);
  const dia = new Intl.DateTimeFormat('en-CA', {timeZone: 'Europe/Lisbon'}).format(t);
  const [h, mi] = new Intl.DateTimeFormat('pt-PT', {timeZone: 'Europe/Lisbon', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'}).format(t).split(':');
  return `${fmtData(dia)}, às ${h}h${mi}`;
};

/* ---------------------------------------------------------------- questionário: no início da página, uma janela de cada vez (pedido do Pedro, 19 Nov. 2026, 01:35) */
function questionario(O){
  const f = $('#obs-form'); if (!f) return;
  const MIN = minimo(O);
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
      f.hidden = true; $('.qw-h', win).hidden = true; const ok = $('#obs-ok'); ok.hidden = false;
      const okp = $('p', ok); if (okp) okp.textContent = `Ficou guardada e entra na compilação seguinte. Nos gráficos das respostas do ATLAS, cada pergunta aparece quando tiver ${MIN} respostas.`;
      win.scrollIntoView({behavior: 'smooth', block: 'start'});
    } catch (x) {
      env.disabled = false; msg.className = 'ob-msg err';
      msg.textContent = x.message === 'pré-visualização' ? 'O envio só funciona no ATLAS publicado (atlas-arquitectura.netlify.app). Nesta pré-visualização o questionário serve apenas para rever as perguntas.'
        : x.message === 'HTTP 404' ? 'O registo das respostas ainda não está activo e esta resposta não foi guardada. As respostas preenchidas continuam no formulário.'
        : 'Não foi possível enviar a resposta. As respostas preenchidas continuam no formulário e pode tentar de novo dentro de momentos.';
    }
  });
}

/* ---------------------------------------------------------------- backoffice */
function descarregar(nome, texto, tipo){
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([texto], {type: tipo})); a.download = nome;
  document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}
const FORA = new Set(['ip', 'user_agent', 'referrer', 'form-name', 'bot-field']);
const ESTADO = {conta: 'Conta', repetida: 'Repetida', fora: 'Fora do questionário do ATLAS'};
function csv(O, linhas){
  const campos = []; O.questionario.seccoes.forEach(s => s.perguntas.forEach(p => {
    if (p.tipo === 'grid' || p.tipo === 'escala') p.linhas.forEach((l, i) => campos.push([`${p.id}__${i}`, `${p.label} · ${l}`])); else campos.push([p.id, p.label]); }));
  campos.push(['versao', 'Versão do questionário']);
  const q = v => /[;"\n]/.test(v) ? '"' + String(v).replace(/"/g, '""') + '"' : String(v);
  const out = [['N.º', 'Data', 'Estado', ...campos.map(c => c[1])].map(q).join(';')];
  linhas.forEach(([s, e]) => out.push([s.number, s.created_at.slice(0, 16).replace('T', ' '), ESTADO[e], ...campos.map(c => (s.data || {})[c[0]] ?? '')].map(v => q(v ?? '')).join(';')));
  return '﻿' + out.join('\n');
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
      for (const estado of ['', 'spam']) {             /* as verificadas e as que o filtro de spam pôs de lado, que passam pela mesma verificação */
        for (let p = 1; p < 200; p++) {
          est.textContent = `A ler as respostas (${subs.length})…`;
          const r = await fetch(`${API}/forms/${form.id}/submissions?per_page=100&page=${p}${estado ? '&state=' + estado : ''}`, {headers: H});
          if (!r.ok) throw new Error('O Netlify respondeu com o erro ' + r.status + ' ao ler as respostas.');
          const lote = await r.json(); subs.push(...lote); if (lote.length < 100) break;
        }
      }
      const vistos = new Set(), todas = subs.filter(s => !vistos.has(s.id) && vistos.add(s.id));
      const {unicas, repetidas, fora} = separar(O, todas);
      const comp = compilar(O, unicas.map(s => s.data || {}));
      const estado = new Map([...unicas.map(s => [s, 'conta']), ...repetidas.map(s => [s, 'repetida']), ...fora.map(s => [s, 'fora'])]);
      const linhas = todas.slice().sort((a, b) => a.created_at.localeCompare(b.created_at)).map(s => [s, estado.get(s)]);
      dados = {linhas, unicas, comp, form, quando: new Date().toISOString().slice(0, 16) + 'Z'};
      est.textContent = '';
      const min = minimo(O), lista = O.questionario.seccoes.flatMap(s => s.perguntas).filter(p => comp[p.id] && comp[p.id].n);
      res.innerHTML = `<div class="bo-sum"><div class="ob-st"><b class="num">${todas.length}</b><span>respostas recebidas</span></div><div class="ob-st"><b class="num">${unicas.length}</b><span>contam para os gráficos</span></div><div class="ob-st"><b class="num">${repetidas.length}</b><span>repetidas (mesmo endereço e navegador, no mesmo dia)</span></div>
<div class="ob-st"><b class="num">${fora.length}</b><span>postas de parte por não virem do questionário do ATLAS</span></div></div>
<div class="bo-act"><button class="btn on" type="button" data-bo="site">Descarregar a compilação para o site</button><button class="btn" type="button" data-bo="csv">Descarregar as respostas (CSV)</button><button class="btn" type="button" data-bo="arq">Descarregar o arquivo completo (JSON)</button></div>
<p class="bo-nota">A compilação para o site (observatorio-respostas.json) só tem valores agregados, e as perguntas com menos de ${min} respostas levam apenas a contagem. Vai para a pasta data do repositório, onde a página pública a lê. O CSV e o arquivo JSON têm as respostas uma a uma, sem endereços de rede nem navegadores, e ficam só consigo.</p>
<h2 class="h2">Compilação das respostas do ATLAS</h2><div class="ob-grid">${lista.map(p => graficoAtlas(O, p, comp[p.id], comp[p.id].n < min ? 'Ainda não aparece na página pública.' : '')).join('') || '<p class="empty">Sem respostas para compilar.</p>'}</div>
<h2 class="h2">Últimas respostas</h2><div class="ob-tw"><table class="bo-last"><tr><th>N.º</th><th>Data</th><th>Estado</th><th>Inscrição</th><th>Região</th><th>Forma principal</th></tr>${linhas.slice(-25).reverse().map(([s, e]) => { const d = s.data || {};
        return `<tr><td class="num">${s.number}</td><td>${esc(s.created_at.slice(0, 16).replace('T', ' '))}</td><td>${esc(ESTADO[e])}</td><td>${esc(d.inscricao || '')}</td><td>${esc(d.regiao || d['est-regiao'] || '')}</td><td>${esc(d.forma || '')}</td></tr>`; }).join('')}</table></div>`;
      ajustarSegmentos(res); dica();
    } catch (x) {
      est.textContent = x.message && !/Failed to fetch|NetworkError/.test(x.message) ? x.message : 'Não foi possível ligar ao Netlify a partir deste navegador.';
    }
  };
  $('#bo-ler').addEventListener('click', ler);
  tk.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); ler(); } });
  res.addEventListener('click', e => {
    const b = e.target.closest('[data-bo]'); if (!b || !dados) return;
    const dia = dados.quando.slice(0, 10);
    const limpa = ([s, e]) => ({n: s.number, data: s.created_at, estado: e, respostas: Object.fromEntries(Object.entries(s.data || {}).filter(([k]) => !FORA.has(k)))});
    if (b.dataset.bo === 'site') descarregar('observatorio-respostas.json', JSON.stringify({actualizado: dados.quando, n: dados.unicas.length, recebidas: dados.linhas.length,
      versao: O.questionario.versao, minimo: minimo(O), perguntas: publico(O, dados.comp)}, null, 1) + '\n', 'application/json');
    if (b.dataset.bo === 'csv') descarregar(`observatorio-respostas-${dia}.csv`, csv(O, dados.linhas), 'text/csv;charset=utf-8');
    if (b.dataset.bo === 'arq') descarregar(`observatorio-arquivo-${dia}.json`, JSON.stringify({gravado: new Date().toISOString(), formulario: O.questionario.form, versao: O.questionario.versao,
      total: dados.linhas.length, contam: dados.unicas.length, compilacao: dados.comp, respostas: dados.linhas.map(limpa)}, null, 1), 'application/json');
  });
}

/* ---------------------------------------------------------------- arranque */
(async () => {
  const O0 = snap('snap-observatorio');
  const O = await fresh('observatorio.json', O0);
  if (!O) return;
  if (root.dataset.mode === 'backoffice') { backoffice(O); return; }
  const R = await fresh('observatorio-respostas.json', snap('snap-observatorio-resp'));
  const desenhar = () => { desenharAtlas(O, R && R.perguntas ? R : null); desenharBlocos(O); };
  desenhar(); dica();
  addEventListener('resize', () => $$('#obs-atlas, #obs-blocos').forEach(ajustarSegmentos));
  ESTREITO.addEventListener('change', desenhar);
  questionario(O);
  if (location.hash) { const t = document.getElementById(location.hash.slice(1)); if (t) setTimeout(() => t.scrollIntoView(), 60); }
})();
})();
