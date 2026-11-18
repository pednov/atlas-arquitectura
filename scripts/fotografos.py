#!/usr/bin/env python3
"""Fotógrafos de arquitectura em Portugal, a partir do Divisare (pedido do Pedro, 18 Nov. 2026).

Lê a lista pública dos fotógrafos portugueses no Divisare e, de cada um, a página de autor: cidade,
sítio na internet e as obras mais recentes que lá publicou (título, lugar, autoria do projecto e ligação).
Guarda também o endereço de uma fotografia da obra mais recente, que a página mostra como «Portfolio» a partir
dos servidores do Divisare (pedido do Pedro, 18 Nov. 2026); a imagem não é copiada. Não guarda telefones, moradas nem emails.

Corre uma vez por semana (ou sempre, com --forcar). Tenta primeiro um pedido simples e, se o Divisare o
recusar, abre as páginas com o navegador sem janela (Playwright). Se a recolha falhar ou vier muito
incompleta, data/fotografos.json fica como estava.
"""
import json, re, sys, time
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

import requests
from bs4 import BeautifulSoup

sys.path.insert(0, str(Path(__file__).resolve().parent))
from actualizar import DATA, PAISES, ROOT, UA, fold, lugar_sec   # noqa: E402

BASE = 'https://divisare.com'
LISTA = BASE + '/photographers/europe/southern-europe/portugal'
FICH = DATA / 'fotografos.json'
HOJE = datetime.now(timezone.utc).date()
OBRAS_MAX = 6
CIDADES = {'oporto': ('Porto', 'NORTE'), 'lisbon': ('Lisboa', 'LVT'), 's miguel': ('São Miguel', 'ACORES'),
           'sao miguel': ('São Miguel', 'ACORES'), 'azores': ('Açores', 'ACORES'), 'madeira': ('Madeira', 'MAD')}
LOG = []

def log(*a):
    msg = ' '.join(str(x) for x in a)
    LOG.append(msg); print(msg, flush=True)


class Leitor:
    """Pedidos simples enquanto o Divisare os aceitar; depois, o navegador sem janela."""
    def __init__(self):
        self.ses = requests.Session(); self.ses.headers.update(UA)
        self.pw = None; self.pg = None

    def _requests(self, url):
        r = self.ses.get(url, timeout=40)
        if r.status_code in (403, 429, 503) or 'cf-chl' in r.text[:5000]:
            raise RuntimeError(f'recusado ({r.status_code})')
        r.raise_for_status()
        return r.text

    def _navegador(self, url):
        if not self.pg:
            from playwright.sync_api import sync_playwright
            self.pw = sync_playwright().start()
            b = self.pw.chromium.launch()
            self.pg = b.new_page(user_agent='Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36',
                                 locale='pt-PT')
            log('Divisare: a usar o navegador sem janela')
        self.pg.goto(url, wait_until='domcontentloaded', timeout=60000)
        return self.pg.content()

    def html(self, url):
        if not self.pg:
            try:
                return self._requests(url)
            except Exception as ex:
                log('  pedido simples falhou:', url, ex)
        return self._navegador(url)

    def fechar(self):
        if self.pw: self.pw.stop()


def cidade_de(txt):
    """«Porto | Lisboa» -> («Porto e Lisboa», 'NORTE'); «Oporto» -> («Porto», 'NORTE')."""
    nomes, sec = [], None
    for p in [p.strip() for p in re.split(r'\s*[|/;]\s*', txt or '') if p.strip()]:
        f = re.sub(r'[^a-z0-9]+', ' ', fold(p)).strip()
        nome, s = CIDADES.get(f, (p.title() if p.isupper() else p, None))
        s = s or lugar_sec(nome)
        if nome not in nomes: nomes.append(nome)
        sec = sec or s
    return ' e '.join(nomes), sec

def juntar(nomes):
    nomes = [n for n in nomes if n]
    return ', '.join(nomes[:-1]) + ' e ' + nomes[-1] if len(nomes) > 1 else ''.join(nomes)

def lista(leitor):
    soup = BeautifulSoup(leitor.html(LISTA), 'html.parser')
    out, vistos = [], set()
    for li in soup.select('li.author'):
        a = li.select_one('a.name')
        if not a or not (a.get('href') or '').startswith('/authors/'): continue
        u = BASE + a['href'].split('?')[0]
        m = re.match(r'/authors/(\d+)', a['href'])
        if not m or m.group(1) in vistos: continue
        vistos.add(m.group(1))
        c = li.select_one('a.city')
        cid, sec = cidade_de(c.get_text(' ', strip=True) if c else '')
        out.append({'id': m.group(1), 'n': a.get_text(' ', strip=True), 'c': cid, 'sec': sec or 'NAC', 'u': u})
    return out

def ficha(leitor, f):
    soup = BeautifulSoup(leitor.html(f['u']), 'html.parser')
    morada = soup.select_one('.sidebar .address')
    if morada:
        m = re.search(r'(https?://[^\s|]+|www\.[^\s|]+)', morada.get_text(' ', strip=True))
        if m:
            w = m.group(1).rstrip('.,;')
            f['w'] = w if w.startswith('http') else 'http://' + w
    obras = []
    f.pop('foto', None)
    for li in soup.select('li.project'):
        a = li.select_one('a.link')
        info = li.select_one('.info')
        if not a or not info or not (a.get('href') or '').startswith('/projects/'): continue
        titulo = next((s.strip() for s in info.find_all(string=True, recursive=False) if s.strip()), '')
        if not titulo:
            titulo = (a.get('title') or '').rsplit('. ', 1)[0]
        lugar, autores = '', []
        for div in info.find_all('div', recursive=False):
            tx = div.get_text(' ', strip=True)
            if re.match(r'(Architecture|Design|Landscape) by\b', tx, flags=re.I):
                autores = [x.get_text(' ', strip=True) for x in div.find_all('a')] or [re.sub(r'^\w+ by\s+', '', tx)]
            elif not lugar:
                lugar = tx
        if lugar:
            partes = [p.strip() for p in lugar.split(' - ') if p.strip()]
            lugar = partes[0] if partes and fold(partes[-1]) == 'portugal' else ', '.join(partes[:-1] + [PAISES.get(partes[-1], partes[-1])])
        o = {'t': titulo, 'u': BASE + a['href'].split('?')[0]}
        im = li.select_one('img')
        src = (im.get('data-src') or im.get('src') or '') if im else ''
        if 'foto' not in f and src.startswith('http') and '/images/' in src:
            # miniatura de 400 px pedida ao próprio Divisare (a transformação vai no caminho do endereço)
            f['foto'] = {'src': re.sub(r'/images/[^/]+/v', '/images/w_400,q_auto,f_auto/v', src, count=1), 't': titulo, 'u': o['u']}
        if lugar: o['l'] = lugar
        if autores: o['a'] = juntar(autores)
        obras.append(o)
        if len(obras) >= OBRAS_MAX: break
    f['obras'] = obras
    if soup.select_one('a[rel="next"]') or any(x.get_text(strip=True).startswith('Next') for x in soup.find_all('a')):
        f['mais'] = True
    return f

def main():
    antes = json.loads(FICH.read_text(encoding='utf-8')) if FICH.exists() else {}
    forcar = '--forcar' in sys.argv
    sem_foto = any('foto' not in f for f in antes.get('fotografos') or [])      # fichas anteriores à fotografia de portfolio
    if antes.get('actualizado') and not forcar and not sem_foto and date.fromisoformat(antes['actualizado']) > HOJE - timedelta(days=7):
        log(f'Fotógrafos: lista de {antes["actualizado"]}, ainda com menos de uma semana.'); return gravar_log()
    leitor = Leitor()
    try:
        fs = lista(leitor)
        log('Fotógrafos (Divisare):', len(fs), 'na lista de Portugal')
        n_antes = len(antes.get('fotografos') or [])
        if len(fs) < max(10, n_antes * 0.8):
            log('Fotógrafos: lista incompleta, fica a anterior.'); return gravar_log()
        velhos = {f['id']: f for f in antes.get('fotografos') or []}
        for i, f in enumerate(fs):
            try:
                ficha(leitor, f)
            except Exception as ex:
                log('  ficha falhou:', f['n'], ex)
                v = velhos.get(f['id'])
                if v: f.update({k: v[k] for k in ('w', 'obras', 'mais') if k in v})
            time.sleep(1.5)
        com = sum(1 for f in fs if f.get('obras'))
        if com < len(fs) * 0.6 and n_antes:
            log(f'Fotógrafos: só {com} fichas com obras, fica a lista anterior.'); return gravar_log()
        novo = {'actualizado': HOJE.isoformat(),
                'fonte': {'nome': 'Divisare', 'url': LISTA},
                'fotografos': fs}
        FICH.write_text(json.dumps(novo, ensure_ascii=False, indent=1) + '\n', encoding='utf-8')
        log(f'Fotógrafos: {len(fs)} gravados, {com} com obras publicadas.')
    except Exception as ex:
        log('Fotógrafos: falhou a recolha, fica a lista anterior.', ex)
    finally:
        leitor.fechar()
    gravar_log()

def gravar_log():
    p = ROOT / 'ultima-recolha.txt'
    antigo = p.read_text(encoding='utf-8') if p.exists() else ''
    p.write_text(antigo + '\n'.join(LOG) + '\n', encoding='utf-8')

if __name__ == '__main__':
    main()
