/* ATLAS · Concursos no mapa (pedido do Pedro, 23 Nov. 2026)
   Cada concurso num mapa ao lado da lista (com a dimensão e a escala do mapa da bolsa de emprego, pedido de 23 Nov. 2026, 20:24), a verde, amarelo ou vermelho conforme o tempo que falta para a entrega,
   com as mesmas cores e os mesmos limites das fichas (mais de 15 dias, 15 dias ou menos, prazo encerrado). No marcador,
   os dias que faltam. O mapa segue os filtros da página e enquadra a região escolhida.
   Lugar: a freguesia quando o local a indica («Alvalade, Lisboa»), senão o concelho. Concursos muito próximos dispõem-se
   em roda, para se verem todos. Desenhos das regiões, concelhos e freguesias: os dos Guias de Arquitectura (CAOP, DGT). */
(function(){
'use strict';
const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
const fold = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const root = $('#cmap-w'), el = $('#cmap'), list = $('#clist');
if (!root || !el || !list) return;
const topo = root.dataset.topo;
const semMapa = () => { root.remove(); const w = $('#cwrap'); if (w) w.classList.add('semapa'); };
if (!topo) { semMapa(); return; }                     /* pré-visualização no claude.ai: sem os desenhos, fica só a lista */

const INS = {ACORES: {c: [38.327, -28.141], k: .55, t: [41.08, -12.27]}, MAD: {c: [32.766, -16.7715], k: 1.5, t: [37.73, -11.3]}};
const zoneOf = (lat, lng) => lng < -20 ? 'ACORES' : (lng < -15 && lat < 34.5 ? 'MAD' : null);
const shiftLL = (lat, lng) => { const z = zoneOf(lat, lng); if (!z) return [lat, lng]; const {c, k, t} = INS[z]; return [t[0] + (lat - c[0]) * k, t[1] + (lng - c[1]) * k]; };
const FRAME = {ACORES: [[40.06, -14.24], [42.1, -10.3]], MAD: [[36.965, -12.295], [38.495, -10.305]]};
const FULL = [[36.9, -14.4], [42.35, -6.15]], MAINLAND = [[36.95, -9.6], [42.16, -6.2]];
const loadJS = src => new Promise((ok, ko) => { const x = document.createElement('script'); x.src = src; x.onload = ok; x.onerror = ko; document.head.appendChild(x); });
const MES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

let map = null, pins = null, CONC = {}, FREG = {}, SECB = {}, lastSec = null, raf = 0;

/* cada ficha traz o seu concurso (el._c, do atlas.js de 23 Nov. 2026); com um atlas.js anterior, a ficha é reconhecida
   pelo título, nos dados da página e nos dados do dia lidos do repositório */
const snap = id => { const e = document.getElementById(id); try { return e ? JSON.parse(e.textContent) : null; } catch (x) { return null; } };
const PORT = {};
const juntar = d => ((d && d.concursos) || []).forEach(c => { PORT[fold(c.titulo)] = c; });
juntar(snap('snap-concursos'));
const CFG = snap('atlas-cfg') || {};
if (CFG.data) fetch(CFG.data + 'concursos.json?t=' + Math.floor(Date.now() / 3e5)).then(r => r.ok ? r.json() : null).then(d => { juntar(d); pedir(); }).catch(() => {});
const dado = k => k._c || PORT[fold((k.querySelector('h3') || {}).textContent)];

/* centro de um polígono: o centróide do maior anel (coordenadas [lng, lat]) */
function centro(geom){
  const polys = geom.type === 'Polygon' ? [geom.coordinates] : geom.type === 'MultiPolygon' ? geom.coordinates : [];
  let best = null, bestA = 0;
  polys.forEach(p => { const r = p[0]; let a = 0, x = 0, y = 0;
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const f = r[j][0] * r[i][1] - r[i][0] * r[j][1]; a += f; x += (r[j][0] + r[i][0]) * f; y += (r[j][1] + r[i][1]) * f; }
    if (Math.abs(a) > bestA) { bestA = Math.abs(a); best = [y / (3 * a), x / (3 * a)]; } });
  return best;                                         /* [lat, lng] */
}
function caixa(geom){
  let s = 90, w = 180, n = -90, e = -180;
  const go = c => { if (typeof c[0] === 'number') { w = Math.min(w, c[0]); e = Math.max(e, c[0]); s = Math.min(s, c[1]); n = Math.max(n, c[1]); } else c.forEach(go); };
  go(geom.coordinates); return [s, w, n, e];
}
const dentro = (p, b) => p[0] >= b[0] && p[0] <= b[2] && p[1] >= b[1] && p[1] <= b[3];

/* lugar de um concurso, em coordenadas reais */
function lugar(c){
  const partes = String(c.local || '').split(',').map(s => s.trim()).filter(Boolean);
  const C = CONC[fold(c.concelho || partes[partes.length - 1])]; if (!C) return null;
  if (partes.length > 1) {
    const cand = (FREG[fold(partes[0])] || []).filter(f => dentro(f, C.b));
    if (cand.length) return cand.sort((a, b) => Math.hypot(a[0] - C.p[0], a[1] - C.p[1]) - Math.hypot(b[0] - C.p[0], b[1] - C.p[1]))[0];
  }
  return C.p;
}

/* os dias e a data vêm da própria ficha, para o mapa dizer exactamente o mesmo */
const fmt = d => `${d.getDate()} ${MES[d.getMonth()]} ${d.getFullYear()}`;

function desenhar(){
  raf = 0; if (!map) return;
  const cards = $$('.cc', list).filter(k => !k.hidden && dado(k));
  const pts = [];
  cards.forEach(k => { const c = dado(k), p = lugar(c); if (!p) return; const ll = shiftLL(p[0], p[1]);
    pts.push({k, c, ll, px: map.latLngToLayerPoint(ll), u: k.dataset.u, aberto: k.dataset.st === 'aberto'}); });
  /* concursos a menos de 26 px uns dos outros juntam-se e dispõem-se em roda */
  const grupos = [];
  pts.forEach(p => { const g = grupos.find(g => g.c.distanceTo(p.px) < 26); if (g) { g.m.push(p); g.c = g.m.reduce((a, q) => a.add(q.px), L.point(0, 0)).divideBy(g.m.length); } else grupos.push({c: p.px.clone(), m: [p]}); });
  pins.clearLayers();
  grupos.forEach(g => { const n = g.m.length, r = n > 1 ? Math.max(18, n * 29 / (2 * Math.PI)) : 0;
    g.m.sort((a, b) => (a.c.entrega || '').localeCompare(b.c.entrega || ''));
    g.m.forEach((p, i) => {
      const a = -Math.PI / 2 + i * 2 * Math.PI / n, pos = n > 1 ? map.layerPointToLatLng(g.c.add(L.point(r * Math.cos(a), r * Math.sin(a)))) : p.ll;
      const d = Number((p.k.querySelector('.tm b') || {}).textContent) || 0, txt = p.aberto ? String(d) : '✕', due = p.k._due || new Date(p.c.entrega);
      const m = L.marker(pos, {keyboard: true, title: p.c.titulo, riseOnHover: true,
        icon: L.divIcon({className: 'cpin-i', iconSize: [28, 28], iconAnchor: [14, 14], html: `<span class="cpin" data-u="${p.u}"${txt.length > 2 ? ' data-l' : ''}>${txt}</span>`})});
      const quando = p.aberto ? `${d === 1 ? 'Falta 1 dia' : `Faltam ${d} dias`} · entrega a ${fmt(due)}` : `Prazo encerrado a ${fmt(due)}`;
      m.bindTooltip(`<b>${esc(p.c.titulo)}</b><br>${esc(p.c.local || p.c.concelho || '')}<br>${esc(quando)}`, {className: 'tt', direction: 'top', offset: [0, -14]});
      m.on('click', () => { p.k.scrollIntoView({behavior: 'smooth', block: 'center'}); p.k.classList.remove('cc-sel'); void p.k.offsetWidth; p.k.classList.add('cc-sel'); setTimeout(() => p.k.classList.remove('cc-sel'), 2400); });
      m.addTo(pins); p.k._pin = m;
    });
  });
  const nfora = cards.length - pts.length, nota = $('#cmap-nota');
  if (nota) { nota.hidden = !nfora; nota.textContent = nfora === 1 ? 'Um concurso não tem lugar indicado e fica só na lista.' : `${nfora} concursos não têm lugar indicado e ficam só na lista.`; }
  /* enquadra a região escolhida no filtro, ou o país inteiro */
  const st = ($('.filters[data-for=".cc"]') || {})._state || {}, sec = st.sec || 'all';
  if (sec !== lastSec) { lastSec = sec;
    if (sec !== 'all' && SECB[sec]) map.fitBounds(SECB[sec], {padding: [20, 20], maxZoom: 10});
    else map.fitBounds(innerWidth > 760 ? FULL : MAINLAND); }
}
const pedir = () => { if (!raf) raf = requestAnimationFrame(desenhar); };

async function iniciar(){
  try {
    if (!window.L) await loadJS('https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.js');
    if (!window.topojson) await loadJS('https://cdn.jsdelivr.net/npm/topojson-client@3.1.0/dist/topojson-client.min.js');
    const [TS, TC, TF] = await Promise.all(['seccoes.topo.json', 'concelhos.topo.json', 'freguesias.topo.json'].map(f => fetch(topo + f).then(r => { if (!r.ok) throw 0; return r.json(); })));
    const gS = topojson.feature(TS, TS.objects.seccoes), gC = topojson.feature(TC, TC.objects.concelhos), gF = topojson.feature(TF, TF.objects.freguesias);
    gC.features.forEach(f => { if (!f.geometry) return; const p = centro(f.geometry); if (p) CONC[fold(f.properties.n)] = {p, b: caixa(f.geometry)}; });
    gF.features.forEach(f => { if (!f.geometry) return; const p = centro(f.geometry); if (p) (FREG[fold(f.properties.n)] ||= []).push(p); });
    map = L.map(el, {zoomControl: false, minZoom: 5, maxZoom: 15, zoomSnap: .25, zoomDelta: .5, scrollWheelZoom: false});
    L.control.zoom({position: 'topright'}).addTo(map);
    map.attributionControl.setPrefix('Leaflet').addAttribution('Limites: CAOP, DGT');
    const c2l = c => L.latLng(shiftLL(c[1], c[0]));
    const geo = (g, o) => L.geoJSON(g, Object.assign({interactive: false, coordsToLatLng: c2l}, o));
    geo(gS, {style: () => ({stroke: false, fill: true, fillColor: '#e7e4dd', fillOpacity: 1})}).addTo(map);
    const conc = geo(gC, {style: () => ({color: '#fff', weight: map.getZoom() < 8.5 ? .6 : 1, opacity: .9, fill: false})}).addTo(map);
    const linha = geo(gS, {style: () => ({color: '#8f8b83', weight: map.getZoom() < 8.5 ? .9 : 1.4, fill: false, lineJoin: 'round'})}).addTo(map);
    gS.features.forEach(f => { if (!f.geometry) return; const s = f.properties.s; const b = L.geoJSON(f, {coordsToLatLng: c2l}).getBounds(); SECB[s] = SECB[s] ? SECB[s].extend(b) : b; });
    L.layerGroup(Object.values(FRAME).map(b => L.rectangle(b, {interactive: false, color: '#c9c5bd', weight: 1.4, fill: false}))).addTo(map);
    pins = L.layerGroup().addTo(map);
    map.fitBounds(innerWidth > 760 ? FULL : MAINLAND); lastSec = 'all';
    map.on('zoomend', () => { conc.setStyle({weight: map.getZoom() < 8.5 ? .6 : 1}); linha.setStyle({weight: map.getZoom() < 8.5 ? .9 : 1.4}); pedir(); });
    el.addEventListener('click', () => map.scrollWheelZoom.enable(), {once: true});
    /* a lista é desenhada e filtrada pelo atlas.js: o mapa acompanha-a */
    new MutationObserver(pedir).observe(list, {childList: true, subtree: true, attributes: true, attributeFilter: ['hidden']});
    list.addEventListener('mouseover', e => { const k = e.target.closest('.cc'); $$('.cpin.on', el).forEach(x => x.classList.remove('on')); const ic = k && k._pin && k._pin.getElement(); if (ic) { ic.querySelector('.cpin').classList.add('on'); k._pin.setZIndexOffset(1000); } });
    list.addEventListener('mouseleave', () => $$('.cpin.on', el).forEach(x => x.classList.remove('on')));
    pedir();
  } catch (x) {
    if (window.console) console.warn('ATLAS, mapa dos concursos:', x);
    semMapa(); map = null;
  }
}
iniciar();
})();
