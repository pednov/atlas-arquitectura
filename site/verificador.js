/* ATLAS: verificadores de acessibilidades e de segurança contra incêndio (base de trabalho, 18 Nov. 2026).
   Os PDF são lidos no navegador com o pdf.js e não saem do computador de quem usa.
   As regras vêm de data/verificadores.json (cópia embutida na página e versão mais recente no repositório);
   a legislação citada liga às fichas do SILUC e ao separador Legislação do ATLAS. */
(function(){
const $ = (s, r=document) => r.querySelector(s);
const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const fold = s => String(s||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase();
const root = $('#verif'); if (!root) return;
const KIND = root.dataset.kind;                       // 'acessibilidades' ou 'scie'
const CFG = (() => { try { return JSON.parse($('#atlas-cfg').textContent); } catch(_) { return {}; } })();
const snap = id => { try { return JSON.parse($('#' + id).textContent); } catch(_) { return null; } };
let REG = snap('snap-verif');
let LEX = snap('snap-verif-lex') || {actualizado: '', diplomas: {}};
const SILUC = 'https://www.siluc.pt/siluc/detalhe/';
const LEXPAGE = root.dataset.lex || '../legislacao/';

async function fresh(name, local){
  if (!CFG.data) return local;
  try {
    const r = await fetch(CFG.data + name + '?t=' + Math.floor(Date.now() / 36e5), {cache: 'no-store'});
    if (!r.ok) return local;
    const d = await r.json();
    return (!local || (d.actualizado || '') >= (local.actualizado || '')) ? d : local;
  } catch(_) { return local; }
}
fresh('verificadores.json', REG).then(d => { if (d && d !== REG) { REG = d; if (ULT) avaliarEDesenhar(); } });

/* ---------- leitura dos PDF ---------- */
let PDFJS = null;
async function pdfjs(){
  if (PDFJS) return PDFJS;
  const base = new URL(root.dataset.pdfjs || '../assets/pdfjs/', location.href).href;
  PDFJS = await import(base + 'pdf.min.mjs');
  PDFJS.GlobalWorkerOptions.workerSrc = base + 'pdf.worker.min.mjs';
  return PDFJS;
}
const MAXPAG = 150;
async function lerPDF(file, aviso){
  const L = await pdfjs();
  const pdf = await L.getDocument({data: new Uint8Array(await file.arrayBuffer())}).promise;
  const N = Math.min(pdf.numPages, MAXPAG), pages = [];
  for (let i = 1; i <= N; i++) {
    const pg = await pdf.getPage(i);
    const tc = await pg.getTextContent();
    const items = tc.items.filter(it => it.str && it.str.trim()).map(it => ({
      s: it.str, f: fold(it.str), x: it.transform[4], y: it.transform[5], h: Math.abs(it.transform[3]) || Math.hypot(it.transform[2], it.transform[3]) || 8,
      w: it.width || 0, hh: it.height || 0}));
    const ord = items.slice().sort((a, b) => (b.y - a.y) || (a.x - b.x));
    const linhas = []; let cur = null;
    for (const it of ord) {
      if (cur && Math.abs(cur.y - it.y) <= Math.max(2, Math.min(cur.h, it.h) * 0.45)) cur.t.push(it.s);
      else { cur = {y: it.y, h: it.h, t: [it.s]}; linhas.push(cur); }
    }
    const texto = linhas.map(l => l.t.join(' ').replace(/\s+/g, ' ').trim()).join('\n');
    pages.push({n: i, items, texto});
    pg.cleanup();
    if (aviso) aviso(i, N);
  }
  const chars = pages.reduce((a, p) => a + p.texto.length, 0);
  return {nome: file.name, total: pdf.numPages, lidas: N, pages, temTexto: chars > 40 * N, pdf};
}

/* frases da memória, com a página e o texto original (para citar) e dobrado (para procurar) */
function frases(doc){
  const out = [];
  for (const p of doc.pages) {
    const t = p.texto.replace(/-\n(?=[a-zà-ú])/g, '').replace(/\n+/g, ' ').replace(/\s+/g, ' ');
    for (const s of t.split(/(?<=[.;!?])\s+(?=[A-ZÁÉÍÓÚÂÊÔÃÕÇ0-9«"(•\-])/)) {
      const o = s.trim(); if (o.length < 4) continue;
      out.push({pag: p.n, o, f: fold(o)});
    }
  }
  return out;
}

/* ---------- números ---------- */
function num(s, milhares){
  s = String(s).trim();
  if (s.includes('.') && s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  else if (s.includes(',')) s = s.replace(',', '.');
  else if (milhares && /^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  return parseFloat(s);
}
const RX = {
  len: /(?<![\d.,+\-])(\d{1,3}(?:[.,]\d{1,3})?)\s*(mm|cm|metros?|m)(?![²³23a-z])/g,
  pct: /(\d{1,2}(?:[.,]\d{1,2})?)\s*%/g,
  ratio: /\b1\s*[:\/]\s*(\d{1,2})\b/g,
  area: /(\d{1,3}(?:[. ]?\d{3})*(?:,\d{1,2})?|\d+(?:[.,]\d{1,2})?)\s*m(?:²|2)(?!\d)/g,
  dim2: /(\d{1,2}(?:[.,]\d{1,3})?)\s*(cm|m)?\s*[x×]\s*(\d{1,2}(?:[.,]\d{1,3})?)\s*(cm|m)?/g,
  fogo: /\b(rei|re|r)\s?(15|30|45|60|90|120|180|240)\b/g,
  int: /(\d{1,3})\s*(degraus|pessoas|ocupantes|utentes|lugares|saidas|up\b|unidades de passagem)/g,
  solto: /(?<![\d.,+\-])(\d{1,2}[.,]\d{2})(?![\d.,%²])/g,
};
const UN = {mm: 0.001, cm: 0.01, m: 1, metro: 1, metros: 1};
function valores(tipo, f){
  const out = [];
  const add = (v, i, extra) => { if (isFinite(v)) out.push(Object.assign({v, i}, extra || {})); };
  if (tipo === 'len') for (const m of f.matchAll(RX.len)) { const v = num(m[1]) * (UN[m[2]] || 1); if (v > 0 && v < 200) add(v, m.index); }
  if (tipo === 'pct') {
    for (const m of f.matchAll(RX.pct)) { const v = num(m[1]); if (v > 0 && v <= 40) add(v, m.index); }
    for (const m of f.matchAll(RX.ratio)) { const n = +m[1]; if (n >= 5 && n <= 30) add(Math.round(1000 / n) / 10, m.index); }
  }
  if (tipo === 'area') for (const m of f.matchAll(RX.area)) add(num(m[1].replace(/ /g, ''), true), m.index);
  if (tipo === 'dim2') for (const m of f.matchAll(RX.dim2)) {
    const k1 = m[2] === 'cm' || (!m[2] && m[4] === 'cm') ? 0.01 : 1, k2 = m[4] === 'cm' ? 0.01 : k1;
    const a = num(m[1]) * k1, b = num(m[3]) * k2;
    if (a > 0.3 && b > 0.3 && a < 30 && b < 30) add(Math.min(a, b), m.index, {d: [Math.min(a, b), Math.max(a, b)]});
  }
  if (tipo === 'fogo') for (const m of f.matchAll(RX.fogo)) add(+m[2], m.index, {cls: m[1].toUpperCase()});
  if (tipo === 'int') for (const m of f.matchAll(RX.int)) add(+m[1], m.index, {u: m[2]});
  return out;
}
/* valor mais próximo da palavra-chave na mesma frase (de preferência a seguir a ela) */
function proximo(vals, k0, k1, alcance){
  let best = null, bd = Infinity;
  for (const v of vals) {
    const d = v.i >= k1 ? (v.i - k1) : (k0 - v.i) * 1.6;
    if (d < bd && d <= (alcance || 110)) { bd = d; best = v; }
  }
  return best;
}
const fmtN = (v, casas) => (Math.round(v * 100) / 100).toLocaleString('pt-PT', {minimumFractionDigits: casas ?? (v % 1 ? 2 : 0), maximumFractionDigits: 2});
const fmtV = (tipo, x) => tipo === 'pct' ? fmtN(x.v, x.v % 1 ? 1 : 0) + ' %' : tipo === 'area' ? fmtN(x.v) + ' m²' : tipo === 'dim2' ? x.d.map(d => fmtN(d)).join(' × ') + ' m'
  : tipo === 'fogo' ? `${x.cls} ${x.v}` : tipo === 'int' ? String(x.v) : fmtN(x.v) + ' m';
const corta = (s, n) => s.length > n ? s.slice(0, n - 1).replace(/\s+\S*$/, '') + '…' : s;

/* procura de um parâmetro na memória (frases) e nas peças desenhadas (textos próximos) */
const posDe = it => ({x: it.x, y: it.y, w: it.w || it.s.length * it.h * 0.5, h: it.hh || it.h});
function recolher(p, D){
  const ev = {mem: [], des: [], refs: [], hits: []};
  const rx = new RegExp(p.chave, 'g');
  for (const fr of D.fr) {
    rx.lastIndex = 0; const ms = [...fr.f.matchAll(rx)]; if (!ms.length) continue;
    ev.refs.push({doc: 'mem', pag: fr.pag, ex: fr.o});
    if (p.tipo === 'presenca') continue;
    const vs = valores(p.tipo, fr.f);
    if (p.tipo === 'fogo') { vs.forEach(x => ev.mem.push(Object.assign(x, {pag: fr.pag, ex: fr.o, f: fr.f}))); continue; }
    let v = null, bd = Infinity;
    for (const m of ms) { const c = proximo(vs, m.index, m.index + m[0].length); if (c) { const d = c.i >= m.index + m[0].length ? c.i - m.index - m[0].length : (m.index - c.i) * 1.6; if (d < bd) { bd = d; v = c; } } }
    if (v) ev.mem.push(Object.assign(v, {pag: fr.pag, ex: fr.o, f: fr.f}));
  }
  if (D.des && p.desenho !== 'nao') {
    const rxd = new RegExp(p.rotulo ? p.chave + '|' + p.rotulo : p.chave, 'g');   /* no desenho conta também o nome do espaço («CIRCULAÇÃO», «I.S.») */
    for (const pg of D.des.pages) {
      const its = pg.items;
      const hits = its.filter(it => { rx.lastIndex = 0; return rx.test(it.f); });
      const rots = p.rotulo ? its.filter(it => { rxd.lastIndex = 0; return rxd.test(it.f); }) : hits;
      if (hits.length) ev.refs.push({doc: 'des', pag: pg.n, ex: hits[0].s});
      rots.slice(0, 4).forEach(h => ev.hits.push({pag: pg.n, pos: posDe(h), s: h.s}));
      if (p.tipo === 'presenca') continue;
      if (p.desenho === 'vao') {
        for (const it of its) for (const m of it.f.matchAll(RX.dim2)) {
          const a = num(m[1]) * (m[2] === 'cm' ? 0.01 : 1), b = num(m[3]) * (m[4] === 'cm' ? 0.01 : 1);
          if (a >= 0.5 && a <= 2.6 && b >= 1.9 && b <= 2.7) ev.des.push({v: a, pag: pg.n, ex: it.s, pos: posDe(it)});
        }
        continue;
      }
      if (p.tipo === 'pct' && p.desenho === 'pct') {
        const temRampa = hits.length || its.some(it => /rampa/.test(it.f));
        if (!temRampa) continue;
        for (const it of its) {
          const perto = /\bi\s*=/.test(it.f) || hits.some(h => Math.hypot(h.x - it.x, h.y - it.y) < 220);
          if (!perto) continue;
          for (const x of valores('pct', it.f)) ev.des.push({v: x.v, pag: pg.n, ex: it.s, pos: posDe(it)});
        }
        continue;
      }
      for (const h of hits) {
        const raio = Math.max(90, h.h * 12);
        let best = null, bd = Infinity;
        for (const it of its) {
          if (it === h) { for (const x of valores(p.tipo, it.f)) { best = {v: x.v, d: x.d, cls: x.cls, ex: it.s, pos: posDe(it)}; bd = 0; } continue; }
          /* mais perto na mesma linha do que em linhas diferentes; legendas de vãos («0,90x2,10») e áreas não contam como cotas soltas */
          const dx = Math.abs(h.x + (h.w || 0) - it.x), dy = Math.abs(h.y - it.y);
          const naLinha = dy < h.h * 0.8 && dx < raio * 2.5;
          const d = naLinha ? dx * 0.5 : Math.hypot(h.x - it.x, (h.y - it.y) * 1.5);
          if ((!naLinha && d > raio) || d >= bd) continue;
          let xs = valores(p.tipo, it.f);
          if (!xs.length && p.tipo === 'len' && !RX.dim2.test(it.f) && !/m2|m²|\ba\s*=/.test(it.f)) xs = [...it.f.matchAll(RX.solto)].map(m => ({v: num(m[1])})).filter(x => x.v >= 0.2 && x.v <= 20);
          RX.dim2.lastIndex = 0;
          if (!xs.length && p.vaoPerto) for (const m of it.f.matchAll(RX.dim2)) {      /* «vão 0,80x2,20» junto à legenda da entrada */
            const a = num(m[1]) * (m[2] === 'cm' ? 0.01 : 1), b = num(m[3]) * (m[4] === 'cm' ? 0.01 : 1);
            if (a >= 0.5 && a <= 2.6 && b >= 1.9 && b <= 2.7) { xs = [{v: a}]; break; }
          }
          if (xs.length) { best = {v: xs[0].v, d: xs[0].d, cls: xs[0].cls, ex: h.s + ' … ' + it.s, pos: posDe(it)}; bd = d; }
        }
        if (best) ev.des.push(Object.assign(best, {pag: pg.n}));
      }
    }
  }
  return ev;
}

/* ---------- contexto (lido na memória, corrigível no formulário) ---------- */
const NUMS = {um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5, seis: 6};
function contexto(D){
  const t = D.todo, c = {};
  if (KIND === 'acessibilidades') {
    const pub = /comercio|servicos|restaura|escola|hotel|equipamento|\bloja|escritorio|clinica|estabelecimento|recebe(m)? publico|museu|biblioteca|ginasio/.test(t);
    const hab = /habitac|\bfogos?\b|moradia|habitacional|\bt[0-6]\b/.test(t);
    if (pub || hab) c.tipo = pub && hab ? 'misto' : pub ? 'publico' : 'habitacao';
    c.obra = /\b(alteracao|ampliacao|reabilitacao|conservacao|remodelacao|reconstrucao)\b/.test(t) ? 'alteracao' : (D.fr.length ? 'nova' : '');
    return c;
  }
  let m = /utilizac(?:ao|oes)[- ]tipo\s+([ivx]{1,4})\b/.exec(t) || /\but[- ]?([ivx]{1,4})\b/.exec(t);
  if (m) c.ut = m[1].toUpperCase();
  m = /\b([1-4])\s*\.?\s*[ªa]?\s*categoria de risco/.exec(t) || /categoria de risco\s*(?:e|:|-)?\s*(?:a\s*)?([1-4])/.exec(t);
  if (m) c.catDecl = +m[1];
  m = /altura (?:da utilizacao[- ]tipo|da ut|do edificio)[^.\d]{0,40}?(\d{1,3}(?:[.,]\d{1,2})?)\s*m\b/.exec(t);
  if (m) c.altura = num(m[1]);
  m = /(\d|um|uma|dois|duas|tres|quatro|cinco|seis)\s+pisos? (?:abaixo|enterrados?|em cave|subterraneos?)/.exec(t);
  if (m) c.abaixo = NUMS[m[1]] ?? +m[1]; else if (/\bcaves?\b/.test(t)) c.abaixo = 1;
  m = /efe(?:c)?tivo(?: total| maximo| previsto| da utilizacao[- ]tipo)?[^.\d]{0,40}?(\d{1,3}(?:[. ]?\d{3})*|\d+)\s*(?:pessoas|ocupantes|utentes)?/.exec(t);
  if (m) c.efectivo = num(m[1].replace(/ /g, ''), true);
  m = /area bruta[^.\d]{0,40}?(\d{1,3}(?:[. ]?\d{3})*(?:,\d{1,2})?|\d+(?:[.,]\d{1,2})?)\s*m(?:²|2)/.exec(t);
  if (m) c.area = num(m[1].replace(/ /g, ''), true);
  return c;
}

/* ---------- avaliação ---------- */
const ST = {nok: 'Não cumpre', rev: 'A verificar', nd: 'Não demonstrado', ok: 'Cumpre', na: 'Sem elementos'};
const ORD = ['nok', 'rev', 'nd', 'ok', 'na'];
const fonte = x => x.doc === 'des' || x.src === 'des' ? `peças desenhadas, p. ${x.pag}` : `memória, p. ${x.pag}`;
function viola(p, v){
  if (p.tipo === 'dim2') { const [a, b] = p.min.slice().sort((x, y) => x - y); return v.d && (v.d[0] < a - 1e-6 || v.d[1] < b - 1e-6); }
  return (p.min != null && v.v < p.min - 1e-6) || (p.max != null && v.v > p.max + 1e-6);
}
function avaliaFaixas(p, v, ctx){
  for (const [lim, st, nota, cond] of p.faixas) if (v.v <= lim + 1e-6) {
    if (st === 'alt') return ctx.obra === 'alteracao' ? {st: 'rev', nota} : {st: 'nok', nota: 'Acima do admitido em construção nova. ' + nota};
    if (cond && v.f) {
      const m = new RegExp(cond.chave).exec(v.f);
      if (m) { const c = proximo(valores('len', v.f), m.index, m.index + m[0].length, 60);
        if (c && c.v <= cond.max + 1e-6) return {st: 'ok', nota: cond.nota.replace('{v}', fmtV('len', c))}; }
    }
    return {st, nota};
  }
  return {st: 'nok', nota: ''};
}
function generico(p, D, ctx){
  const ev = recolher(p, D);
  const r = {p, ev};
  if (p.tipo === 'presenca') {
    const ref = ev.refs.find(x => x.doc === 'mem') || ev.refs[0];
    return ref ? Object.assign(r, {st: 'ok', achado: 'Referido', ref}) : Object.assign(r, {st: 'nd'});
  }
  const julga = (lista, src) => {
    if (!lista.length) return null;
    if (p.faixas) {
      const pior = lista.reduce((a, b) => b.v > a.v ? b : a);
      const f = avaliaFaixas(p, pior, ctx);
      const st = src === 'des' && f.st === 'nok' ? 'rev' : f.st;
      const maus = src === 'des' ? lista.filter(v => avaliaFaixas(p, v, ctx).st !== 'ok') : [];
      return {st, achado: fmtV(p.tipo, pior), ref: Object.assign({doc: src}, pior), nota: f.nota, desMaus: maus};
    }
    const maus = lista.filter(v => viola(p, v));
    if (maus.length) {
      const pior = p.max != null && p.min == null ? maus.reduce((a, b) => b.v > a.v ? b : a) : maus.reduce((a, b) => b.v < a.v ? b : a);
      return {st: src === 'des' ? 'rev' : 'nok', achado: fmtV(p.tipo, pior), ref: Object.assign({doc: src}, pior),
              nota: src === 'des' ? 'Valor lido nas peças desenhadas, a confirmar.' : '', desMaus: src === 'des' ? maus : []};
    }
    const x = lista[0];
    return {st: 'ok', achado: fmtV(p.tipo, x) + (lista.length > 1 ? ` (${lista.length} referências)` : ''), ref: Object.assign({doc: src}, x)};
  };
  const m = julga(ev.mem, 'mem'), d = julga(ev.des, 'des');
  if (m && d && ORD.indexOf(d.st) < ORD.indexOf(m.st)) return Object.assign(r, d, {nota: 'A memória indica ' + m.achado + ', mas as peças desenhadas mostram ' + d.achado + '. ' + (d.nota || '')});
  if (m) return Object.assign(r, m, d && d.desMaus && d.desMaus.length ? {desMaus: d.desMaus} : {});   /* na planta, o sítio onde o desenho mostra a falha */
  if (d) return Object.assign(r, d);
  if (ev.refs.length) return Object.assign(r, {st: 'nd', nota: 'Referido sem valor.', ref: ev.refs.find(x => x.doc === 'mem') || ev.refs[0]});
  return Object.assign(r, {st: 'nd'});
}

const ROM = ['I','II','III','IV','V','VI','VII','VIII','IX','X','XI','XII'];
function categoria(ctx){
  const crit = REG.scie.categorias[ctx.ut];
  if (!ctx.ut) return {cat: null, falta: ['utilização-tipo']};
  if (!crit) return {cat: null, manual: true};
  const NOMES = {altura: 'altura', abaixo: 'pisos abaixo do plano de referência', efectivo: 'efectivo', efectivoDE: 'efectivo em locais de risco D ou E',
                 efectivoE: 'efectivo em locais de risco E', area: 'área bruta'};
  let cat = 1; const falta = [], porque = [];
  for (const [k, lim] of Object.entries(crit)) {
    const v = ctx[k];
    if (v == null || isNaN(v)) { falta.push(NOMES[k]); continue; }
    let c = 4; for (let i = 0; i < 3; i++) if (v <= lim[i]) { c = i + 1; break; }
    if (c > cat) cat = c;
    porque.push(`${NOMES[k]} ${fmtN(v)}${k === 'altura' ? ' m' : k === 'area' ? ' m²' : ''}: ${c}.ª`);
  }
  return {cat, falta, porque};
}
const nUP = e => e <= 50 ? 1 : e <= 500 ? Math.ceil(e / 100) + 1 : Math.ceil(e / 100);
const largUP = n => n === 1 ? 0.9 : n === 2 ? 1.4 : Math.round(n * 0.6 * 100) / 100;
const nSaidas = e => e <= 50 ? 1 : e <= 1500 ? Math.ceil(e / 500) + 1 : e <= 3000 ? Math.ceil(e / 500) : 6;
const CALC = {
  categoria(p, D, ctx){
    const k = categoria(ctx), r = {p, ev: {refs: []}};
    if (k.manual) return Object.assign(r, {st: ctx.catDecl ? 'rev' : 'nd', achado: ctx.catDecl ? `${ctx.catDecl}.ª declarada` : '',
      nota: `O cálculo para a utilização-tipo ${ctx.ut} ainda não está nesta versão; confirme a categoria declarada.`});
    if (!k.cat || k.falta.includes('utilização-tipo')) return Object.assign(r, {st: 'nd', nota: 'Indique a utilização-tipo no formulário.'});
    const calc = `${k.cat}.ª calculada (${k.porque.join('; ')})` + (k.falta.length ? `, sem ${k.falta.join(' nem ')}` : '');
    if (ctx.catDecl && ctx.catDecl < k.cat) return Object.assign(r, {st: 'nok', achado: `${ctx.catDecl}.ª declarada`, nota: calc});
    if (!ctx.catDecl) return Object.assign(r, {st: 'rev', achado: calc, nota: 'A memória não declara a categoria de risco.' + (k.falta.length ? ' Com os dados em falta a categoria pode ser mais alta.' : '')});
    return Object.assign(r, {st: k.falta.length ? 'rev' : 'ok', achado: `${ctx.catDecl}.ª declarada, ${calc}`, nota: k.falta.length ? 'Com os dados em falta a categoria pode ser mais alta.' : ''});
  },
  peca(p, D, ctx){
    const k = categoria(ctx), cat = k.cat || ctx.catDecl, r = {p, ev: {refs: []}};
    const t = D.todo, ficha = /ficha de seguranca/.test(t), proj = /proje(c)?to de (especialidade de )?(scie|seguranca contra incendio)/.test(t);
    if (!cat || !ctx.ut) return Object.assign(r, {st: 'nd', nota: 'Depende da utilização-tipo e da categoria de risco.'});
    const basta = cat === 1 && !['IV', 'V'].includes(ctx.ut);
    if (basta) return Object.assign(r, {st: ficha || proj ? 'ok' : 'nd', achado: ficha ? 'Ficha de segurança referida' : proj ? 'Projecto de SCIE referido' : '', nota: 'Basta a ficha de segurança (1.ª categoria).'});
    if (proj) return Object.assign(r, {st: 'ok', achado: 'Projecto de SCIE referido'});
    return Object.assign(r, {st: ficha ? 'nok' : 'nd', achado: ficha ? 'Só ficha de segurança' : '', nota: `Com a ${cat}.ª categoria de risco exige-se projecto de especialidade de SCIE.`});
  },
  acesso(p, D, ctx){
    if (ctx.altura == null) { const g = generico(Object.assign({}, p, {tipo: 'len', min: 3.5}), D, ctx); g.nota = [g.nota, 'Indique a altura para saber se a largura exigida é 3,5 m ou 6 m.'].filter(Boolean).join(' '); return g; }
    const min = ctx.altura <= 9 ? 3.5 : 6;
    const g = generico(Object.assign({}, p, {tipo: 'len', min}), D, ctx);
    g.exige = `Largura útil não inferior a ${fmtN(min, 1)} m (altura ${ctx.altura <= 9 ? 'até' : 'acima de'} 9 m)`;
    return g;
  },
  faixa(p, D, ctx){
    if (ctx.altura != null && ctx.altura <= 9) return {p, ev: {refs: []}, st: 'na', nota: 'Só é exigida acima de 9 m de altura.'};
    return generico(Object.assign({}, p, {tipo: 'len', min: 7}), D, ctx);
  },
  rf(p, D, ctx){
    const k = categoria(ctx), cat = k.cat || ctx.catDecl;
    const tab = REG.scie.rf[ctx.ut] || REG.scie.rf.base;
    const ev = recolher(Object.assign({}, p, {tipo: 'fogo', desenho: 'nao'}), D);
    const r = {p, ev};
    if (!cat) return Object.assign(r, {st: ev.mem.length ? 'rev' : 'nd', achado: ev.mem.map(x => `${x.cls} ${x.v}`).slice(0, 4).join(', '), nota: 'Sem categoria de risco não se sabe a classe exigida.'});
    const req = tab[cat - 1];
    r.exige = `R ${req} (só suporte) ou REI ${req} (suporte e compartimentação), utilização-tipo ${ctx.ut || '?'}, ${cat}.ª categoria`;
    const estr = ev.mem.filter(x => /estrutur|pilar|viga|laje|pavimento|parede/.test(fold(x.ex)));
    const lista = estr.length ? estr : ev.mem;
    if (!lista.length) return Object.assign(r, {st: 'nd'});
    const pior = lista.reduce((a, b) => b.v < a.v ? b : a);
    if (pior.v < req) return Object.assign(r, {st: estr.length ? 'nok' : 'rev', achado: `${pior.cls} ${pior.v}`, ref: Object.assign({doc: 'mem'}, pior)});
    return Object.assign(r, {st: 'ok', achado: `${pior.cls} ${pior.v}`, ref: Object.assign({doc: 'mem'}, pior)});
  },
  saidas(p, D, ctx){
    const r = {p, ev: {refs: []}};
    if (!ctx.efectivo) return Object.assign(r, {st: 'nd', nota: 'Indique o efectivo para calcular o número de saídas.'});
    const req = nSaidas(ctx.efectivo);
    r.exige = `${req} ${req === 1 ? 'saída' : 'saídas'} para ${fmtN(ctx.efectivo, 0)} pessoas (quadro XXIX), em cada local`;
    let achado = 0, ref = null;
    for (const fr of D.fr) for (const m of fr.f.matchAll(/\b(\d|uma|duas|tres|quatro|cinco|seis)\s+saidas\b/g)) {
      const n = NUMS[m[1]] ?? +m[1]; if (n > achado) { achado = n; ref = {doc: 'mem', pag: fr.pag, ex: fr.o}; }
    }
    if (!achado) return Object.assign(r, {st: 'nd'});
    return Object.assign(r, {st: achado >= req ? 'ok' : 'rev', achado: `${achado} saídas`, ref, nota: achado >= req ? '' : 'Confirme por local; o efectivo indicado é o total.'});
  },
  up(p, D, ctx){
    const r = {p, ev: {refs: []}};
    if (!ctx.efectivo) return Object.assign(r, {st: 'nd', nota: 'Indique o efectivo para calcular as unidades de passagem.'});
    let n = nUP(ctx.efectivo); if (ctx.efectivo >= 200) n = Math.max(n, 2);
    r.exige = `${n} UP no conjunto das saídas de cada local para ${fmtN(ctx.efectivo, 0)} pessoas (quadro XXXI), ou seja ${fmtN(largUP(n))} m numa só saída`;
    let achado = 0, ref = null;
    for (const fr of D.fr) for (const m of fr.f.matchAll(/(\d{1,2})\s*(?:up\b|unidades? de passagem)/g)) {
      const ns = /\b(\d|duas|tres|quatro|cinco|seis)\s+saidas\b/.exec(fr.f);           /* «duas saídas, com 1 UP cada» */
      const k = ns && /\bcada\b/.test(fr.f) ? (NUMS[ns[1]] ?? +ns[1]) : 1;
      const tot = +m[1] * k;
      if (tot > achado) { achado = tot; ref = {doc: 'mem', pag: fr.pag, ex: fr.o}; }
    }
    if (!achado) {
      const g = generico(Object.assign({}, p, {tipo: 'len', min: largUP(n), chave: 'largura (util )?(da|das|dos) (saida|caminho|via)s? de evacuacao|caminhos? de evacuacao.{0,40}largura'}), D, ctx);
      g.exige = r.exige; return g;
    }
    return Object.assign(r, {st: achado >= n ? 'ok' : 'rev', achado: `${achado} UP`, ref, nota: achado >= n ? '' : 'Confirme por local e por saída; o efectivo indicado é o total.'});
  },
  dist(p, D, ctx){
    const ev = recolher(Object.assign({}, p, {tipo: 'len', desenho: 'nao'}), D), r = {p, ev};
    if (!ev.mem.length) return Object.assign(r, {st: ev.refs.length ? 'nd' : 'nd', nota: ev.refs.length ? 'Referido sem valor.' : '', ref: ev.refs[0]});
    let pior = null, st = 'ok', nota = '';
    for (const x of ev.mem) {
      const imp = /impasse/.test(fold(x.ex)), lim = imp ? 15 : 30;
      if (x.v > lim + 1e-6) {
        const s2 = imp || x.v > 45 ? 'nok' : 'rev';
        if (ORD.indexOf(s2) < ORD.indexOf(st)) { st = s2; pior = x; nota = imp ? 'Em impasse o máximo é 15 m.' : 'Acima de 30 m só nas condições do n.º 3 (até 45 m).'; }
      }
    }
    pior = pior || ev.mem[0];
    return Object.assign(r, {st, achado: fmtV('len', pior), ref: Object.assign({doc: 'mem'}, pior), nota});
  },
  portas(p, D, ctx){
    const r = {p, ev: {refs: []}};
    if (ctx.efectivo != null && ctx.efectivo <= 50) return Object.assign(r, {st: 'na', nota: 'Só para portas utilizáveis por mais de 50 pessoas.'});
    return generico(Object.assign({}, p, {tipo: 'presenca'}), D, ctx);
  },
  viasvert(p, D, ctx){
    const g = generico(Object.assign({}, p, {tipo: 'presenca'}), D, ctx);
    if (ctx.altura != null && ctx.altura > 28) {
      const duas = /\b(duas|2|tres|3)\s+(escadas|vias verticais)/.test(D.todo);
      if (!duas) return Object.assign(g, {st: g.st === 'ok' ? 'rev' : 'nd', nota: 'Acima de 28 m exigem-se pelo menos duas vias verticais de evacuação.'});
    }
    return g;
  },
  extint(p, D, ctx){
    const g = generico(Object.assign({}, p, {tipo: 'presenca'}), D, ctx);
    if (ctx.area) g.nota = `Para ${fmtN(ctx.area, 0)} m² de área bruta, contam-se pelo menos ${Math.ceil(ctx.area / 200)} extintores (um por cada 200 m² de piso).`;
    return g;
  },
};
function avaliar(D, ctx){
  const sec = REG[KIND];
  const out = [];
  for (const p of sec.parametros) {
    if (p.aplica && ctx.tipo && ctx.tipo !== 'misto' && !p.aplica.includes(ctx.tipo)) continue;
    if (p.existe && !new RegExp(p.existe).test(D.todo)) { out.push({p, st: 'na', nota: 'Sem referência no projecto.', ev: {refs: []}}); continue; }
    out.push(p.calc ? CALC[p.calc](p, D, ctx) : generico(p, D, ctx));
  }
  return out;
}

/* ---------- relatório ---------- */
function lexInfo(id){
  const d = (LEX.diplomas || {})[id]; if (!d) return null;
  return d;
}
function lexNome(d){ return d ? `${d.tipo} ${d.num}` : ''; }
function normaHTML(p){
  const d = lexInfo(p.lex);
  const nome = d ? lexNome(d) : '';
  const q = d ? encodeURIComponent(d.num) : '';
  return `<div class="vn"><span>${esc(nome)}${nome ? ', ' : ''}${esc(p.norma)}</span>${d ? `<a href="${SILUC}${esc(d.id)}" target="_blank" rel="noopener">Ficha no SILUC ↗</a><a href="${esc(LEXPAGE)}#q=${q}">Na Legislação do ATLAS</a>` : ''}</div>`;
}
function itemHTML(r){
  const p = r.p, ref = r.ref;
  const ex = ref && ref.ex ? `<blockquote>«${esc(corta(ref.ex, 260))}» <cite>${esc(fonte(ref))}</cite></blockquote>` : '';
  const mk = r.marca ? `<span class="vmk" title="Assinalado na planta com o n.º ${r.marca}">${r.marca}</span>` : '';
  return `<li class="vr" data-st="${r.st}"><div class="vrh"><span class="vst">${ST[r.st]}</span>${mk}<b>${esc(p.nome)}</b><span class="vg">${esc(p.grupo)}</span></div>
<dl class="vx"><div><dt>Exigido</dt><dd>${esc(r.exige || p.exige)}</dd></div>${r.achado ? `<div><dt>No projecto</dt><dd>${esc(r.achado)}</dd></div>` : ''}${r.nota ? `<div><dt>Nota</dt><dd>${esc(r.nota)}</dd></div>` : ''}</dl>
${ex}${normaHTML(p)}</li>`;
}
let ULT = null;   // última leitura: {D, ctxLido}
function lerFormulario(){
  const c = {};
  $$('[data-ctx]', root).forEach(el => { const k = el.dataset.ctx, v = el.value.trim(); if (v === '') return; c[k] = el.type === 'number' ? Number(v.replace(',', '.')) : v; });
  if (c.catDecl) c.catDecl = Number(c.catDecl);
  return c;
}
function preencher(lido){
  $$('[data-ctx]', root).forEach(el => {
    const k = el.dataset.ctx;
    if (lido[k] == null || el.dataset.tocado) return;
    el.value = String(lido[k]).replace('.', el.type === 'number' ? '.' : '.');
    el.classList.add('auto'); el.title = 'Lido na memória descritiva';
  });
}
function mostraCategoria(){
  const b = $('#v-cat'); if (!b || KIND !== 'scie') return;
  const ctx = lerFormulario(), k = categoria(ctx);
  b.innerHTML = k.manual ? 'Categoria de risco: indicar' : k.cat ? `Categoria de risco calculada: <b>${k.cat}.ª</b>${k.falta.length ? ' (faltam dados)' : ''}` : 'Categoria de risco: indique a utilização-tipo';
}
function avaliarEDesenhar(){
  if (!ULT) return;
  const ctx = lerFormulario();
  const res = avaliar(ULT.D, ctx).sort((a, b) => ORD.indexOf(a.st) - ORD.indexOf(b.st));
  const n = Object.fromEntries(ORD.map(s => [s, res.filter(r => r.st === s).length]));
  const marcas = marcasPlanta(res);
  let plan = '';
  const des = ULT.D.des;
  if (des) {
    const nTxt = des.pages.reduce((a, pg) => a + pg.items.length, 0);
    const semLugar = res.filter(r => (r.st === 'nok' || r.st === 'rev') && !r.marca);
    const pouco = nTxt < des.lidas * 15
      ? `<p class="vaviso">As peças desenhadas têm pouco texto legível (${nTxt} ${nTxt === 1 ? 'elemento' : 'elementos'} em ${des.lidas} ${des.lidas === 1 ? 'página' : 'páginas'}). Acontece quando as letras saem do programa de desenho como linhas, por exemplo com as fontes SHX do AutoCAD; assim as cotas e os nomes dos espaços não se lêem e os pontos em falta não se localizam na planta. Exporte o PDF com fontes TrueType ou com o texto pesquisável.</p>` : '';
    plan = `<section class="vplanta"><h3>Na planta</h3><p class="vdocs">${marcas.length
      ? 'Círculo a cheio onde o valor foi lido nas peças desenhadas; a tracejado, no nome do espaço, quando o valor em falta vem da memória descritiva. Os números correspondem aos parâmetros do relatório.'
      : 'Nenhum ponto em falta foi localizado no desenho, por isso a planta aparece sem marcas.'}</p>${pouco}${semLugar.length
      ? `<p class="vdocs">Sem localização no desenho: ${semLugar.map(r => esc(r.p.nome)).join('; ')}.</p>` : ''}<div id="v-plan" class="vplan-l"><p class="vprog">A desenhar as páginas…</p></div></section>`;
  }
  const docs = [ULT.D.memDoc, ULT.D.des].filter(Boolean).map(d => `${d.nome} (${d.lidas}${d.lidas < d.total ? ' de ' + d.total : ''} ${d.total === 1 ? 'página' : 'páginas'}${d.temTexto ? '' : ', sem texto legível'})`);
  const avisos = [ULT.D.memDoc, ULT.D.des].filter(d => d && !d.temTexto).map(d => `<p class="vaviso">O PDF «${esc(d.nome)}» parece digitalizado ou desenhado sem texto. Sem texto não há leitura automática; exporte-o do programa de desenho com o texto activo.</p>`).join('');
  const grupo = (st, titulo, aberto) => {
    const rs = res.filter(r => r.st === st); if (!rs.length) return '';
    return `<details class="vgrp" data-st="${st}"${aberto ? ' open' : ''}><summary><span class="vst">${ST[st]}</span>${esc(titulo)} <span class="num">${rs.length}</span></summary><ol>${rs.map(itemHTML).join('')}</ol></details>`;
  };
  const sec = REG[KIND];
  const leis = (sec.diplomas || []).map(lexInfo).filter(Boolean).map(d => {
    const alt = d.alt ? `, alterado ${d.nalt} ${d.nalt === 1 ? 'vez' : 'vezes'}, a última pelo ${d.alt}` : '';
    return `<li><a href="${SILUC}${esc(d.id)}" target="_blank" rel="noopener">${esc(lexNome(d))}</a>, ${esc(d.t)}. <span class="ev">${esc(d.ev || '')}${esc(alt)}.</span> <a href="${esc(LEXPAGE)}#q=${encodeURIComponent(d.num)}">Ver na Legislação</a></li>`;
  }).join('');
  const k = KIND === 'scie' ? categoria(ctx) : null;
  const cab = KIND === 'scie'
    ? `<p class="vctxl">Utilização-tipo ${esc(ctx.ut || '?')}${ctx.ut && REG.scie.ut[ctx.ut] ? ' (' + esc(REG.scie.ut[ctx.ut]) + ')' : ''}, ${k && k.cat ? k.cat + '.ª categoria de risco calculada' : 'categoria de risco por apurar'}${ctx.catDecl ? ', ' + ctx.catDecl + '.ª declarada' : ''}.</p>`
    : `<p class="vctxl">${ctx.tipo === 'habitacao' ? 'Edifício habitacional' : ctx.tipo === 'misto' ? 'Edifício habitacional com espaços que recebem público' : 'Edifício ou estabelecimento que recebe público'}, ${ctx.obra === 'alteracao' ? 'obra de alteração, ampliação ou conservação' : 'construção nova'}.${ctx.obra === 'alteracao' ? ' Na reabilitação de edifícios aplica-se também o DL 95/2019 e a Portaria 301/2019, que admitem outras soluções.' : ''}</p>`;
  $('#v-res').innerHTML = `<div class="vsum">${ORD.map(s => `<span class="vc" data-st="${s}"><b class="num">${n[s]}</b>${ST[s]}</span>`).join('')}</div>
<p class="vdocs">Lidos: ${esc(docs.join(' e ') || 'nenhum documento')}.</p>${cab}${avisos}${plan}
${grupo('nok', 'Parâmetros que o projecto não cumpre', true)}${grupo('rev', 'Parâmetros a verificar', true)}${grupo('nd', 'Parâmetros que os documentos não demonstram', true)}${grupo('ok', 'Parâmetros cumpridos ou referidos', false)}${grupo('na', 'Sem elementos no projecto', false)}
<div class="vleis"><h3>Legislação aplicada</h3><ul>${leis}</ul></div>
<p class="vnota">Verificação automática e preliminar, a partir do texto dos PDF, que não substitui a apreciação técnica do projecto. ${esc(REG.nota || '')}</p>`;
  $('#v-rel').hidden = false;
  ULT.res = res; ULT.ctx = ctx;
  if (ULT.D.des) desenharPlantas(marcas);
}

/* ---------- planta com os pontos em falta ---------- */
function marcasPlanta(res){
  const out = []; let k = 0;
  for (const r of res) {
    delete r.marca;
    if (r.st !== 'nok' && r.st !== 'rev') continue;
    const ms = [];
    const maus = (r.desMaus || []).filter(x => x.pos);
    if (maus.length) maus.slice(0, 8).forEach(x => ms.push({pag: x.pag, pos: x.pos, trac: false}));
    else if (r.ref && r.ref.doc === 'des' && r.ref.pos) ms.push({pag: r.ref.pag, pos: r.ref.pos, trac: false});
    else if (r.ev && r.ev.hits && r.ev.hits.length) r.ev.hits.slice(0, 3).forEach(h => ms.push({pag: h.pag, pos: h.pos, trac: true}));
    if (!ms.length) continue;
    r.marca = ++k;
    ms.forEach(m => out.push(Object.assign(m, {n: k, r})));
  }
  return out;
}
async function paginaBase(doc, n){
  ULT.cache = ULT.cache || {};
  if (ULT.cache[n]) return ULT.cache[n];
  const pg = await doc.pdf.getPage(n);
  const v1 = pg.getViewport({scale: 1});
  const sc = Math.min(2600 / Math.max(v1.width, v1.height), 4);
  const vp = pg.getViewport({scale: sc});
  const cv = document.createElement('canvas'); cv.width = Math.round(vp.width); cv.height = Math.round(vp.height);
  const c = cv.getContext('2d'); c.fillStyle = '#fff'; c.fillRect(0, 0, cv.width, cv.height);
  await pg.render({canvasContext: c, viewport: vp}).promise;
  return (ULT.cache[n] = {cv, vp, sc});
}
function circulo(c, base, g){
  const {vp, sc} = base, p = g.pos;
  const [cx, cy] = vp.convertToViewportPoint(p.x + p.w / 2, p.y + p.h / 2);
  const r = Math.max(34, (p.w * sc) / 2 + 22), lw = Math.max(4, sc * 1.6);
  c.save();
  c.lineWidth = lw; c.strokeStyle = '#e03131'; c.fillStyle = 'rgba(224,49,49,0.10)';
  c.setLineDash(g.trac ? [lw * 3, lw * 2] : []);
  c.beginPath(); c.arc(cx, cy, r, 0, Math.PI * 2); c.fill(); c.stroke();
  c.setLineDash([]);
  const txt = g.ns.join(', '), fs = Math.max(18, Math.round(sc * 8));
  c.font = `700 ${fs}px Figtree, Arial, sans-serif`;
  const bh = fs * 1.6, bw = Math.max(bh, c.measureText(txt).width + fs);
  const bx = cx + r * 0.72, by = cy - r * 0.72;
  c.fillStyle = '#e03131'; c.beginPath();
  if (c.roundRect) c.roundRect(bx - bw / 2, by - bh / 2, bw, bh, bh / 2); else c.arc(bx, by, bh / 2, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = '#fff'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(txt, bx, by + 1);
  c.restore();
}
let PLANO = 0, URLS = [], ERRO_PLANTA = '';
async function desenharPlantas(marcas){
  const tok = ++PLANO;
  const porPag = {};
  for (const m of marcas) (porPag[m.pag] = porPag[m.pag] || []).push(m);
  const figs = [], novos = [];
  let pags = Object.keys(porPag).map(Number).sort((a, b) => a - b).slice(0, 10);
  if (!pags.length) pags = [...Array(Math.min(2, ULT.D.des.lidas)).keys()].map(i => i + 1);   /* sem marcas, mostra as primeiras páginas */
  for (const n of pags) {
    porPag[n] = porPag[n] || [];
    let base; try { base = await paginaBase(ULT.D.des, n); } catch (ex) { console.error(ex); ERRO_PLANTA = String(ex && ex.message || ex); continue; }
    if (tok !== PLANO) return;
    const cv = document.createElement('canvas'); cv.width = base.cv.width; cv.height = base.cv.height;
    const c = cv.getContext('2d'); c.drawImage(base.cv, 0, 0);
    const grupos = [];
    for (const m of porPag[n]) {
      const g = grupos.find(g => Math.abs(g.pos.x - m.pos.x) < 3 && Math.abs(g.pos.y - m.pos.y) < 3);
      if (g) { if (!g.ns.includes(m.n)) g.ns.push(m.n); g.trac = g.trac && m.trac; }
      else grupos.push({pos: m.pos, ns: [m.n], trac: m.trac});
    }
    grupos.forEach(g => circulo(c, base, g));
    const url = await new Promise(ok => cv.toBlob(b => ok(b ? URL.createObjectURL(b) : cv.toDataURL('image/png')), 'image/png'));
    novos.push(url);
    const nums = [...new Set(porPag[n].map(m => m.n))];
    const lista = nums.map(k => { const r = porPag[n].find(m => m.n === k).r;
      return `<li><span class="vmk">${k}</span>${esc(r.p.nome)}${r.achado ? ', ' + esc(r.achado) : ''} <span class="vst-t" data-st="${r.st}">${ST[r.st].toLowerCase()}</span></li>`; }).join('');
    figs.push(`<figure class="vplan"><a href="${url}" target="_blank" rel="noopener" title="Abrir em tamanho real"><img src="${url}" alt="Peças desenhadas, página ${n}${lista ? ', com os pontos em falta assinalados a vermelho' : ''}"></a>
<figcaption><div class="vplan-h"><b>Peças desenhadas, página ${n}</b><a class="lnk" href="${url}" download="${KIND}-planta-p${n}.png">Descarregar imagem</a></div>${lista ? `<ol class="vplan-k">${lista}</ol>` : ''}</figcaption></figure>`);
  }
  if (tok !== PLANO) { novos.forEach(u => u.startsWith('blob:') && URL.revokeObjectURL(u)); return; }
  URLS.forEach(u => u.startsWith('blob:') && URL.revokeObjectURL(u)); URLS = novos;
  const box = $('#v-plan'); if (box) box.innerHTML = figs.join('') || `<p class="vaviso">Não foi possível desenhar as páginas das peças desenhadas${ERRO_PLANTA ? ' (' + esc(ERRO_PLANTA) + ')' : ''}.</p>`;
}
function textoRelatorio(){
  if (!ULT || !ULT.res) return '';
  const tit = $('h1.h1') ? $('h1.h1').textContent.trim() : 'Verificador';
  const linhas = [tit, 'Relatório preliminar, ' + new Date().toLocaleDateString('pt-PT'), ''];
  for (const st of ORD) {
    const rs = ULT.res.filter(r => r.st === st); if (!rs.length) continue;
    linhas.push(ST[st].toUpperCase() + ` (${rs.length})`);
    for (const r of rs) {
      const d = lexInfo(r.p.lex);
      linhas.push(`- ${r.p.nome}. Exigido: ${r.exige || r.p.exige}.` + (r.achado ? ` No projecto: ${r.achado}.` : '') + (r.nota ? ` ${r.nota}` : '') +
        ` [${d ? lexNome(d) + ', ' : ''}${r.p.norma}]` + (r.ref && r.ref.pag ? ` (${fonte(r.ref)})` : '') + (r.marca ? ` Assinalado na planta com o n.º ${r.marca}.` : ''));
    }
    linhas.push('');
  }
  return linhas.join('\n');
}

/* ---------- formulário ---------- */
const FICH = {des: null, mem: null};
function prepararCampo(lab){
  const inp = $('input[type=file]', lab), k = lab.dataset.doc, out = $('.vf', lab);
  const usar = f => {
    if (!f) return;
    if (!/\.pdf$/i.test(f.name) && f.type !== 'application/pdf') { out.textContent = 'Escolha um ficheiro PDF.'; return; }
    FICH[k] = f; lab.classList.add('com'); out.textContent = `${f.name} · ${f.size < 1048576 ? Math.max(1, Math.round(f.size / 1024)) + ' KB' : (f.size / 1048576).toLocaleString('pt-PT', {maximumFractionDigits: 1}) + ' MB'}`;
    $('#v-go').disabled = !(FICH.des || FICH.mem);
  };
  inp.addEventListener('change', () => usar(inp.files[0]));
  lab.addEventListener('dragover', e => { e.preventDefault(); lab.classList.add('sobre'); });
  lab.addEventListener('dragleave', () => lab.classList.remove('sobre'));
  lab.addEventListener('drop', e => { e.preventDefault(); lab.classList.remove('sobre'); usar(e.dataTransfer.files[0]); });
}
$$('.vfile', root).forEach(prepararCampo);
$$('[data-ctx]', root).forEach(el => {
  const ev = el.tagName === 'SELECT' ? 'change' : 'input';
  el.addEventListener(ev, () => { el.dataset.tocado = '1'; el.classList.remove('auto'); el.title = ''; mostraCategoria(); if (ULT) avaliarEDesenhar(); });
});
mostraCategoria();
$('#v-form').addEventListener('submit', async e => {
  e.preventDefault();
  const prog = $('#v-prog'), go = $('#v-go');
  go.disabled = true;
  try {
    const D = {des: null, memDoc: null};
    if (FICH.mem) { prog.textContent = 'A ler a memória descritiva…'; D.memDoc = await lerPDF(FICH.mem, (i, N) => prog.textContent = `A ler a memória descritiva, página ${i} de ${N}…`); }
    if (FICH.des) { prog.textContent = 'A ler as peças desenhadas…'; D.des = await lerPDF(FICH.des, (i, N) => prog.textContent = `A ler as peças desenhadas, página ${i} de ${N}…`); }
    D.fr = D.memDoc ? frases(D.memDoc) : [];
    D.todo = fold([D.memDoc, D.des].filter(Boolean).flatMap(d => d.pages.map(p => p.texto)).join('\n'));
    ULT = {D};
    preencher(contexto(D)); mostraCategoria();
    prog.textContent = 'A verificar…';
    const lx = await fresh('legislacao.json', null);
    if (lx && lx.diplomas) {
      const ids = new Set(Object.keys(LEX.diplomas || {}));
      const sub = {};
      for (const d of lx.diplomas) if (ids.has(String(d.id))) {
        const ult = (d.alt || []).slice().sort((a, b) => String(b[1]).localeCompare(String(a[1])))[0];
        sub[d.id] = Object.assign({}, LEX.diplomas[d.id], {ev: d.ev, nalt: (d.alt || []).length, alt: ult ? ult[0] : ''});
      }
      LEX = {actualizado: lx.actualizado, diplomas: Object.assign({}, LEX.diplomas, sub)};
    }
    avaliarEDesenhar();
    prog.textContent = '';
    $('#v-rel').scrollIntoView({behavior: 'smooth', block: 'start'});
  } catch (ex) {
    console.error(ex);
    prog.textContent = 'Não foi possível ler os ficheiros (' + (ex && ex.message || ex) + ').';
  } finally { go.disabled = !(FICH.des || FICH.mem); }
});
$('#v-copy').addEventListener('click', async () => {
  const t = textoRelatorio(); if (!t) return;
  try { await navigator.clipboard.writeText(t); $('#v-copy').textContent = 'Relatório copiado'; }
  catch(_) { const ta = document.createElement('textarea'); ta.value = t; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); } catch(_) {} ta.remove(); $('#v-copy').textContent = 'Relatório copiado'; }
  setTimeout(() => { $('#v-copy').textContent = 'Copiar relatório'; }, 2200);
});
$('#v-print').addEventListener('click', () => { $$('#v-res details').forEach(d => d.open = true); window.print(); });
})();
