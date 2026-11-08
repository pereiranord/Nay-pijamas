# 📱 Quem Sou Eu?

Jogo de adivinhação com o celular na testa, **sem anúncios** e funcionando **offline**.

## Baixar
Vá em **Releases** (lado direito da página do repositório) e baixe o `QuemSouEu.apk` mais recente.
No celular, abra o arquivo e permita "instalar de fontes desconhecidas".

O APK é compilado automaticamente pelo GitHub Actions (`.github/workflows/apk-quem-sou-eu.yml`)
toda vez que algo dentro de `quem-sou-eu/` muda. Também dá para rodar manualmente em
**Actions → Gerar APK - Quem Sou Eu → Run workflow**.

## Como jogar
- Segure o celular deitado na testa, com a tela para os amigos.
- **Tela para cima** (para o teto) = ACERTOU ✅
- **Tela para baixo** (para o chão) = PASSOU ❌
- Dá para inverter, mudar o tempo, a sensibilidade e as rodadas nas configurações.

## Recursos
- 58 categorias e mais de 4.500 palavras: blogueiras e influencers, BBB, memes, filmes da Disney, Pixar,
  princesas, super-heróis, vilões, novelas, séries, animes, K-pop, cantores, sertanejo/funk, utensílios de cozinha,
  objetos da casa, profissões, maquiagem, marcas de roupa, marcas de beleza, comidas, drinks, esportes, países,
  mímica, frases de mãe, vida adulta e muito mais.
- Jogadores com vez de cada um, placar, rodadas e pódio final.
- Grupos salvos (família, amigos…).
- Crie suas próprias categorias.
- Favoritas e "Mix" com tudo misturado.
- Não repete palavras até a categoria acabar.
- Sons, vibração e opção de tocar na tela se o sensor falhar.

## Estrutura
- `app/src/main/assets/` – o jogo (HTML/CSS/JS) e o banco de categorias (`categories.js`).
- `app/src/main/java/.../MainActivity.java` – WebView + sensor de gravidade.

A chave `app/quemsoueu.keystore` serve só para que as atualizações instalem por cima da versão anterior;
ela é pública, então não use para publicar na Play Store.
