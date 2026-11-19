/* ATLAS · Calculadora de honorários (pedido do Pedro, 19 Nov. 2026, 01:37)
   Os honorários são livres: a calculadora aplica os métodos de cálculo correntes (percentagem do custo da obra,
   valor por metro quadrado, tempo estimado, montante fixo) aos valores que o arquitecto indica, reparte-os pelas fases
   do projecto e compara a percentagem resultante com referências publicadas. Tudo corre no navegador. */
(function(){
'use strict';
const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
const root = $('#hon'); if (!root) return;
const EUR = new Intl.NumberFormat('pt-PT', {style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2});
const EUR0 = new Intl.NumberFormat('pt-PT', {style: 'currency', currency: 'EUR', maximumFractionDigits: 0});
const NUM = new Intl.NumberFormat('pt-PT', {maximumFractionDigits: 2});
const PCT = v => NUM.format(Math.round(v * 100) / 100) + '%';
const eur = v => isFinite(v) ? EUR.format(v) : '–';
/* números escritos à portuguesa: «1.250,5» ou «1250,5» ou «1250.5» */
const num = s => { s = String(s ?? '').replace(/[\s€%]/g, ''); if (!s) return NaN;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.'); else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  return parseFloat(s); };

/* fases do projecto (Portaria n.º 255/2023) e distribuição de partida, a ajustar por cada um */
const FASES = [['pb', 'Programa base', 5], ['ep', 'Estudo prévio', 20], ['ap', 'Anteprojecto ou projecto base', 25], ['pe', 'Projecto de execução', 40], ['at', 'Assistência técnica', 10]];
const PERFIS = [['coord', 'Arquitecto coordenador'], ['arq', 'Arquitecto'], ['col', 'Colaborador']];
/* percentagens publicadas, para comparar (não são tabela de honorários) */
const REFS = [
  {v: 1.99, l: 'Média dos contratos públicos de projecto, 2023 e 2024'},
  {v: 3.31, l: 'Média dos preços-base desses procedimentos'},
  {v: 4.24, l: 'Tabela orientadora espanhola (BOE 126/2015)'},
  {v: 4.35, l: 'Média da tabela de 1972 para obras das categorias II e III'},
  {v: 9.19, l: 'Tabela alemã (HOAI)'},
];
const CHAVE = 'atlas-honorarios';

const f = $('#hon-form');
function ler(){
  const v = n => num(($(`[name="${n}"]`, f) || {}).value);
  const d = {met: ($('[name="met"]:checked', f) || {}).value || 'pct'};
  d.area = v('area'); d.cm2 = v('cm2'); d.custoMan = v('custo');
  d.custo = isFinite(d.custoMan) ? d.custoMan : (isFinite(d.area) && isFinite(d.cm2) ? d.area * d.cm2 : NaN);
  d.pct = v('pct'); d.vm2 = v('vm2'); d.fixo = v('fixo'); d.iva = isFinite(v('iva')) ? v('iva') : 23;
  d.fases = FASES.map(([id, nome]) => ({id, nome, on: $(`[name="f-${id}"]`, f).checked, peso: v(`p-${id}`) || 0}));
  d.taxas = Object.fromEntries(PERFIS.map(([id]) => [id, v(`t-${id}`) || 0]));
  d.horas = Object.fromEntries(FASES.map(([fid]) => [fid, Object.fromEntries(PERFIS.map(([pid]) => [pid, v(`h-${fid}-${pid}`) || 0]))]));
  d.extras = $$('.hx', f).map(r => ({t: $('input[type=text]', r).value.trim(), v: num($('input[inputmode]', r).value) || 0})).filter(x => x.t || x.v);
  d.desp = v('desp') || 0;
  return d;
}
function calcular(d){
  const r = {fases: [], base: NaN, nota: ''};
  const pesoTot = d.fases.reduce((a, x) => a + x.peso, 0) || 100;
  if (d.met === 'tempo') {
    r.fases = d.fases.map(x => { const h = d.horas[x.id], horas = Object.values(h).reduce((a, b) => a + b, 0);
      const val = PERFIS.reduce((a, [pid]) => a + h[pid] * d.taxas[pid], 0); return {...x, horas, val: x.on ? val : 0}; });
    r.total = r.fases.reduce((a, x) => a + x.val, 0);
    r.horas = r.fases.filter(x => x.on).reduce((a, x) => a + x.horas, 0);
  } else {
    let completo = NaN;
    if (d.met === 'pct') completo = d.custo * d.pct / 100;
    if (d.met === 'm2') completo = d.area * d.vm2;
    if (d.met === 'fixo') completo = d.fixo;
    r.completo = completo;
    r.fases = d.fases.map(x => ({...x, val: x.on && isFinite(completo) ? completo * x.peso / pesoTot : 0}));
    r.total = r.fases.reduce((a, x) => a + x.val, 0);
    r.parcial = d.fases.some(x => !x.on);
  }
  r.extras = d.extras.reduce((a, x) => a + x.v, 0);
  r.semIva = r.total + r.extras + d.desp;
  r.iva = r.semIva * d.iva / 100;
  r.comIva = r.semIva + r.iva;
  r.pctObra = isFinite(d.custo) && d.custo > 0 ? 100 * (r.total + r.extras) / d.custo : NaN;
  r.porM2 = isFinite(d.area) && d.area > 0 ? (r.total + r.extras) / d.area : NaN;
  return r;
}
function desenhar(){
  const d = ler(), r = calcular(d);
  $$('[data-met]', f).forEach(b => b.hidden = b.dataset.met !== d.met);
  const c = $('#hon-custo'); if (c) c.textContent = isFinite(d.custo) ? EUR0.format(d.custo) : '–';
  const pesos = d.fases.reduce((a, x) => a + x.peso, 0);
  const ps = $('#hon-pesos'); if (ps) { ps.textContent = `Soma ${PCT(pesos)}`; ps.classList.toggle('mau', Math.abs(pesos - 100) > .01 && d.met !== 'tempo'); }
  $$('#hon-ftab .hf-peso').forEach(x => x.closest('td').hidden = d.met === 'tempo');
  $('#hon-th-peso').hidden = d.met === 'tempo';
  const ok = isFinite(r.semIva) && r.semIva > 0;
  $('#hon-total').textContent = ok ? eur(r.semIva) : '–';
  $('#hon-iva').textContent = ok ? `${eur(r.iva)} de IVA (${PCT(d.iva)}) · ${eur(r.comIva)} com IVA` : 'Preencha os dados da obra e o método de cálculo';
  const kpi = [];
  if (isFinite(r.pctObra)) kpi.push(['do custo da obra', PCT(r.pctObra)]);
  if (isFinite(r.porM2)) kpi.push(['por m² de construção', eur(r.porM2)]);
  if (d.met === 'tempo' && r.horas) kpi.push(['horas de trabalho', NUM.format(r.horas)]);
  $('#hon-kpi').innerHTML = kpi.map(([l, v]) => `<div><b>${v}</b><span>${l}</span></div>`).join('');
  $('#hon-fases').innerHTML = r.fases.filter(x => x.on && x.val > 0).map(x => `<tr><th scope="row">${esc(x.nome)}</th><td class="num">${r.total ? PCT(100 * x.val / r.total) : '–'}</td><td class="num">${eur(x.val)}</td></tr>`).join('')
    + d.extras.map(x => `<tr><th scope="row">${esc(x.t || 'Serviço adicional')}</th><td></td><td class="num">${eur(x.v)}</td></tr>`).join('')
    + (d.desp ? `<tr><th scope="row">Despesas e deslocações</th><td></td><td class="num">${eur(d.desp)}</td></tr>` : '');
  /* comparação: a percentagem desta proposta ao lado das referências publicadas (uma barra por valor, todas na mesma escala) */
  const cmp = $('#hon-cmp');
  if (isFinite(r.pctObra) && r.pctObra > 0) {
    const linhas = [{v: r.pctObra, l: 'Esta proposta', eu: true}, ...REFS].sort((a, b) => a.v - b.v);
    const max = Math.max(...linhas.map(x => x.v)) * 1.08;
    cmp.innerHTML = `<h3>Percentagem do custo da obra, comparada</h3>${linhas.map(x => `<div class="hc-row${x.eu ? ' eu' : ''}"><span class="hc-l">${esc(x.l)}</span><span class="hc-tr"><i style="width:${100 * x.v / max}%"></i><b class="num">${PCT(x.v)}</b></span></div>`).join('')}
<p class="hc-n">As referências são médias publicadas, não valores a aplicar. Os honorários são fixados livremente por cada arquitecto.</p>`;
    cmp.hidden = false;
  } else cmp.hidden = true;
  const parc = $('#hon-parcial'); if (parc) parc.hidden = !r.parcial;
  try { localStorage.setItem(CHAVE, JSON.stringify(Object.fromEntries($$('input,select', f).filter(x => x.name).map(x => [x.name, (x.type === 'checkbox' || x.type === 'radio') ? (x.checked ? (x.type === 'radio' ? x.value : '1') : (x.type === 'radio' ? undefined : '')) : x.value]).filter(([, v]) => v !== undefined)))); } catch (x) {}
  return {d, r};
}
function resumo(){
  const {d, r} = desenhar();
  const g = n => ($(`[name="${n}"]`, f) || {}).value || '';
  const met = {pct: `${PCT(d.pct)} do custo estimado da obra`, m2: `${eur(d.vm2)} por m² de área de construção`, tempo: 'tempo estimado por fase e por perfil', fixo: 'montante fixo'}[d.met];
  const L = [`Proposta de honorários${g('nome') ? ': ' + g('nome') : ''}`, ''];
  [['Intervenção', g('interv')], ['Programa', g('prog')], ['Categoria da obra', g('cat')], ['Área bruta de construção', isFinite(d.area) ? NUM.format(d.area) + ' m²' : ''],
   ['Custo estimado da obra', isFinite(d.custo) ? eur(d.custo) : ''], ['Método de cálculo', met]].forEach(([k, v]) => { if (v) L.push(`${k}: ${v}`); });
  L.push('', 'Repartição:');
  r.fases.filter(x => x.on && x.val > 0).forEach(x => L.push(`  ${x.nome}: ${eur(x.val)}${r.total ? ' (' + PCT(100 * x.val / r.total) + ')' : ''}`));
  d.extras.forEach(x => L.push(`  ${x.t || 'Serviço adicional'}: ${eur(x.v)}`));
  if (d.desp) L.push(`  Despesas e deslocações: ${eur(d.desp)}`);
  L.push('', `Honorários: ${eur(r.semIva)}`, `IVA (${PCT(d.iva)}): ${eur(r.iva)}`, `Total com IVA: ${eur(r.comIva)}`);
  if (isFinite(r.pctObra)) L.push('', `Equivale a ${PCT(r.pctObra)} do custo estimado da obra${isFinite(r.porM2) ? ' e a ' + eur(r.porM2) + ' por m²' : ''}.`);
  return L.join('\n');
}

/* ---------------------------------------------------------------- arranque */
(() => {
  /* linhas das fases e da tabela de tempo, desenhadas a partir das listas acima */
  $('#hon-ftab').innerHTML = FASES.map(([id, nome, p]) => `<tr><th scope="row"><label class="hf-on"><input type="checkbox" name="f-${id}" checked> ${esc(nome)}</label></th>
<td><label class="hf-peso"><input name="p-${id}" inputmode="decimal" value="${p}" aria-label="Peso de ${esc(nome)}"><span>%</span></label></td>
<td data-met="tempo" hidden>${PERFIS.map(([pid, pn]) => `<label class="hf-h"><input name="h-${id}-${pid}" inputmode="decimal" placeholder="0" aria-label="Horas de ${esc(pn)} em ${esc(nome)}"><span>h</span></label>`).join('')}</td></tr>`).join('');
  $('#hon-thh').innerHTML = PERFIS.map(([, pn]) => `<span>${esc(pn)}</span>`).join('');
  $('#hon-taxas').innerHTML = PERFIS.map(([pid, pn]) => `<label class="vfld"><span>${esc(pn)} (€/hora)</span><input name="t-${pid}" inputmode="decimal" placeholder="0"></label>`).join('');
  $('#hon-refs').innerHTML = REFS.map(x => `<button type="button" class="hr" data-pct="${x.v}"><b class="num">${PCT(x.v)}</b><span>${esc(x.l)}</span></button>`).join('');
  try { const s = JSON.parse(localStorage.getItem(CHAVE) || 'null');
    if (s) $$('input,select', f).forEach(x => { if (!(x.name in s)) { if (x.type === 'checkbox' && x.name.startsWith('f-')) x.checked = false; return; }
      if (x.type === 'radio') x.checked = s[x.name] === x.value; else if (x.type === 'checkbox') x.checked = s[x.name] === '1'; else x.value = s[x.name]; }); } catch (x) {}
  f.addEventListener('input', desenhar); f.addEventListener('change', desenhar);
  f.addEventListener('submit', ev => ev.preventDefault());
  $('#hon-refs').addEventListener('click', ev => { const b = ev.target.closest('[data-pct]'); if (!b) return; $('[name="pct"]', f).value = NUM.format(Number(b.dataset.pct)); desenhar(); });
  $('#hon-copiar').addEventListener('click', ev => { const t = resumo(), b = ev.currentTarget;
    (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(() => { b.textContent = 'Resumo copiado'; setTimeout(() => b.textContent = 'Copiar o resumo', 2200); }, () => prompt('Resumo', t)); });
  $('#hon-imprimir').addEventListener('click', () => { const t = resumo(); const p = $('#hon-print'); p.textContent = t; window.print(); });
  $('#hon-limpar').addEventListener('click', () => { try { localStorage.removeItem(CHAVE); } catch (x) {} f.reset();
    FASES.forEach(([id, , p]) => { $(`[name="p-${id}"]`, f).value = p; $(`[name="f-${id}"]`, f).checked = true; }); desenhar(); });
  $('#hon-mais').addEventListener('click', () => { const r = document.createElement('div'); r.className = 'hx';
    r.innerHTML = '<input type="text" placeholder="Serviço (por exemplo, levantamento)" aria-label="Serviço adicional"><label class="hf-peso"><input inputmode="decimal" placeholder="0" aria-label="Valor"><span>€</span></label>';
    $('#hon-extras').appendChild(r); $('input', r).focus(); });
  desenhar();
})();
})();
