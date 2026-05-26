# Blueprint do MVP

## 1. Arquitetura de pastas

```text
src/
  bot/
    commands/                 # Adaptadores de comando com prefixo "."
    events/                   # messageCreate, interactionCreate
  config/                     # Env e config de runtime
  database/                   # Prisma singleton
  domain/                     # Tipos e contratos puros do RPG
  services/
    battle/                   # BattleService narrativo por turnos
    capture/                  # CaptureService
    maps/                     # MapService
    pokemon/                  # PokemonGeneratorService
    spawn/                    # SpawnService e cooldown store
    users/                    # UserService
  ui/
    embeds/                   # Embeds e botoes Discord
  utils/
prisma/
  schema.prisma
  seed.ts
```

Regra de arquitetura: comando do Discord nunca deve carregar regra pesada. O comando valida entrada e chama serviço. Serviço aplica regra. Prisma persiste. A UI só monta embed/botão.

## 2. Schema Prisma inicial

O schema está em `prisma/schema.prisma` e cobre:

- `User`: perfil automático, Discord ID, moedas, badges e progresso.
- `PokemonSpecies`: Pokedex base, catch rate, tipos, abilities, base stats, EV yield, moves por level e evolução.
- `PlayerPokemon`: Pokemon individual do jogador com level, XP, IVs, EVs, nature, ability, moves, HP, status, equipe/box.
- `GameMap`: canal do Discord registrado como mapa.
- `MapSpawn`: tabela de spawn por mapa com peso, level min/max, shiny chance, condições e recompensas.
- `Item` e `Inventory`: itens e inventário por jogador.
- `Encounter`: Pokemon selvagem ativo no canal.
- `Battle` e `BattleParticipant`: base para batalha narrativa por turnos.

Usei `GameMap` no Prisma para evitar confusão com o `Map` nativo do JavaScript, mas a tabela física é `maps`.

## 3. Lista de comandos com prefixo `.`

Implementados no starter:

- `.ping`
- `.battletest [nivel]` ou `.battletest [min] [max]`
  - Gera uma batalha aleatória, persiste em `Battle`/`BattleParticipant`, simula turnos locais e mostra um resumo mecânico.
- `.batalha @jogador`
- `.aceitar` / `.recusar`
- `.soltar <slot|nome|ref>`
- `.trocar <slot|nome|ref>` ou `.voltar <slot|nome|ref>`
- `.atacar <ataque> | <narração opcional>`
- `.passar`
- `.fugir`
- `.usar <item> <pokemon>`
- `.pokedex` ou `.dex` (aliases de transição: `.pokemon` e `.p`)
  - Sem argumento, mostra a National Dex.
  - Filtros de lista: `.dex kanto`, `.dex johto`, `.dex hoenn`, `.dex sinnoh`, `.dex unova`, `.dex kalos`, `.dex alola`, `.dex galar`, `.dex paldea`.
  - Busca direta por nome ou número usa a National Dex: `.dex sentret`, `.dex 161`.
- `.equipe`
- `.box`
- `.inventario` ou `.inv`
- `.viajar <destino>` ou `.viajar voltar`
- `.fly <cidade>`
- `.mapa criar #canal | Rota 01 | grama | 1 | 8 | descrição`
- `.mapa spawn #canal | pidgey | 80 | 2 | 5 | 0.000244`

Comandos alvo do MVP:

- `.perfil`
- `.mapa listar`
- `.mapa editar #canal campo valor`
- `.mapa remover #canal`
- `.mapa spawn listar #canal`
- `.mapa spawn remover #canal pokemon_slug`
- `.spawn manual #canal pokemon_slug level`
- `.colecao ver <id>`
- `.colecao mover <id> equipe|box [slot]`
- `.colecao liberar <id>`
- `.admin dar item @jogador item_slug quantidade`
- `.admin dar moeda @jogador quantidade`
- `.admin dar pokemon @jogador pokemon_slug level`

Se quiser slash commands depois, mantenha os serviços iguais e crie novos adapters em `src/bot/slash/`.

## 4. Fluxo do sistema de spawn

1. Jogador envia mensagem em um canal.
2. `messageCreate` ignora bots e comandos com prefixo.
3. `SpawnService` verifica se o canal é um `GameMap` ativo.
4. O serviço bloqueia spam verificando encontro ativo no canal e cooldown.
5. O serviço rola `spawnChance` do mapa.
6. Se passar, escolhe a pool de spawn por peso de raridade.
   - Spawns manuais em `MapSpawn` continuam funcionando como override.
   - Se o mapa não tiver cadastro manual suficiente, o bot calcula uma pool automática pela região do mapa, bioma, geração da espécie e catch rate.
   - A proporção base é nativo/regional, migrante nacional compatível com bioma e raro controlado, com cache por mapa para não recalcular a cada mensagem.
7. `PokemonGeneratorService` gera level, gênero, shiny, nature, ability, IVs, EVs zerados, HP e moves.
8. O encontro é salvo em `Encounter`.
9. O bot envia embed com botões `Ver Detalhes`, `Capturar`, `Batalhar`, `Ignorar`.
10. O `messageId` do embed é gravado no encontro para edição futura.

Implementação principal: `src/services/spawn/SpawnService.ts` e `src/services/spawn/SpawnPoolService.ts`.

## 5. Fluxo do sistema de captura

1. Jogador clica em `Capturar`.
2. `CaptureService` abre uma transaction.
3. Garante/cria o `User`.
4. Valida se o `Encounter` está ativo e não expirou.
5. Valida se o item usado é uma Poke Ball e se o jogador tem quantidade.
6. Consome a bola.
7. Calcula chance usando catch rate, bônus da bola, HP atual e status.
8. Se falhar, mantém o encontro ativo.
9. Se capturar, cria `PlayerPokemon`.
10. Se a equipe tiver menos de 6, entra na equipe; caso contrário, vai para a box.
11. Atualiza o `Encounter` para `CAPTURED`.

Implementação principal: `src/services/capture/CaptureService.ts`.

## 6. PokemonGeneratorService

Arquivo: `src/services/pokemon/PokemonGeneratorService.ts`.

Responsabilidades:

- Sortear level dentro do range do spawn.
- Sortear IVs de 0 a 31.
- Criar EVs zerados.
- Calcular HP inicial.
- Sortear gênero, shiny, nature e ability.
- Selecionar até 4 moves aprendidos até o level gerado.

Esse serviço não depende do Discord e pode ser reutilizado por admin commands, eventos, testes, API futura ou interface 2D.

## 7. SpawnService

Arquivo: `src/services/spawn/SpawnService.ts`.

Responsabilidades:

- Descobrir se o canal é mapa.
- Evitar spam com cooldown.
- Evitar múltiplos encontros ativos no mesmo canal.
- Escolher spawn por peso.
- Chamar o gerador de Pokemon.
- Persistir o encontro.

O cooldown atual está em memória (`InMemoryCooldownStore`). Para produção, crie um `RedisCooldownStore` implementando a mesma interface.

## 8. Embed de spawn

Arquivo: `src/ui/embeds/spawnEmbed.ts`.

O embed mostra:

- espécie
- shiny
- level
- gênero
- nature
- ability
- HP
- moves

Botões usam `customId` estruturado:

```text
encounter:<encounterId>:details
encounter:<encounterId>:capture
encounter:<encounterId>:battle
encounter:<encounterId>:ignore
```

Isso deixa o roteamento simples em `interactionCreate`.

## 9. Plano de desenvolvimento por etapas

Etapa 1, base jogável:

- Fechar setup Prisma/Postgres.
- Criar seed mais completo de espécies e itens.
- Completar `.mapa listar`, `.mapa editar`, `.mapa remover`.
- Adicionar `.admin dar item` para testes.
- Refinar embed de spawn e detalhes.

Etapa 2, captura/equipe/box:

- Implementar seleção de bola no botão de captura.
- Completar `.colecao ver`, `.colecao mover`, `.colecao liberar`.
- Criar paginação de box.
- Adicionar logs de captura.

Etapa 3, evolução da batalha narrativa:

- Melhorar apresentação visual da batalha.
- Expandir ataques, status, habilidades e regras de troca.
- Conceder XP, EVs, moedas e drops ao vencer.

Etapa 4, progressão:

- Fórmula de XP por espécie/grupo.
- Evolução por level.
- Evolução por item.
- Evolução por condição especial.
- Treino de EV e limites por stat/total.

Etapa 5, economia e conteúdo:

- Loja.
- Drops por mapa.
- Eventos temporários.
- Badges/progresso.
- Condições especiais de spawn por horário, clima, item equipado ou evento.

Etapa 6, escala:

- Redis para cooldown e locks de encontro.
- Jobs de expiração de encontros.
- Observabilidade/logs.
- Testes unitários dos serviços de domínio.
- Comandos slash opcionais.

## 10. Batalha narrativa

O ponto de entrada é `src/services/battle/BattleService.ts`.

Hoje:

- `BattleService` cria desafios PvP, batalhas selvagens e participantes no banco.
- `Battle.data` guarda o estado narrativo: modo da batalha, turno atual, Pokemon ativos, HP, estágios temporários e log.
- `.atacar` valida o golpe aprendido, rola precisão, calcula dano, crítico, STAB e efetividade.
- O catálogo em `src/domain/battle/moves.ts` define categoria física/especial/status, poder, precisão e efeitos.
- Burn, paralysis, sleep e poison já são aplicados durante os turnos.
- Habilidades iniciais já interferem no combate: Blaze, Torrent, Overgrow, Static, Keen Eye e Run Away.
- `.trocar` consome o turno quando a batalha já está em andamento.
- `.usar` aplica itens de cura apenas fora de batalha.
- `.fugir` funciona contra selvagens/NPCs e nunca contra outro jogador.
- Vitória contra selvagem/NPC aplica recompensas reais: XP, moedas, EVs, level up, golpes aprendidos e evolução por nível quando a espécie de destino está cadastrada.

Próximos passos:

- Catálogo completo de ataques com categoria física/especial/status.
- Expandir golpes com efeitos secundários, prioridades e mais variações de status.
- Habilidades automáticas adicionais.
- Drops de item por mapa/encontro.
- Recompensas e regras específicas para PvP.

## Preparação para interface 2D

Como mapas, encontros, inventário e batalhas estão no domínio/serviços, uma interface 2D futura pode chamar os mesmos serviços via API. O Discord hoje é só um adapter de entrada/saída.
