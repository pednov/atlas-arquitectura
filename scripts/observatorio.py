#!/usr/bin/env python3
"""Observatório da profissão: compilação automática das respostas ao questionário do ATLAS.

Pedido do Pedro, 19 Nov. 2026, revisto a 20 Nov. 2026: as respostas ficam guardadas e os gráficos das respostas
fazem-se só com o que foi enviado pelo questionário da página do Observatório, à parte do inquérito de 2022.

As respostas ficam guardadas no Netlify (formulário «observatorio»). Com a chave de acesso pessoal do Netlify gravada
como segredo do repositório (Settings > Secrets and variables > Actions > NETLIFY_TOKEN), esta recolha lê-as de hora a
hora (.github/workflows/observatorio.yml) e:
  põe de parte as que não vieram do questionário do ATLAS (sem o campo de origem do formulário, sem a declaração,
  com uma situação de inscrição que não existe ou com a indicação de outra página de origem);
  põe de parte as repetidas (o mesmo endereço e o mesmo navegador no mesmo dia, conta só a primeira);
  compila o resto pergunta a pergunta, com as categorias do questionário, e grava
    data/observatorio-respostas.json            valores agregados, que a página pública mostra em gráficos; as perguntas
                                                com menos respostas do que o mínimo levam só a contagem;
    data/observatorio-arquivo/AAAA-MM.json      a compilação de cada mês, guardada em arquivo.
As respostas uma a uma nunca vão para o repositório, que é público: ficam no Netlify e descarregam-se no backoffice.
Sem a chave, a recolha não faz nada. O cálculo é o mesmo da página do backoffice (site/observatorio.js).
"""
import json, os, re
from datetime import datetime, timezone
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / 'data'
SITE = 'atlas-arquitectura.netlify.app'
SITES = [SITE]                    # endereços do ATLAS de onde as respostas podem vir (juntar aqui um domínio próprio)
ORIGEM = 'atlas-observatorio'     # campo escondido do formulário da página do Observatório
MINIMO = 5
API = 'https://api.netlify.com/api/v1'
AGORA = datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%MZ')

def val(d, k):
    v = d.get(k)
    return '' if v is None else str(v).strip()

def multi(d, k):
    return [x.strip() for x in re.split(r'\s*\|\s*|,\s(?=[A-ZÁÉÍÓÚÂÊÔ0-9])', val(d, k)) if x.strip()]

def pc(x, n):                     # igual a Math.round(1000 * x / n) / 10 no navegador
    return int(1000 * x / n + 0.5) / 10

def dist(vals, op):
    c = [0] * len(op); n = 0
    for v in vals:
        if v in op: c[op.index(v)] += 1; n += 1
    return {'n': n, 'v': [pc(x, n) for x in c] if n else [None] * len(op)}

def perguntas(O):
    return [p for s in O['questionario']['seccoes'] for p in s['perguntas']]

def do_atlas(O, d):
    if val(d, 'origem') != ORIGEM or val(d, 'declaracao') != 'sim': return False
    ins = next((p for p in perguntas(O) if p['id'] == 'inscricao'), {}).get('op', [])
    if val(d, 'inscricao') not in ins: return False
    ref = val(d, 'referrer')
    if not ref: return True
    m = re.match(r'^https?://([^/?#]+)(/[^?#]*)?', ref)
    if not m: return False
    host, path = m.group(1).lower(), m.group(2) or '/'
    return (host in SITES or any(host.endswith('--' + h) for h in SITES)) and bool(re.match(r'^/observatorio(/(index\.html)?)?$', path))

def separar(O, subs):
    vistos, unicas, repetidas, fora = set(), [], [], []
    for s in sorted(subs, key=lambda s: s['created_at']):
        d = s.get('data') or {}
        if not do_atlas(O, d): fora.append(s); continue
        k = (d.get('ip'), d.get('user_agent'), s['created_at'][:10])
        if d.get('ip') and k in vistos: repetidas.append(s); continue
        vistos.add(k); unicas.append(s)
    return unicas, repetidas, fora

def compilar(O, subs):
    """subs: os dados de cada resposta que conta. Uma entrada por pergunta, {n: quantos responderam, v: valores}."""
    out = {}
    for p in perguntas(O):
        i_, op = p['id'], p.get('op') or []
        k = lambda i: f'{i_}__{i}'
        if p['tipo'] == 'check':
            quem = [d for d in subs if any(x in op for x in multi(d, i_))]
            out[i_] = {'n': len(quem), 'v': [pc(sum(1 for d in quem if o in multi(d, i_)), len(quem)) if quem else None for o in op]}
        elif p['tipo'] == 'grid':
            quem = [d for d in subs if any(val(d, k(i)) in op for i in range(len(p['linhas'])))]
            out[i_] = {'n': len(quem), 'v': [dist([val(d, k(i)) for d in quem], op)['v'] for i in range(len(p['linhas']))]}
        elif p['tipo'] == 'escala':
            nota = lambda d, i: float(val(d, k(i))) if val(d, k(i)) in op else None
            quem = [d for d in subs if any(nota(d, i) is not None for i in range(len(p['linhas'])))]
            ms = []
            for i in range(len(p['linhas'])):
                xs = [x for x in (nota(d, i) for d in quem) if x is not None]
                ms.append(int(10 * sum(xs) / len(xs) + 0.5) / 10 if xs else None)
            out[i_] = {'n': len(quem), 'v': ms}
        elif op:
            out[i_] = dist([val(d, i_) for d in subs], op)
    return out

def publico(O, comp):
    m = O['questionario'].get('minimo', MINIMO)
    return {k: (r if r['n'] >= m else {'n': r['n'], 'v': None}) for k, r in comp.items()}

def main():
    token = os.environ.get('NETLIFY_TOKEN', '').strip()
    if not token:
        print('Observatório: sem NETLIFY_TOKEN, a compilação automática fica por fazer'); return
    O = json.loads((DATA / 'observatorio.json').read_text(encoding='utf-8'))
    H = {'Authorization': 'Bearer ' + token, 'User-Agent': 'ATLAS-recolha'}
    try:
        forms = requests.get(f'{API}/sites/{SITE}/forms', headers=H, timeout=30)
        forms.raise_for_status()
        form = next((f for f in forms.json() if f.get('name') == O['questionario']['form']), None)
        if not form:
            print('Observatório: o formulário ainda não existe no Netlify (falta ligar a detecção de formulários e publicar o site)'); return
        subs, ids = [], set()
        for estado in (None, 'spam'):          # as verificadas e as que o filtro de spam pôs de lado, que passam pela mesma verificação
            for p in range(1, 200):
                params = {'per_page': 100, 'page': p}
                if estado: params['state'] = estado
                r = requests.get(f'{API}/forms/{form["id"]}/submissions', params=params, headers=H, timeout=30)
                r.raise_for_status()
                lote = r.json()
                for s in lote:
                    if s.get('id') not in ids: ids.add(s.get('id')); subs.append(s)
                if len(lote) < 100: break
    except Exception as ex:
        print('Observatório: falhou a leitura no Netlify', ex); return
    unicas, repetidas, fora = separar(O, subs)
    comp = compilar(O, [s.get('data') or {} for s in unicas])
    novo = {'actualizado': AGORA, 'n': len(unicas), 'recebidas': len(subs), 'versao': O['questionario']['versao'],
            'minimo': O['questionario'].get('minimo', MINIMO), 'perguntas': publico(O, comp)}
    f = DATA / 'observatorio-respostas.json'
    antes = json.loads(f.read_text(encoding='utf-8')) if f.exists() else {}
    resumo = f'{len(unicas)} contam, {len(repetidas)} repetidas, {len(fora)} fora do questionário do ATLAS ({len(subs)} recebidas)'
    if {k: v for k, v in antes.items() if k != 'actualizado'} == {k: v for k, v in novo.items() if k != 'actualizado'}:
        print(f'Observatório: {resumo}, sem alterações'); return
    f.write_text(json.dumps(novo, ensure_ascii=False, indent=1) + '\n', encoding='utf-8')
    arq = DATA / 'observatorio-arquivo'; arq.mkdir(exist_ok=True)
    (arq / f'{AGORA[:7]}.json').write_text(json.dumps(novo, ensure_ascii=False, indent=1) + '\n', encoding='utf-8')
    print(f'Observatório: compilado, {resumo}')

if __name__ == '__main__':
    main()
