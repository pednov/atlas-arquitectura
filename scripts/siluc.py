"""
ATLAS · recolha diária do SILUC (Sistema de Informação da Legislação de Urbanismo e Construção).

O SILUC (www.siluc.pt) é uma plataforma oficial do LNEC, desenvolvida com a DGT e o IHRU.
Os avisos legais permitem copiar e usar a informação para uso pessoal ou público sem fins lucrativos.
Guardamos só a ficha resumida de cada diploma (título, número, datas, estado, sumário oficial,
temas, âmbito territorial e ligações). O texto dos diplomas fica no Diário da República.

O SILUC é uma aplicação OutSystems sem API pública. Abrimos a página «Consulta por tema» num
navegador sem janela (Playwright), apanhamos o pedido que a própria página faz aos resultados
e repetimo-lo, 200 diplomas de cada vez, com a mesma sessão. Assim não dependemos de chaves
internas que mudam sempre que o SILUC é republicado.

Escreve data/legislacao.json e acrescenta um resumo a ultima-recolha.txt.
"""
import json, re, sys, time, html
from datetime import datetime, timezone, timedelta
from pathlib import Path

from playwright.sync_api import sync_playwright

RAIZ = Path(__file__).resolve().parent.parent
SAIDA = RAIZ / 'data' / 'legislacao.json'
REGISTO = RAIZ / 'ultima-recolha.txt'
PAGINA = 'https://www.siluc.pt/siluc/consulta-por-tema'
POR_PEDIDO = 200
# os regimes que os arquitectos mais consultam: as alterações destes são lidas todos os dias
PRINCIPAIS = {'555/99', '18/2008', '38382', '220/2008', '1532/2008', '163/2006', '101-D/2020', '129/2002', '9/2007',
              '307/2009', '80/2015', '31/2014', '96/2008', '135/2023', '10/2024'}
linhas = []

def log(*a):
    s = ' '.join(str(x) for x in a)
    print(s, flush=True); linhas.append(s)

def data(s):
    s = (s or '')[:10]
    return None if not s or s.startswith('1900') else s

def texto(s):
    s = re.sub(r'<[^>]+>', ' ', s or '')
    return re.sub(r'\s+', ' ', html.unescape(s)).strip()

def lista(v):
    if isinstance(v, dict): return v.get('List') or []
    if isinstance(v, list): return v
    return [v] if v not in (None, '') else []

def recolher(escolher=None):
    cap = {}
    with sync_playwright() as p:
        nav = p.chromium.launch()
        ctx = nav.new_context(locale='pt-PT')
        pg = ctx.new_page()

        def pedido(req):
            if req.url.endswith('/DataActionGetResultados') and 'req' not in cap:
                cap['req'] = (req.url, req.all_headers(), req.post_data)
        def resposta(resp):
            if resp.url.endswith('consultaportema/DataActionGetTemas') and 'temas' not in cap:
                try: cap['temas'] = resp.json()
                except Exception: pass
        pg.on('request', pedido); pg.on('response', resposta)
        pg.goto(PAGINA, wait_until='networkidle', timeout=90000)
        for _ in range(60):
            if 'req' in cap and 'temas' in cap: break
            time.sleep(1)
        if 'req' not in cap:
            raise RuntimeError('a página do SILUC não fez o pedido de resultados')

        url, hdr, corpo = cap['req']
        cab = {k: v for k, v in hdr.items() if k.lower() in ('content-type', 'x-csrftoken', 'outsystems-locale', 'accept')}
        corpo = json.loads(corpo)
        var = corpo['screenData']['variables']
        var['MaxRecords'] = POR_PEDIDO

        hits, total, inicio = [], None, 0
        while total is None or inicio < total:
            var['StartIndex'] = inicio
            for tentativa in range(4):
                r = ctx.request.post(url, data=json.dumps(corpo), headers=cab, timeout=120000)
                if r.ok: break
                log(f'  SILUC respondeu {r.status} (início {inicio}), nova tentativa')
                time.sleep(5 * (tentativa + 1))
            else:
                raise RuntimeError(f'o SILUC falhou no início {inicio}')
            j = r.json()
            if j.get('versionInfo', {}).get('hasModuleVersionChanged'):
                log('  aviso: o SILUC diz que a aplicação mudou de versão a meio da recolha')
            resp = j['data']['Response']['Hits']
            total = int(resp['Total']['Value'])
            bloco = lista(resp['Hits'])
            if not bloco: break
            hits += bloco
            inicio += POR_PEDIDO
            time.sleep(1)                                      # sem pressa: são uma dúzia de pedidos por dia
        rel = {}
        if escolher:
            try:
                rel = relacoes(ctx, escolher(hits))
            except Exception as e:
                log(f'  aviso: as alterações e a regulamentação não foram lidas ({e})')
        nav.close()
    return hits, total, cap.get('temas'), rel

# ---------------------------------------------------------------- alterações, regulamentação e rectificações
# A ficha de cada diploma no SILUC lista «Alterado por», «Retificado por», «Regulamentado por», «Regulamenta» e
# «Adaptado às RA por». Estas listas não vêm nos resultados da pesquisa: a página da ficha pede-as com dois pedidos
# (DataActionGetAnaliseTecnica e DataActionGetArticulacao). Abrimos uma ficha, apanhamos esses dois pedidos e
# repetimo-los para cada diploma escolhido, trocando só o identificador.
REL_CHAVES = {'AlteradoPor': 'alt', 'RetificadoPor': 'ret', 'RegulamentadoPor': 'reg', 'Regulamenta': 'regu', 'AdaptadoRegioesAutonomas': 'ra'}

def relacoes(ctx, ids):
    ids = list(dict.fromkeys(ids))
    if not ids: return {}
    pg = ctx.new_page(); cap = {}
    def pedido(req):
        for k in ('DataActionGetAnaliseTecnica', 'DataActionGetArticulacao'):
            if req.url.endswith('/conteudo/detalhe/' + k) and k not in cap:
                cap[k] = (req.url, req.all_headers(), req.post_data)
    pg.on('request', pedido)
    pg.goto('https://www.siluc.pt/siluc/detalhe/' + ids[0], wait_until='networkidle', timeout=90000)
    for _ in range(40):
        if len(cap) == 2: break
        time.sleep(1)
    pg.close()
    if len(cap) < 2:
        raise RuntimeError('a ficha do SILUC não fez os pedidos esperados')
    ua, ha, ba = cap['DataActionGetAnaliseTecnica']; ur, hr, br = cap['DataActionGetArticulacao']
    cab = lambda h: {k: v for k, v in h.items() if k.lower() in ('content-type', 'x-csrftoken', 'outsystems-locale', 'accept')}
    ba, br = json.loads(ba), json.loads(br)
    def post(u, h, corpo):
        for t in range(3):
            r = ctx.request.post(u, data=json.dumps(corpo), headers=cab(h), timeout=60000)
            if r.ok: return r.json()
            time.sleep(3 * (t + 1))
        raise RuntimeError(f'o SILUC respondeu {r.status}')
    out, falhas = {}, 0
    for n, i in enumerate(ids):
        try:
            ba['screenData']['variables']['AnaliseTecnicaId'] = i
            rec = (post(ua, ha, ba).get('data') or {})
            if not rec.get('AnaliseTecnica'): continue
            v = br['screenData']['variables']
            v['AnaliseTecnicaId'] = i
            v['GetAnaliseTecnica'] = dict(v.get('GetAnaliseTecnica') or {}, **rec)
            art = (post(ur, hr, br).get('data') or {}).get('Articulacao') or {}
            d = {}
            for k, curto in REL_CHAVES.items():
                itens = []
                for it in lista(art.get(k)):
                    t = re.sub(r'\s+', ' ', it.get('Title') or '').strip()
                    if not t: continue
                    x = [t, data(it.get('DataPublicacao')) or '', (it.get('Link') or '').strip()]
                    a = str(it.get('AnaliseTecnicaId') or '0')
                    if a != '0': x.append(a)
                    if it.get('IsRevogado'): x.append('revogado')
                    itens.append(x)
                if itens: d[curto] = itens
            out[i] = d
        except Exception as e:
            falhas += 1
            if falhas > 25: raise RuntimeError(f'demasiadas falhas ({e})')
        if n % 100 == 99: log(f'  relações: {n + 1} de {len(ids)}')
        time.sleep(0.05)
    log(f'  alterações e regulamentação lidas em {len(out)} diplomas ({falhas} falhas)')
    return out

def arvore(temas_json):
    nos = lista(((temas_json or {}).get('data') or {}).get('Temas'))
    por_id = {str(n['Id']): {'id': str(n['Id']), 'pai': str(n.get('ParentId') or '0'), 'nome': n['Description'].strip()} for n in nos}
    def cadeia(i):
        c, vistos = [], set()
        while i in por_id and i not in vistos:
            vistos.add(i); c.append(por_id[i]); i = por_id[i]['pai']
        return list(reversed(c))
    raizes = [n for n in por_id.values() if n['pai'] not in por_id]
    if len(raizes) == 1:                                  # uma raiz única («Temas») não conta como tema
        topo = raizes[0]['id']
        raizes = [n for n in por_id.values() if n['pai'] == topo]
        base = cadeia
        cadeia = lambda i: [n for n in base(i) if n['id'] != topo]
    return por_id, cadeia, raizes

def main():
    t0 = datetime.now(timezone.utc)
    log(f'SILUC {t0:%Y-%m-%d %H:%M} UTC')
    anterior = None
    if SAIDA.exists():
        try: anterior = json.loads(SAIDA.read_text())
        except Exception: pass
    rel_ant = {d['id']: {k: d[k] for k in REL_CHAVES.values() if k in d} | ({'_r': d['_r']} if '_r' in d else {})
               for d in (anterior or {}).get('diplomas', [])}
    hoje = t0.strftime('%Y-%m-%d'); dia = t0.toordinal()
    def escolher(hits):
        # todos os que ainda não têm relações lidas; os principais regimes todos os dias; os alterados no SILUC nos
        # últimos 60 dias; e um sétimo dos restantes por dia, para que cada ficha seja revista uma vez por semana
        lim = (t0 - timedelta(days=60)).strftime('%Y-%m-%d')
        ids = []
        for h in hits:
            s_ = h.get('Source') or {}; i = str(s_.get('DbId') or '')
            if not i: continue
            if i not in rel_ant or '_r' not in rel_ant[i] or (s_.get('Numero') or '').strip() in PRINCIPAIS \
               or (data(s_.get('DataModificacao')) or '') >= lim or int(i) % 7 == dia % 7:
                ids.append(i)
        log(f'  a ler alterações e regulamentação de {len(ids)} diplomas')
        return ids
    hits, total, temas_json, rel = recolher(escolher)
    log(f'  {len(hits)} fichas recebidas de {total}')
    por_id, cadeia, raizes = arvore(temas_json)
    if not raizes:
        raise RuntimeError('não veio a árvore de temas')
    ordem_raiz = {n['id']: i for i, n in enumerate(sorted(raizes, key=lambda n: int(n['id'])))}

    diplomas, vistos = [], set()
    for h in hits:
        s = h.get('Source') or {}
        i = str(s.get('DbId') or '')
        if not i or i in vistos: continue
        vistos.add(i)
        temas, subtemas, folhas = set(), set(), []
        for cid in lista(s.get('ClassificadoresATId')):
            c = cadeia(str(cid))
            if not c: continue
            temas.add(c[0]['id'])
            if len(c) > 1: subtemas.add(c[1]['nome'])
            folhas.append(c[-1]['nome'])
        d = {
            'id': i,
            't': texto(s.get('TituloAT')) or texto(s.get('ConteudoTitle')),
            'tipo': (s.get('Tipo') or '').strip(),
            'num': (s.get('Numero') or '').strip(),
            'd': data(s.get('DataPublicacao')),
            'ev': (s.get('EstadoDiplomaAT') or '').strip(),
            'iv': data(s.get('DataInicioVigencia')),
            'fv': data(s.get('DataFimVigencia')),
            's': texto(s.get('Sumario')),
            'temas': sorted(temas, key=lambda x: ordem_raiz.get(x, 99)),
            'sub': sorted(subtemas),
            'cls': sorted(set(folhas)),
            'terr': [x for x in lista(s.get('IndexadorTerritorialAT')) if x],
            'dr': (s.get('UrlExterno') or '').strip(),
            'pdf': (s.get('UrlPDF') or '').strip(),
            'mod': data(s.get('DataModificacao')),
            'cri': data(s.get('DataAdicao') or s.get('DataCriacao')),
            'fonte': (s.get('TipoFonte') or '').strip(),
        }
        if i in rel:
            d.update(rel[i]); d['_r'] = hoje                  # dia em que as relações foram lidas
        elif i in rel_ant:
            d.update(rel_ant[i])
        diplomas.append({k: v for k, v in d.items() if v not in (None, '', [])})

    n_ant = len((anterior or {}).get('diplomas', []))
    if n_ant and len(diplomas) < 0.9 * n_ant:
        log(f'  só {len(diplomas)} diplomas contra {n_ant} da última vez: não gravo, fica a cópia anterior')
        return gravar_registo(1)

    temas = [{'id': n['id'], 'nome': n['nome'],
              'sub': [m['nome'] for m in sorted(por_id.values(), key=lambda m: int(m['id'])) if m['pai'] == n['id']]}
             for n in sorted(raizes, key=lambda n: int(n['id']))]
    diplomas.sort(key=lambda d: (d.get('d') or '', d['id']), reverse=True)
    novo = {'actualizado': t0.strftime('%Y-%m-%d'),
            'fonte': {'nome': 'SILUC', 'url': 'https://www.siluc.pt',
                      'ficha': 'https://www.siluc.pt/siluc/detalhe/',
                      'nota': 'Sistema de Informação da Legislação de Urbanismo e Construção (LNEC, com a DGT e o IHRU)'},
             'total': len(diplomas), 'temas': temas}
    igual = anterior and anterior.get('diplomas') == diplomas and anterior.get('temas') == temas
    if igual:
        log('  sem alterações'); return gravar_registo(0)
    corpo = json.dumps(novo, ensure_ascii=False, indent=1)[:-2]
    corpo += ',\n "diplomas": [\n' + ',\n'.join(json.dumps(d, ensure_ascii=False) for d in diplomas) + '\n ]\n}\n'
    SAIDA.write_text(corpo)
    mudaram = 0
    if anterior:
        a = {d['id']: d for d in anterior.get('diplomas', [])}
        mudaram = sum(1 for d in diplomas if a.get(d['id']) != d)
    log(f'  {len(diplomas)} diplomas em {len(temas)} temas gravados ({mudaram} novos ou alterados)')
    return gravar_registo(0)

def gravar_registo(cod):
    with open(REGISTO, 'a') as f:
        f.write('\n' + '\n'.join(linhas) + '\n')
    return cod

if __name__ == '__main__':
    try:
        sys.exit(main())
    except Exception as e:
        log(f'  ERRO na recolha do SILUC: {e}')
        gravar_registo(1)
        sys.exit(0)            # a falha fica registada, mas não impede a gravação dos concursos e notícias
