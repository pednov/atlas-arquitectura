#!/usr/bin/env python3
"""Observatório da profissão: compilação automática das respostas ao questionário (pedido do Pedro, 19 Nov. 2026).

As respostas ficam guardadas no Netlify (formulário «observatorio»). Com a chave de acesso pessoal do Netlify gravada
como segredo do repositório (Settings > Secrets and variables > Actions > NETLIFY_TOKEN), esta recolha lê-as todos os dias,
põe de parte as repetidas (o mesmo endereço e o mesmo navegador no mesmo dia), compila-as nas categorias do inquérito
de 2022 e grava:
  data/observatorio-respostas.json            só valores agregados, que a página pública mostra ao lado de 2022;
  data/observatorio-arquivo/AAAA-MM.json      a compilação de cada mês, guardada em arquivo.
As respostas uma a uma nunca vão para o repositório, que é público: ficam no Netlify e descarregam-se no backoffice.
Sem a chave, a recolha não faz nada.
"""
import json, os, re, sys
from datetime import datetime, timezone
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / 'data'
SITE = 'atlas-arquitectura.netlify.app'
API = 'https://api.netlify.com/api/v1'
HOJE = datetime.now(timezone.utc).date().isoformat()

def dist(vals, op):
    c = [0] * len(op); n = 0
    for v in vals:
        if v in op: c[op.index(v)] += 1; n += 1
    return {'n': n, 'v': [round(100 * x / n, 1) for x in c] if n else [None] * len(op)}

def val(d, k):
    v = d.get(k)
    return '' if v is None else str(v).strip()

def multi(d, k):
    return [x.strip() for x in re.split(r'\s*\|\s*|,\s(?=[A-ZÁÉÍÓÚÂÊÔ0-9])', val(d, k)) if x.strip()]

def compilar(O, subs):
    """O mesmo cálculo que a página do backoffice faz (observatorio.js, função compilar)."""
    campos = {p['id']: p for s in O['questionario']['seccoes'] for p in s['perguntas']}
    graf = {g['id']: g for b in O['blocos'] for g in b['graficos']}
    out = {}
    for gid, cf in O['compara'].items():
        g = graf.get(gid)
        if not g: continue
        if isinstance(cf, list):
            ds = [dist([val(d, f) for d in subs], campos[f]['op']) for f in cf]
            out[gid] = {'n': max(x['n'] for x in ds), 'v': [x['v'] for x in ds]}; continue
        p = campos[cf]
        if p['tipo'] == 'check':
            quem = [d for d in subs if multi(d, cf)]
            c = [sum(1 for d in quem if o in multi(d, cf)) for o in p['op']]
            out[gid] = {'n': len(quem), 'v': [round(100 * x / len(quem), 1) for x in c] if quem else [None] * len(c)}
        elif p['tipo'] == 'grid':
            linhas = [dist([val(d, f'{cf}__{i}') for d in subs], p['op']) for i in range(len(p['linhas']))]
            out[gid] = {'n': max([0] + [l['n'] for l in linhas]), 'v': [l['v'] for l in linhas]}
        elif p['tipo'] == 'escala':
            ms, ns = [], []
            for i in range(len(p['linhas'])):
                xs = []
                for d in subs:
                    try: xs.append(float(val(d, f'{cf}__{i}')))
                    except ValueError: pass
                ns.append(len(xs)); ms.append(round(sum(xs) / len(xs), 1) if xs else None)
            out[gid] = {'n': max([0] + ns), 'v': ms}
        elif g['tipo'] == 'grp':
            a = dist([val(d, cf) for d in subs], p['op'])
            b = dist([val(d, cf) for d in subs if val(d, 'exerce') == 'Sim'], p['op'])
            out[gid] = {'n': a['n'], 'v': [a['v'], b['v']]}
        else:
            out[gid] = dist([val(d, cf) for d in subs], p['op'])
    return out

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
            print('Observatório: o formulário ainda não existe no Netlify'); return
        subs = []
        for p in range(1, 200):
            r = requests.get(f'{API}/forms/{form["id"]}/submissions', params={'per_page': 100, 'page': p}, headers=H, timeout=30)
            r.raise_for_status()
            lote = r.json(); subs += lote
            if len(lote) < 100: break
    except Exception as ex:
        print('Observatório: falhou a leitura no Netlify', ex); return
    subs.sort(key=lambda s: s['created_at'])
    vistos, unicas = set(), []
    for s in subs:
        d = s.get('data') or {}
        k = (d.get('ip'), d.get('user_agent'), s['created_at'][:10])
        if d.get('ip') and k in vistos: continue
        vistos.add(k); unicas.append(d)
    comp = compilar(O, unicas)
    novo = {'actualizado': HOJE, 'n': len(unicas), 'recebidas': len(subs), 'versao': O['questionario']['versao'], 'graficos': comp}
    f = DATA / 'observatorio-respostas.json'
    antes = json.loads(f.read_text(encoding='utf-8')) if f.exists() else {}
    if {k: v for k, v in antes.items() if k != 'actualizado'} == {k: v for k, v in novo.items() if k != 'actualizado'}:
        print(f'Observatório: {len(unicas)} respostas, sem alterações'); return
    f.write_text(json.dumps(novo, ensure_ascii=False, indent=1) + '\n', encoding='utf-8')
    arq = DATA / 'observatorio-arquivo'; arq.mkdir(exist_ok=True)
    (arq / f'{HOJE[:7]}.json').write_text(json.dumps(novo, ensure_ascii=False, indent=1) + '\n', encoding='utf-8')
    print(f'Observatório: {len(unicas)} respostas compiladas ({len(subs)} recebidas)')

if __name__ == '__main__':
    main()
