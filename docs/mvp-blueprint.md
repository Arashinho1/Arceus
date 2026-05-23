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
  integrations/
    local/                    # Motor local simplificado
    showdown/                 # Futuro adapter Pokemon Showdown
  services/
    battle/                   # BattleService e BattleEnginePort
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
- `Battle` e `BattleParticipant`: base para batalha textual agora e Pokemon Showdown depois.

Usei `GameMap` no Prisma para evitar confusão com o `Map` nativo do JavaScript, mas a tabela física é `maps`.

## 3. Lista de comandos com prefixo `.`

Implementados no starter:

- `.ping`
- `.pokedex` ou `.dex` (aliases de transicao: `.pokemon` e `.p`)
- `.equipe`
- `.box`
- `.inventario` ou `.inv`
- `.mapa criar #canal | Rota 01 | grama | 1 | 8 | descricao`
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
- `.item usar <item_slug> [pokemon_id]`
- `.batalha desafiar @jogador`
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
6. Se passar, escolhe um `MapSpawn` por peso de raridade.
7. `PokemonGeneratorService` gera level, gênero, shiny, nature, ability, IVs, EVs zerados, HP e moves.
8. O encontro é salvo em `Encounter`.
9. O bot envia embed com botões `Ver Detalhes`, `Capturar`, `Batalhar`, `Ignorar`.
10. O `messageId` do embed é gravado no encontro para edição futura.

Implementação principal: `src/services/spawn/SpawnService.ts`.

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

Etapa 3, batalha textual local:

- Criar tela de batalha por embed.
- Botões: atacar, trocar, item, fugir.
- Implementar dano simplificado, accuracy, status básico e turnos.
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

## 10. Integração futura com Pokemon Showdown

O ponto de entrada é `BattleEnginePort` em `src/services/battle/BattleService.ts`.

Hoje:

- `LocalBattleEngine` permite batalha textual simplificada no Discord.
- `BattleService` cria `Battle` e `BattleParticipant` no banco.

Futuro:

- `ShowdownBattleEngine` conecta no servidor Pokemon Showdown.
- Converte `PlayerPokemon` em formato de team do Showdown.
- Cria ou entra em uma room.
- Envia comandos de batalha para o protocolo do Showdown.
- Espelha logs/turnos em embeds no Discord.
- Persiste resultado final em `Battle.data`.
- Aplica XP, EVs, evolução e recompensas depois do resultado.

O importante é manter a regra de progressão fora do Showdown. Showdown decide batalha; o RPG decide recompensa, captura, evolução, inventário e progresso.

## Preparação para interface 2D

Como mapas, encontros, inventário e batalhas estão no domínio/serviços, uma interface 2D futura pode chamar os mesmos serviços via API. O Discord hoje é só um adapter de entrada/saída.
