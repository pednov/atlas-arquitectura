#!/usr/bin/env python3
"""Recolha diária do ATLAS: concursos (plataforma Encomenda) e notícias (Construir e ArchDaily).

Lê data/concursos.json e data/noticias.json, junta o que é novo e grava-os de volta.
O que já lá está (incluindo o que foi revisto à mão) nunca é apagado nem reescrito,
salvo a data de entrega de um concurso, que pode ter sido prorrogada.
Se uma fonte falhar, as fichas dessa fonte ficam como estavam.
"""
import html, json, re, sys, unicodedata
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

import requests
from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / 'data'
HOJE = datetime.now(timezone.utc).date()
UA = {'User-Agent': 'Mozilla/5.0 (compatible; ATLAS-recolha/1.0; +https://atlas-arquitectura.netlify.app)',
      'Accept-Language': 'pt-PT,pt;q=0.9'}
LOG = []

def log(*a):
    msg = ' '.join(str(x) for x in a)
    LOG.append(msg); print(msg, flush=True)

def fold(s):
    return unicodedata.normalize('NFD', str(s or '')).encode('ascii', 'ignore').decode().lower()

def get(url, **kw):
    r = requests.get(url, headers=UA, timeout=30, **kw)
    r.raise_for_status()
    return r

def load(name):
    return json.loads((DATA / name).read_text(encoding='utf-8'))

def save(name, obj):
    (DATA / name).write_text(json.dumps(obj, ensure_ascii=False, indent=1) + '\n', encoding='utf-8')

CONC = load('concelhos.json')                      # nome do concelho -> região
CONC_F = {fold(k): v for k, v in CONC.items()}
REGRAS = load('regras.json')
BLOQ = set(REGRAS.get('bloquear_urls', []))

def limpar(s):
    """Retira do texto as referências à Ordem dos Arquitectos e às suas secções (regra editorial do ATLAS)."""
    s = html.unescape(re.sub(r'<[^>]+>', '', str(s or ''))).strip()
    for pat in REGRAS['limpar']:
        s = re.sub(pat, '', s, flags=re.I).strip(' –-,·')
    return re.sub(r'\s{2,}', ' ', s).strip()

def _nome(nome_f):
    return next(k for k in CONC if fold(k) == nome_f)

def regiao_do_local(local):
    """Campo de localização (só lugares, por exemplo «Moreira, Maia»): o último concelho reconhecido."""
    for parte in reversed([p.strip() for p in re.split(r'[,;/]', local or '') if p.strip()]):
        f = re.sub(r'[^a-z0-9]+', ' ', fold(parte)).strip()
        if f in CONC_F: return _nome(f), CONC_F[f]
    return None, None

def regiao_de(*textos):
    """Concelho citado como lugar («em Lisboa», «no Porto», «in Beloura»), para não confundir apelidos com concelhos."""
    for t in textos:
        ft = ' ' + re.sub(r'[^a-z0-9]+', ' ', fold(t)) + ' '
        best = None
        for nome_f, sec in CONC_F.items():
            m = re.search(r' (?:em|in|no|na|nos|nas) ' + re.escape(nome_f) + ' ', ft)
            if m and (best is None or m.start() < best[0] or (m.start() == best[0] and len(nome_f) > len(best[1]))):
                best = (m.start(), nome_f, sec)
        if best: return _nome(best[1]), best[2]
    return None, None

def excluir(*textos):
    t = ' '.join(textos)
    return any(re.search(p, t, flags=re.I) for p in REGRAS['excluir'])

# ---------------------------------------------------------------- imagens: sem retratos de pessoas
_cascade = None
def tem_pessoas(url):
    """True se a imagem mostra rostos em destaque (retrato ou fotografia de grupo). Em caso de dúvida, True."""
    global _cascade
    try:
        import cv2, numpy as np
        if _cascade is None:
            _cascade = cv2.CascadeClassifier(cv2.data.haarcascades + 'haarcascade_frontalface_default.xml')
        img = cv2.imdecode(np.frombuffer(get(url).content, np.uint8), cv2.IMREAD_GRAYSCALE)
        if img is None: return True
        h, w = img.shape[:2]
        if h > w * 1.08: return True                       # imagens ao alto são quase sempre retratos
        k = 600 / max(w, h)
        if k < 1: img = cv2.resize(img, (int(w * k), int(h * k)))
        faces = _cascade.detectMultiScale(img, scaleFactor=1.1, minNeighbors=6, minSize=(24, 24))
        grandes = [f for f in faces if f[2] >= img.shape[1] * 0.06]
        return len(grandes) > 0
    except Exception as ex:
        log('  imagem não verificada:', url, ex)
        return True

# ---------------------------------------------------------------- tema das notícias
TEMAS = [('Concurso', r'\bconcurso'), ('Prémio', r'pr[eé]mio|\bvence|distingu|awards?\b|galard|men[cç][aã]o honrosa|masterprize'),
         ('Exposição', r'exposi[cç]|trienal|bienal|\bmostra\b'), ('Habitação', r'habita[cç]|\bcasas\b|\bfogos\b'),
         ('Património', r'patrim[oó]n|restauro|reabilita'), ('Debate', r'debate|confer[eê]ncia|semin[aá]rio|col[oó]quio'),
         ('Instituições', r'\bacervo|protocolo|esp[oó]lio|arquivo'), ('Espaço público', r'\blargo\b|\bpra[cç]a\b|espa[cç]o p[uú]blico|jardim')]
def tema_de(texto):
    for t, p in TEMAS:
        if re.search(p, texto, flags=re.I): return t
    return 'Obra'

NOME = r"[A-ZÁÉÍÓÚÂÊÔÃÕÇ][\w'’\.\-]+(?:\s+(?:de|da|do|dos|das|e|&)?\s*[A-ZÁÉÍÓÚÂÊÔÃÕÇ0-9][\w'’\.\-]+){0,3}"
def autoria_de(texto):
    m = re.search(r'(?:arquitect[oa]s?|atelier|est[uú]dio|gabinete)\s+(' + NOME + ')', texto)
    return m.group(1).strip(' .,') if m else ''

# ---------------------------------------------------------------- concursos: plataforma Encomenda
ENC = 'https://encomenda.oasrs.org'
def encomenda(existentes):
    novos, vistos = [], set()
    for path in ['/concursos', '/concursos?page=2', '/concursos/oasrs', '/concursos/outros']:
        try:
            soup = BeautifulSoup(get(ENC + path).text, 'html.parser')
        except Exception as ex:
            log('Encomenda: falhou', path, ex); continue
        for a in soup.select('a[href*="/concursos/detalhe/"]'):
            u = a['href'].split('?')[0]
            if u.startswith('/'): u = ENC + u
            if u in vistos: continue
            vistos.add(u)
    log('Encomenda:', len(vistos), 'fichas na listagem')
    por_url = {c['url']: c for c in existentes}
    for u in sorted(vistos):
        try:
            soup = BeautifulSoup(get(u).text, 'html.parser')
        except Exception as ex:
            log('  ficha falhou', u, ex); continue
        bh = soup.select_one('#billhead')
        if not bh: continue
        titulo = limpar((bh.select_one('h2') or {}).get_text(' ', strip=True) if bh.select_one('h2') else '')
        info = {}
        for m in bh.select('.middle, .entrega'):
            sp = [x.get_text(' ', strip=True) for x in m.select('span')]
            if len(sp) >= 2: info[fold(sp[0])] = sp[1]
        entrega = next((v for k, v in info.items() if re.fullmatch(r'\d{4}-\d{2}-\d{2}', v)), None)
        if not titulo or not entrega: continue
        if u in por_url:                                   # já existe: só se actualiza o prazo
            c = por_url[u]
            if c['entrega'][:10] != entrega:
                log('  prazo alterado', titulo, c['entrega'][:10], '->', entrega)
                c['entrega'] = entrega + c['entrega'][10:] if len(c['entrega']) > 10 else entrega
            continue
        local = limpar(info.get('localizacao', ''))
        concelho, sec = regiao_do_local(local)
        if not sec: concelho, sec = regiao_do_local(titulo.rsplit(',', 1)[-1])
        if local and fold(titulo).endswith(fold(', ' + local)):
            titulo = titulo[: -len(local) - 2].strip()
        analise = re.match(r'an[aá]lise\s*[–-]\s*', titulo, flags=re.I)
        if analise: titulo = titulo[analise.end():]
        texto = soup.select_one('#info').get_text(' ', strip=True) if soup.select_one('#info') else ''
        ft = fold(texto)
        tipo = ('Concurso de ideias' if 'concurso de ideias' in ft or 'concurso publico de ideias' in ft else
                'Aquisição de serviços' if 'aquisicao de servicos' in ft else
                'Concurso de concepção' if 'concep' in ft or 'conce' in ft else 'Concurso')
        links = []
        for a in soup.select('#info a[href]'):
            t = limpar(a.get_text(' ', strip=True)); h = a['href']
            if '/media/' in h and re.search(r'an[uú]ncio|termos|programa|regulamento', t, flags=re.I):
                links.append([t[:40], h])
        c = {'id': re.sub(r'[^a-z0-9]+', '-', fold(titulo)).strip('-')[:60], 'titulo': titulo,
             'promotor': limpar(info.get('promotor', '')) or None, 'concelho': concelho, 'sec': sec,
             'local': local or None, 'programa': limpar(info.get('programa', '')) or None, 'tipo': tipo,
             'entrega': entrega, 'esclarecimentos': None, 'premios': [], 'valor_base': None, 'custo_obra': None,
             'fonte': 'encomenda', 'url': u, 'links': links[:4], 'auto': True}
        if analise:
            c['nota'] = 'Procedimento analisado na plataforma Encomenda. Ver a análise na ficha original.'
        if excluir(titulo, c['promotor'] or ''): continue
        if entrega < (HOJE - timedelta(days=30)).isoformat():
            continue                                       # procedimento antigo, já fora de prazo
        log('  novo concurso:', titulo, entrega, sec)
        novos.append(c)
    return novos

# ---------------------------------------------------------------- notícias: Construir (WordPress)
def construir(existentes):
    urls = {n['u'].rstrip('/') for n in existentes}
    api = 'https://backoffice.construir.pt/wp-json/wp/v2/posts?categories=3&per_page=40&_embed=wp:featuredmedia'
    try:
        posts = get(api).json()
    except Exception as ex:
        log('Construir: falhou', ex); return []
    novos = []
    for p in posts:
        u = p['link'].replace('://www.', '://').rstrip('/')
        if u in urls or u in BLOQ: continue
        t = limpar(p['title']['rendered'])
        ex = html.unescape(re.sub(r'<[^>]+>', ' ', p.get('excerpt', {}).get('rendered', ''))).strip()
        if excluir(t, ex):
            log('  excluída:', t); continue
        img = None
        try:
            md = p['_embedded']['wp:featuredmedia'][0]['media_details']
            sz = md.get('sizes', {})
            pick = sz.get('newsletter-medium') or sz.get('medium') or sz.get('website-medium-vertical')
            cand = pick['source_url'] if pick else None
            if cand and md.get('height', 0) <= md.get('width', 1) * 1.08 and not tem_pessoas(cand):
                img = cand
        except Exception:
            pass
        local, sec = regiao_de(t, ex)
        autor = limpar(autoria_de(ex))
        m = ' · '.join(x for x in [autor, local] if x)
        n = {'d': p['date'][:10], 'f': 'construir', 'tema': tema_de(t + ' ' + ex), 't': t, 'm': m, 'u': u, 'auto': True}
        if sec: n['sec'] = sec
        if img: n['img'] = img
        log('  nova notícia (Construir):', n['d'], t, '| imagem' if img else '| sem imagem')
        novos.append(n)
    return novos

# ---------------------------------------------------------------- notícias: ArchDaily (obras em Portugal)
def archdaily(existentes):
    ids = {re.search(r'archdaily\.com/(\d+)/', n['u']).group(1) for n in existentes if 'archdaily' in n['u'] and re.search(r'archdaily\.com/(\d+)/', n['u'])}
    try:
        page = get('https://www.archdaily.com/country/portugal').text
    except Exception as ex:
        log('ArchDaily: falhou', ex); return []
    links, lista = [], []
    for m in re.finditer(r'https://www\.archdaily\.com/(\d{6,8})/([a-z0-9\-]+)(\?ad_campaign=normal-tag)?', page):
        par = (m.group(1), 'https://www.archdaily.com/' + m.group(1) + '/' + m.group(2))
        if m.group(3) and par not in lista: lista.append(par)
        if par not in links: links.append(par)
    links = lista + [x for x in links if x not in lista]    # primeiro a lista principal, depois o resto (cada ficha é verificada)
    log('ArchDaily:', len(links), 'obras na página de Portugal')
    novos = []
    for aid, u in links[:30]:
        if aid in ids: continue
        try:
            soup = BeautifulSoup(get(u).text, 'html.parser')
        except Exception as ex:
            log('  ficha falhou', u, ex); continue
        meta = lambda prop: (soup.find('meta', attrs={'property': prop}) or soup.find('meta', attrs={'name': prop}) or {}).get('content')
        titulo = (meta('og:title') or '').replace(' | ArchDaily', '').strip()
        if not titulo or ' / ' not in titulo or titulo.lower().startswith('ad classics'):
            continue                                       # só fichas de obra («Obra / Autor»), não artigos
        texto = str(soup)
        if 'archdaily.com/country/portugal' not in texto:
            log('  fora de Portugal:', titulo); continue
        nome, _, autor = titulo.partition(' / ')
        pub = meta('article:published_time') or ''
        if not pub:
            for s in soup.find_all('script', attrs={'type': 'application/ld+json'}):
                mm = re.search(r'"datePublished"\s*:\s*"([\d\-]{10})', s.string or '')
                if mm: pub = mm.group(1); break
        d = pub[:10] if re.match(r'\d{4}-\d{2}-\d{2}', pub) else HOJE.isoformat()
        img = meta('og:image')
        if img and tem_pessoas(img): img = None
        local, sec = regiao_de(nome)
        n = {'d': d, 'f': 'archdaily', 'tema': 'Obra', 't': limpar(nome), 'm': limpar(autor), 'u': u.split('?')[0], 'auto': True}
        if sec: n['sec'] = sec
        if img: n['img'] = img
        log('  nova obra (ArchDaily):', d, titulo)
        novos.append(n)
    return novos

# ---------------------------------------------------------------- principal
def main():
    C = load('concursos.json'); N = load('noticias.json')
    antes_c = json.dumps(C, sort_keys=True); antes_n = json.dumps(N, sort_keys=True)

    novos_c = encomenda(C['concursos'])
    limite_c = (HOJE - timedelta(days=550)).isoformat()      # fichas encerradas há mais de 18 meses saem
    C['concursos'] = [c for c in C['concursos'] + novos_c if c['entrega'][:10] >= limite_c]

    novos_n = construir(N['noticias']) + archdaily(N['noticias'])
    bloq = set(REGRAS.get('bloquear_urls', []))
    limite_n = (HOJE - timedelta(days=120)).isoformat()      # notícias com mais de 4 meses saem
    todas = [n for n in N['noticias'] + novos_n if n['d'] >= limite_n and n['u'] not in bloq]
    vistos, N['noticias'] = set(), []
    for n in sorted(todas, key=lambda n: n['d'], reverse=True):
        if n['u'] not in vistos:
            vistos.add(n['u']); N['noticias'].append(n)
    N['noticias'] = N['noticias'][:80]

    mudou_c = json.dumps(C, sort_keys=True) != antes_c
    mudou_n = json.dumps(N, sort_keys=True) != antes_n
    if mudou_c: C['actualizado'] = HOJE.isoformat(); save('concursos.json', C)
    if mudou_n: N['actualizado'] = HOJE.isoformat(); save('noticias.json', N)
    log(f'Concursos: {len(novos_c)} novos, {len(C["concursos"])} no total. Notícias: {len(novos_n)} novas, {len(N["noticias"])} no total.')
    log('Sem alterações.' if not (mudou_c or mudou_n) else 'Dados gravados.')
    (ROOT / 'ultima-recolha.txt').write_text(f'{datetime.now(timezone.utc):%Y-%m-%d %H:%M} UTC\n' + '\n'.join(LOG) + '\n', encoding='utf-8')

if __name__ == '__main__':
    main()
