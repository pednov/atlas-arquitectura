#!/usr/bin/env python3
"""Recolha diária do ATLAS: concursos (plataforma Encomenda) e notícias (Construir e ArchDaily).

Lê data/concursos.json e data/noticias.json, junta o que é novo e grava-os de volta.
O que já lá está (incluindo o que foi revisto à mão) nunca é apagado nem reescrito,
salvo a data de entrega de um concurso, que pode ter sido prorrogada.
Se uma fonte falhar, as fichas dessa fonte ficam como estavam.
"""
import html, json, re, sys, time, unicodedata
import xml.etree.ElementTree as ET
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

def get(url, tentativas=3, **kw):
    for i in range(tentativas):
        try:
            r = requests.get(url, headers=UA, timeout=30, **kw)
            if r.status_code >= 500 and i < tentativas - 1:
                time.sleep(8 * (i + 1)); continue
            r.raise_for_status()
            return r
        except requests.ConnectionError:
            if i == tentativas - 1: raise
            time.sleep(8 * (i + 1))

def load(name):
    return json.loads((DATA / name).read_text(encoding='utf-8'))

def save(name, obj):
    (DATA / name).write_text(json.dumps(obj, ensure_ascii=False, indent=1) + '\n', encoding='utf-8')

CONC = load('concelhos.json')                      # nome do concelho -> região
CONC_F = {fold(k): v for k, v in CONC.items()}
REGRAS = load('regras.json')
BLOQ = {x.rstrip('/') for x in REGRAS.get('bloquear_urls', [])}

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

# ---------------------------------------------------------------- notícias: região, Nacional ou Internacional
ESTR = {re.sub(r'[^a-z0-9]+', ' ', fold(x)).strip(): x for x in REGRAS.get('estrangeiro', [])}
# distritos, regiões e alguns lugares que não são concelhos (em português e em inglês, como aparecem no ArchDaily)
LUGARES = {'acores': 'ACORES', 'azores': 'ACORES', 'madeira': 'MAD', 'algarve': 'ALG', 'faro district': 'ALG',
           'lisbon': 'LVT', 'lisbon district': 'LVT', 'setubal district': 'LVT', 'santarem district': 'LVT',
           'oporto': 'NORTE', 'porto district': 'NORTE', 'braga district': 'NORTE', 'viana do castelo district': 'NORTE',
           'vila real district': 'NORTE', 'braganca district': 'NORTE', 'aveiro district': 'CENTRO', 'coimbra district': 'CENTRO',
           'leiria district': 'CENTRO', 'viseu district': 'CENTRO', 'guarda district': 'CENTRO', 'castelo branco district': 'CENTRO',
           'evora district': 'ALT', 'beja district': 'ALT', 'portalegre district': 'ALT', 'alentejo': 'ALT',
           'comporta': 'ALT', 'melides': 'ALT', 'douro': 'NORTE', 'minho': 'NORTE'}

def estrangeiro_de(*textos):
    """País ou cidade estrangeira citada como lugar («na Argélia», «em Paris», «in Madrid»), ou como parte do campo de lugar."""
    for t in textos:
        ft = ' ' + re.sub(r'[^a-z0-9]+', ' ', fold(t)) + ' '
        for nf, nome in ESTR.items():
            if re.search(r' (?:em|en|in|no|na|nos|nas|para o|para a|ao|a) ' + re.escape(nf) + ' ', ft):
                return nome
        for parte in re.split(r'[·,;/]', t or ''):
            if re.sub(r'[^a-z0-9]+', ' ', fold(parte)).strip() in ESTR:
                return parte.strip()
    return None

def lugar_sec(lugar):
    """Região de um lugar escrito por extenso («Olhão», «Santa Bárbara, Açores», «Lisbon»)."""
    _, sec = regiao_do_local(lugar)
    if sec: return sec
    for parte in reversed([p for p in re.split(r'[,;/]', lugar or '') if p.strip()]):
        f = re.sub(r'[^a-z0-9]+', ' ', fold(parte)).strip()
        if f in LUGARES: return LUGARES[f]
    return None

def seccao_noticia(sec, *textos):
    """Região (se houver), senão Internacional quando a notícia se passa no estrangeiro, senão Nacional."""
    if sec: return sec, None
    est = estrangeiro_de(*textos)
    return ('INT', est) if est else ('NAC', None)

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
         ('Instituições', r'\bacervo|protocolo|esp[oó]lio|arquivo'), ('Espaço público', r'\blargo\b|\bpra[cç]a\b|espa[cç]o p[uú]blico|jardim'),
         ('Mobilidade', r'mobilidade|\bmetro\b|autocarro|ciclovia|bicicleta|tr[aâ]nsito|estacionamento|\bcarris\b|ferrovi'),
         ('Urbanismo', r'urban|\bPDM\b|loteament|licenciament|planeamento|\bbairro')]
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
    pub, acompanhados = {}, set()                       # data de publicação e concursos acompanhados pela plataforma
    for path in ['/concursos/oasrs', '/concursos', '/concursos?page=2', '/concursos/outros']:
        try:
            soup = BeautifulSoup(get(ENC + path).text, 'html.parser')
        except Exception as ex:
            log('Encomenda: falhou', path, ex); continue
        for a in soup.select('a[href*="/concursos/detalhe/"]'):
            u = a['href'].split('?')[0]
            if u.startswith('/'): u = ENC + u
            m = re.search(r'(\d{4}-\d{2}-\d{2})', a.get_text(' ', strip=True))
            if m: pub.setdefault(u, m.group(1))
            if path == '/concursos/oasrs': acompanhados.add(u)
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
        titulo_orig = bh.select_one('h2').get_text(' ', strip=True) if bh.select_one('h2') else ''
        titulo = limpar(titulo_orig)
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
        # recomendação: «sim» para concursos acompanhados (lista «em curso» da plataforma ou assessoria indicada no título),
        # «nao» para procedimentos analisados com reservas, None quando não há apreciação
        rec = 'nao' if analise else ('sim' if (u in acompanhados or re.search(r'assessoria', titulo_orig, flags=re.I)) else None)
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
             'fonte': 'encomenda', 'url': u, 'links': links[:4], 'recomendacao': rec, 'publicado': pub.get(u), 'auto': True}
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
        sec, fora = seccao_noticia(sec, t, ex)
        autor = limpar(autoria_de(ex))
        m = ' · '.join(x for x in [autor, local or fora] if x)
        n = {'d': p['date'][:10], 'f': 'construir', 'tema': tema_de(t + ' ' + ex), 't': t, 'm': m, 'u': u, 'sec': sec, 'auto': True}
        if img: n['img'] = img
        log('  nova notícia (Construir):', n['d'], t, '| imagem' if img else '| sem imagem')
        novos.append(n)
    return novos

# ---------------------------------------------------------------- notícias de cidade: Lisboa Para Pessoas e ECO
# Pedido do Pedro (18 Nov. 2026): urbanismo, arquitectura, viver em cidades e problemas urbanos. Guardamos título, data,
# imagem e ligação, sem resumos, e no máximo CIDADE_MAX notícias de cada fonte.
CIDADE_MAX = 15
URBANO = r'urban|arquitect|arquitet|habita|\bcasas?\b|rendas?\b|cidade|bairro|c[aâ]mara|autarqu|\bobras?\b|reabilit|mobilidade|\bmetro\b|ciclov|espa[cç]o p[uú]blico|\bPDM\b|licenciament|loteament|constru[cç]|jardim|pra[cç]a|\bruas?\b|cal[cç]ad|patrim[oó]n'
NEGOCIO = r'\b(investidor|investidores|fundos?|aquisi[cç][aã]o|adquire|vende|vendas|compra|lucros?|receitas|bolsa|a[cç][oõ]es|resultados|fatura[cç][aã]o|IPO)\b'

LPP = 'https://lisboaparapessoas.pt'
LPP_TEMA = {200: 'Habitação', 563: 'Mobilidade', 11: 'Cidade', 80: 'Opinião', 86: 'Cidadania', 547: 'Exposição'}
def lisboaparapessoas(existentes):
    urls = {n['u'].rstrip('/') for n in existentes}
    novos = []
    try:
        posts = get(LPP + '/wp-json/wp/v2/posts?per_page=30&_embed=wp:featuredmedia&_fields=date,link,title,categories,_links,_embedded').json()
    except Exception as ex:
        log('Lisboa Para Pessoas: falhou', ex); return []
    for p in posts:
        u = (p.get('link') or '').rstrip('/')
        if not u or u in urls or u in BLOQ: continue
        t = limpar(html.unescape(re.sub(r'<[^>]+>', '', (p.get('title') or {}).get('rendered', ''))).strip())
        if not t or excluir(t):
            log('  excluída (Lisboa Para Pessoas):', t); continue
        cats = p.get('categories') or []
        tema = next((LPP_TEMA[c] for c in cats if c in LPP_TEMA), None) or tema_de(t).replace('Obra', 'Cidade')
        local, sec = regiao_de(t)
        img = None
        try:
            med = (p.get('_embedded') or {}).get('wp:featuredmedia') or []
            sz = (med[0].get('media_details') or {}).get('sizes') or {}
            cand = (sz.get('medium') or sz.get('medium_large') or {}).get('source_url') or med[0].get('source_url')
            if cand and not tem_pessoas(cand): img = cand
        except Exception:
            pass
        n = {'d': p['date'][:10], 'f': 'lpp', 'tema': tema, 't': t, 'm': local or 'Lisboa', 'u': u, 'sec': sec or 'LVT', 'auto': True}
        if img: n['img'] = img
        novos.append(n)
    novos.sort(key=lambda n: n['d'], reverse=True)
    for n in novos[:CIDADE_MAX]:
        log('  nova notícia (Lisboa Para Pessoas):', n['d'], n['t'], '| imagem' if n.get('img') else '| sem imagem')
    return novos[:CIDADE_MAX]

ECO = 'https://eco.sapo.pt'
ECO_TOPICOS = ['habitacao', 'crise-na-habitacao', 'local-online', 'imobiliario']
ECO_CATS = {'Habitação', 'Crise na Habitação', 'Urbanismo', 'Arquitetura', 'Mobilidade', 'Autarquias', 'Obras Públicas', 'Construção', 'Reabilitação Urbana', 'Cidades', 'Ordenamento do Território'}
def eco(existentes):
    from email.utils import parsedate_to_datetime
    urls = {n['u'].rstrip('/') for n in existentes}
    novos, vistos = [], set()
    for top in ECO_TOPICOS:
        try:
            raiz = ET.fromstring(get(f'{ECO}/topico/{top}/feed/').content)
        except Exception as ex:
            log('ECO: falhou o tópico', top, ex); continue
        for it in raiz.iter('item'):
            txt = lambda tag: (it.findtext(tag) or '').strip()
            u = txt('link').split('?')[0].rstrip('/')
            if not u or u in urls or u in BLOQ or u in vistos: continue
            vistos.add(u)
            t = limpar(html.unescape(txt('title')))
            cats = {(c.text or '').strip() for c in it.findall('category')}
            if not t: continue
            relevante = (cats & ECO_CATS) or re.search(URBANO, t, flags=re.I)
            if not relevante or re.search(NEGOCIO, t, flags=re.I) or excluir(t):
                continue
            try:
                d = parsedate_to_datetime(txt('pubDate')).date().isoformat()
            except Exception:
                continue
            img = None
            mi = re.search(r'<img[^>]+src="([^"]+)"', txt('description'))
            if mi:
                cand = mi.group(1).split('?')[0] + '?w=300&fit=crop'
                if not tem_pessoas(cand): img = cand
            local, sec = regiao_de(t)
            tema = 'Habitação' if cats & {'Habitação', 'Crise na Habitação'} else ('Mobilidade' if 'Mobilidade' in cats else tema_de(t).replace('Obra', 'Cidade'))
            n = {'d': d, 'f': 'eco', 'tema': tema, 't': t, 'm': local or '', 'u': u, 'sec': sec or 'NAC', 'auto': True}
            if img: n['img'] = img
            novos.append(n)
        time.sleep(1)
    novos.sort(key=lambda n: n['d'], reverse=True)
    for n in novos[:CIDADE_MAX]:
        log('  nova notícia (ECO):', n['d'], n['t'], '| imagem' if n.get('img') else '| sem imagem')
    return novos[:CIDADE_MAX]

# ---------------------------------------------------------------- notícias internacionais: Arquitectura Viva
# Pedido do Pedro (17 Nov. 2026). A listagem de artigos é carregada por um pedido interno da própria página
# (POST /listados/obtener_listado_ajax/...), que devolve os cartões em HTML. Guardamos título, data, imagem e
# ligação, sem resumos. Só categorias de actualidade (sem produtos nem empresas) e no máximo AV_MAX notícias.
AV = 'https://arquitecturaviva.com'
AV_CATS = {'44670': None, '42': 'Prémio', '46408': 'Exposição', '37': 'Urbanismo', '43': 'Necrologia'}
AV_MAX = 20
def arquitecturaviva(existentes):
    urls = {n['u'].rstrip('/') for n in existentes}
    ses = requests.Session()
    ses.headers.update(UA); ses.headers['Accept-Language'] = 'es-ES,es;q=0.9'
    try:
        ses.get(AV + '/articulos', timeout=30)
    except Exception as ex:
        log('Arquitectura Viva: falhou', ex); return []
    novos, vistos = [], set()
    for cat, tema_cat in AV_CATS.items():
        datos = f'text_search=&date-range=1980-{HOJE.year}&entidad=articulos&lang=es&orden=reciente&pagina=1&categoria={cat}'
        j = None
        for tentativa in range(3):
            try:
                r = ses.post(AV + '/listados/obtener_listado_ajax/articulos/es/1', data={'datos': datos},
                             headers={'X-Requested-With': 'XMLHttpRequest', 'Referer': AV + '/articulos'}, timeout=40)
                j = r.json(); break
            except Exception as ex:
                if tentativa == 2: log('Arquitectura Viva: falhou a categoria', cat, ex)
                time.sleep(4 * (tentativa + 1))
        if not j: continue
        soup = BeautifulSoup(j.get('items') or '', 'html.parser')
        for a in soup.select('article.result'):
            link = a.get('data-link') or ''
            if not link.startswith('/articulos/'): continue
            u = (AV + link).rstrip('/')
            if u in urls or u in BLOQ or u in vistos: continue
            vistos.add(u)
            t = limpar(html.unescape(a.get('data-titulo') or '').strip())
            try:
                dd, mm, aa = (a.get('data-fecha') or '').split('/'); d = f'{aa}-{mm}-{dd}'
            except ValueError:
                continue
            if not t or excluir(t):
                log('  excluída (Arquitectura Viva):', t); continue
            img = None
            el = a.select_one('.result__img')
            mi = re.search(r"url\(['\"]?([^'\")]+)", (el.get('style') if el else '') or '')
            if mi:
                cand = mi.group(1) if mi.group(1).startswith('http') else AV + mi.group(1)
                if not tem_pessoas(cand): img = cand
            local, sec = regiao_de(re.sub(r'\bOporto\b', 'Porto', re.sub(r'\ben\b', 'em', t)))
            pais = (a.get('data-pais') or '').strip()
            fora = None
            if not sec:
                fora = estrangeiro_de(t) or (pais if pais and fold(pais) != 'portugal' else None)
                sec = 'INT'
            n = {'d': d, 'f': 'arquitecturaviva', 'tema': tema_cat or tema_de(t).replace('Obra', 'Actualidade'),
                 't': t, 'm': local or fora or '', 'u': u, 'sec': sec, 'auto': True}
            if img: n['img'] = img
            novos.append(n)
        time.sleep(1)
    novos.sort(key=lambda n: n['d'], reverse=True)
    for n in novos[:AV_MAX]:
        log('  nova notícia (Arquitectura Viva):', n['d'], n['t'], '| imagem' if n.get('img') else '| sem imagem')
    return novos[:AV_MAX]

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
        # lugar da obra: «Completed in 2026 in Olhão, Portugal.» na descrição, ou «Santa Bárbara,Açores,Portugal» nos metadados
        desc = meta('og:description') or meta('description') or ''
        mm = re.search(r'\bin ([^.]+?),\s*Portugal\b', desc)
        lugar = mm.group(1).rsplit(' in ', 1)[-1].strip() if mm else ''
        sec = lugar_sec(lugar) if lugar else None
        if not sec:
            for mm in re.finditer(r'([A-Za-zÀ-ÿ\' .\-]{2,40}(?:,\s*[A-Za-zÀ-ÿ\' .\-]{2,40}){1,2}),\s*Portugal\b', texto):
                sec = lugar_sec(mm.group(1))
                if sec:
                    lugar = lugar or mm.group(1).split(',')[0].strip(); break
        if not sec:
            _, sec = regiao_de(nome, desc)
        sec = sec or 'NAC'                                 # todas as obras desta página são em Portugal
        m = ' · '.join(x for x in [limpar(autor), lugar] if x)
        n = {'d': d, 'f': 'archdaily', 'tema': 'Obra', 't': limpar(nome), 'm': m, 'u': u.split('?')[0], 'sec': sec, 'auto': True}
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

    novos_n = (construir(N['noticias']) + archdaily(N['noticias']) + lisboaparapessoas(N['noticias'])
               + eco(N['noticias']) + arquitecturaviva(N['noticias']))
    for fid, nome, url in [('lpp', 'Lisboa Para Pessoas', LPP), ('eco', 'ECO', ECO + '/topico/habitacao/'),
                           ('arquitecturaviva', 'Arquitectura Viva', AV + '/articulos')]:
        if not any(f['id'] == fid for f in N['fontes']):
            N['fontes'].append({'id': fid, 'nome': nome, 'url': url})
    bloq = {x.rstrip('/') for x in REGRAS.get('bloquear_urls', [])}
    limite_n = (HOJE - timedelta(days=120)).isoformat()      # notícias com mais de 4 meses saem
    todas = []
    for n in N['noticias'] + novos_n:
        if n['d'] < limite_n or n['u'].rstrip('/') in bloq: continue
        if n.get('auto') and excluir(n['t'], n.get('m', '')):   # regras novas valem também para o que a recolha já trouxe
            log('  retirada:', n['t']); continue
        if not n.get('sec'): n['sec'] = 'NAC'
        todas.append(n)
    vistos, N['noticias'] = set(), []
    for n in sorted(todas, key=lambda n: n['d'], reverse=True):
        if n['u'] not in vistos:
            vistos.add(n['u']); N['noticias'].append(n)
    # fontes com limite próprio, para não tomarem o lugar das notícias de arquitectura
    LIMITE = {'arquitecturaviva': AV_MAX, 'lpp': CIDADE_MAX, 'eco': CIDADE_MAX}
    conta, ficam = {}, []
    for n in N['noticias']:
        conta[n['f']] = conta.get(n['f'], 0) + 1
        if conta[n['f']] <= LIMITE.get(n['f'], 10**6): ficam.append(n)
    N['noticias'] = ficam[:130]

    mudou_c = json.dumps(C, sort_keys=True) != antes_c
    mudou_n = json.dumps(N, sort_keys=True) != antes_n
    if mudou_c: C['actualizado'] = HOJE.isoformat(); save('concursos.json', C)
    if mudou_n: N['actualizado'] = HOJE.isoformat(); save('noticias.json', N)
    log(f'Concursos: {len(novos_c)} novos, {len(C["concursos"])} no total. Notícias: {len(novos_n)} novas, {len(N["noticias"])} no total.')
    log('Sem alterações.' if not (mudou_c or mudou_n) else 'Dados gravados.')
    (ROOT / 'ultima-recolha.txt').write_text(f'{datetime.now(timezone.utc):%Y-%m-%d %H:%M} UTC\n' + '\n'.join(LOG) + '\n', encoding='utf-8')

if __name__ == '__main__':
    main()
