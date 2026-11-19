#!/usr/bin/env python3
"""Bolsa de emprego do ATLAS (pedido do Pedro, 19 Nov. 2026).

Lê as ofertas de emprego para arquitectos publicadas na bolsa de emprego pública que o Pedro indicou
(a página com o mapa das ofertas, cinco por página) e guarda em data/emprego.json, para cada oferta em vigor,
o anúncio completo, que o ATLAS mostra numa janela própria sem ligar ao sítio de origem (pedido do Pedro,
19 Nov. 2026, 01:35, «tal como nos fotógrafos»): título, entidade, lugar, região, coordenadas, prazo de candidatura,
resumo, descrição, funções e requisitos, e os dados de candidatura que a entidade publicou para esse fim
(email para envio do currículo, contacto para entrevista, sítio da entidade).
Não guarda o telefone, o número de contribuinte nem o número de inscrição de quem publica a oferta.

As ofertas com o prazo de candidatura ultrapassado ficam de fora. Se a recolha falhar ou vier incompleta,
data/emprego.json fica como estava.
"""
import html, json, re, sys
from datetime import datetime, timezone
from pathlib import Path

import requests

sys.path.insert(0, str(Path(__file__).resolve().parent))
from actualizar import DATA, ROOT, UA   # noqa: E402

BASE = 'https://www.ordemdosarquitectos.org'
LISTA = BASE + '/bolsa_emprego?mapMode=true&type=OFERTA&p={p}&seccaoFilter=&typeFilter=&searchFilter=&order=desc'
FICH = DATA / 'emprego.json'
HOJE = datetime.now(timezone.utc).date().isoformat()
# códigos de região da fonte -> regiões do ATLAS (as mesmas dos Guias de Arquitectura)
SEC = {'NORTE': 'NORTE', 'CENTRO': 'CENTRO', 'LVT': 'LVT', 'ALENTEJO': 'ALT', 'ALT': 'ALT', 'ALGARVE': 'ALG', 'ALG': 'ALG',
       'ACORES': 'ACORES', 'AÇORES': 'ACORES', 'MADEIRA': 'MAD', 'MAD': 'MAD'}
LOG = []

def log(*a):
    msg = ' '.join(str(x) for x in a)
    LOG.append(msg); print(msg, flush=True)

def next_data(texto):
    m = re.search(r'<script id="__NEXT_DATA__"[^>]*>(.*?)</script>', texto, flags=re.S)
    if not m: raise ValueError('página sem __NEXT_DATA__')
    return json.loads(m.group(1))['props']['pageProps']

# a regra editorial do ATLAS: nenhuma referência à Ordem dos Arquitectos
ORDEM = r'(?:Ordem(?: dos Arquitec?t\w*(?:\s+Portugues\w*)?)?|\bOA\b)'
def sem_ordem(s):
    s = re.sub(r'\b(inscri[cç][aã]o|inscrito|inscrita)((?:\s+(?:em vigor|v[aá]lida|ativa|activa))?)\s+(?:na|à|a)\s+(?:Ordem dos Arquitec?t\w*(?:\s+Portugues\w*)?|OA\b)',
               r'\1\2 como arquitecto', s, flags=re.I)
    s = re.sub(r'\b(acesso|admiss[aã]o|ades[aã]o|entrada)\s+(?:à|a|na)\s+' + ORDEM, r'\1 à profissão', s, flags=re.I)
    s = re.sub(r'\s*(?:na|da|pela|à|a|com a)\s+Ordem dos Arquitec?t\w*(?:\s+Portugues\w*)?', '', s, flags=re.I)
    s = re.sub(r'\s*[-–|]\s*OA\b\s*', ' ', s)
    s = re.sub(r'Ordem dos Arquitec?t\w*(?:\s+Portugues\w*)?', '', s, flags=re.I)
    s = re.sub(r'\b(est[aá]gio)\s+(?:da\s+|de\s+acesso\s+[àa]\s+)?OA\b', r'\1 de acesso à profissão', s, flags=re.I)
    s = re.sub(r'\b(?:na|da|à)\s+OA\b', '', s)
    s = re.sub(r'\s*\bOA\b', '', s)
    return re.sub(r'[ \t]{2,}', ' ', s).strip(' -–|')

def texto(h, n):
    """HTML da fonte em texto corrido, cortado em n caracteres numa fronteira de palavra."""
    s = re.sub(r'<br\s*/?>|</(?:p|li|div|h\d)>', ' ', str(h or ''), flags=re.I)
    s = html.unescape(re.sub(r'<[^>]+>', '', s))
    s = sem_ordem(re.sub(r'\s+', ' ', s).strip())
    if len(s) > n: s = re.sub(r'\s+\S*$', '', s[:n]).rstrip(' ,;:-') + '…'
    return s

def texto_longo(h, n=4000):
    """HTML da fonte em texto com parágrafos (linha em branco) e listas (linhas a abrir com «• »)."""
    s = str(h or '')
    s = re.sub(r'<br\s*/?>', '\n', s, flags=re.I)
    s = re.sub(r'<li[^>]*>', '\n• ', s, flags=re.I)
    s = re.sub(r'</li>', '', s, flags=re.I)
    s = re.sub(r'</(?:p|div|h\d|ul|ol|blockquote)>', '\n\n', s, flags=re.I)
    s = html.unescape(re.sub(r'<[^>]+>', '', s)).replace('\xa0', ' ')
    linhas = []
    for l in s.split('\n'):
        l = re.sub(r'[ \t]+', ' ', l).strip()
        l = re.sub(r'^(?:[-–•·*]|\d+[.)])\s+', '• ', l)
        if l.startswith('• '): l = '• ' + sem_ordem(l[2:])
        elif l: l = sem_ordem(l)
        linhas.append(l)
    s = re.sub(r'\n{3,}', '\n\n', '\n'.join(linhas)).strip()
    s = re.sub(r'(?<!\n)\n(?!\n)(?!• )', ' ', s)               # quebras soltas no meio de um parágrafo
    s = re.sub(r'(?<=[^\n])\n(?=• )', '\n', s)
    if len(s) > n: s = re.sub(r'\s+\S*$', '', s[:n]).rstrip(' ,;:-') + '…'
    return s

def email_ok(e):
    e = (e or '').strip().strip('.;,')
    return e if re.fullmatch(r'[\w.+-]+@[\w-]+(?:\.[\w-]+)+', e or '') else ''

def url_ok(u):
    u = (u or '').strip()
    if not u: return ''
    if not re.match(r'https?://', u): u = 'https://' + u
    return u if re.match(r'https?://[\w.-]+\.\w{2,}', u) else ''

def sec_de(i):
    s = i.get('seccao') or {}
    s = s.get('data') or s
    s = (s.get('attributes') or s) if isinstance(s, dict) else {}
    return SEC.get(str(s.get('codigo') or '').upper())

def oferta(i, geo):
    lat, lng = i.get('latitude'), i.get('longitude')
    if (lat is None or lng is None) and i.get('id') in geo: lng, lat = geo[i['id']][:2]
    slug = i.get('slug')
    o = {'id': i['id'], 't': sem_ordem(html.unescape(str(i.get('titulo') or '')).strip()), 'ent': html.unescape(str(i.get('nome') or '')).strip(),
         'loc': html.unescape(str(i.get('local') or '')).strip(), 'sec': sec_de(i) or geo.get(i['id'], [None, None, None])[2],
         'lat': round(float(lat), 5) if lat is not None else None, 'lng': round(float(lng), 5) if lng is not None else None,
         'prazo': (i.get('prazo_envio') or '')[:10], 'pub': (i.get('publishedAt') or i.get('createdAt') or '')[:10],
         'resumo': texto(i.get('resumo_oferta'), 420), 'resumo_txt': texto_longo(i.get('resumo_oferta')),
         'descricao': texto_longo(i.get('descricao')), 'funcoes': texto_longo(i.get('funcoes')), 'requisitos': texto_longo(i.get('requisitos_minimos')),
         'email': email_ok(i.get('email_para_envio_cv')) or email_ok(i.get('email')),
         'entrevista': texto(i.get('contacto_entrevista'), 300), 'site': url_ok(i.get('website'))}
    if o['descricao'] and o['descricao'] == o['resumo_txt']: o['descricao'] = ''
    if o['entrevista'] and re.sub(r'\W', '', o['entrevista'].lower()) in (re.sub(r'\W', '', o['email']), re.sub(r'\W', '', o['site'].lower())): o['entrevista'] = ''
    return o

def recolher():
    ses = requests.Session(); ses.headers.update(UA)
    r = ses.get(LISTA.format(p=1), timeout=40); r.raise_for_status()
    pp = next_data(r.text)
    pag = pp['empregos']['pagination']
    geo = {}
    for f in (pp.get('empregosMap') or {}).get('features', []):
        try:
            pr = f['properties']; c = f['geometry']['coordinates']
            s = pr.get('seccao') or {}
            geo[int(pr['id'])] = [c[0], c[1], SEC.get(str(s.get('codigo') or '').upper())]
        except Exception:
            continue
    itens = list(pp['empregos']['data'])
    for p in range(2, int(pag['pageCount']) + 1):
        r = ses.get(LISTA.format(p=p), timeout=40); r.raise_for_status()
        itens += next_data(r.text)['empregos']['data']
    log(f'Bolsa de emprego: {len(itens)} de {pag["total"]} ofertas lidas em {pag["pageCount"]} páginas')
    return itens, int(pag['total']), geo

def main():
    antes = json.loads(FICH.read_text(encoding='utf-8')) if FICH.exists() else None
    try:
        itens, total, geo = recolher()
    except Exception as ex:
        log('Bolsa de emprego: falhou', ex); return fim()
    if total and len(itens) < total * 0.9:
        log('Bolsa de emprego: recolha incompleta, os dados ficam como estavam'); return fim()
    vistos, ofertas = set(), []
    for i in itens:
        if i.get('id') in vistos or (i.get('estado') and i['estado'] != 'Aprovado'): continue
        vistos.add(i.get('id'))
        o = oferta(i, geo)
        if o['prazo'] and o['prazo'] < HOJE: continue          # prazo de candidatura ultrapassado
        ofertas.append(o)
    ofertas.sort(key=lambda o: (o['pub'], o['id']), reverse=True)
    sem = [o['id'] for o in ofertas if not o['sec']]
    if sem: log('  sem região:', sem)
    novo = {'actualizado': HOJE, 'v': 2, 'total_fonte': total, 'ofertas': ofertas}
    if antes and {k: v for k, v in antes.items() if k != 'actualizado'} == {k: v for k, v in novo.items() if k != 'actualizado'}:
        log('Bolsa de emprego: sem alterações'); return fim()
    FICH.write_text(json.dumps(novo, ensure_ascii=False, indent=1) + '\n', encoding='utf-8')
    log(f'Bolsa de emprego: {len(ofertas)} ofertas em vigor gravadas')
    fim()

def fim():
    f = ROOT / 'ultima-recolha.txt'
    try:
        with f.open('a', encoding='utf-8') as fh: fh.write('\n'.join(LOG) + '\n')
    except Exception:
        pass

if __name__ == '__main__':
    main()
