# ATLAS, dados de concursos e notícias

Este repositório alimenta os separadores **Concursos** e **Notícias** do ATLAS (https://atlas-arquitectura.netlify.app).

Todos os dias, às 05:17 (UTC), o programa `scripts/actualizar.py` recolhe os concursos da plataforma Encomenda, as notícias da secção de arquitectura do Construir e as obras em Portugal publicadas no ArchDaily, e grava o resultado em `data/`. O site lê estes ficheiros directamente, por isso a actualização não exige nenhuma publicação no Netlify.

## Ficheiros

- `data/concursos.json` e `data/noticias.json`, os dados que o site mostra. Podem ser corrigidos à mão: a recolha nunca apaga nem reescreve uma ficha que já existe (só actualiza a data de entrega de um concurso, se tiver sido prorrogada).
- `data/regras.json`, as regras de selecção. `excluir` deixa de fora as notícias e os concursos cujo título ou resumo corresponda a um dos padrões; `limpar` retira trechos do texto mostrado; `bloquear_urls` retira notícias concretas, pelo endereço.
- `data/concelhos.json`, a região de cada concelho, usada para a cor de cada ficha.
- `ultima-recolha.txt`, o registo da última recolha.

## Regras editoriais

- Só arquitectura e arquitectos portugueses. Ficam de fora a publicidade a produtos e serviços, as feiras comerciais, o imobiliário e as notícias sobre a Ordem dos Arquitectos.
- Não se copiam resumos: cada notícia mostra o título, a fonte, o tema e, quando se identifica, o autor e o lugar, com ligação ao original.
- As imagens vêm do sítio de origem. Imagens com rostos em destaque (retratos, fotografias de grupo) e imagens ao alto ficam de fora.
- Notícias com mais de quatro meses e concursos encerrados há mais de dezoito meses saem automaticamente.

## Correr à mão

Em **Actions**, escolher **Recolha diária** e carregar em **Run workflow**.
