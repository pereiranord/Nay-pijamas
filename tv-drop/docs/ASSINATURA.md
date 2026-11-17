# Assinatura do TV Drop

## Identidade

| | |
| --- | --- |
| Pacote | `com.pereiranord.tvdrop` (não muda) |
| Chave original | `CN=TV Drop`, RSA 2048, SHA-256 do certificado `bbd1529336bd34bede4139c58e44b2250796d85f58ff26fbc65df0c85825da22` |
| Chave nova | ainda não criada (passo a passo abaixo). Quando existir, anote aqui o SHA-256. |

Todas as versões publicadas até a 2.11 (TV e celular) foram assinadas com a chave original; conferido nas versões 2.8.15, 2.9.16 e 2.11.21 baixadas do GitHub. A assinatura nunca mudou entre versões.

## O problema da chave original

O arquivo `keystore/tvdrop.jks` está no repositório e a senha (`tvdrop123`) está no `build.gradle`. O repositório Nay-pijamas é público, então **qualquer pessoa pode assinar um APK com a mesma identidade do TV Drop**. Na prática:

- uma assinatura com essa chave não prova que o APK saiu deste projeto;
- alguém poderia publicar um "TV Drop" alterado que se instala por cima do verdadeiro e herda os dados e as permissões dele (acessibilidade, na TV).

Apagar o arquivo agora não resolve: ele está no histórico público. A saída oficial do Android é a **rotação de chave** (APK Signature Scheme v3):

- O APK passa a ser assinado pela chave nova, com uma prova assinada pela chave antiga de que ela passou a identidade para a nova (a "linhagem").
- Aparelhos com **Android 9 ou mais novo** atualizam normalmente o TV Drop já instalado e, daí em diante, **recusam atualizações assinadas só com a chave antiga** (a linhagem é gravada com `--set-rollback false`).
- Aparelhos com **Android 8.x** não conhecem rotação: continuam conferindo a assinatura v2 da chave antiga. Para eles nada muda (nem para melhor).

O `build.sh` já faz isso sozinho quando a chave nova existe. Sem ela, continua usando a original e avisa no build (`SIGNING.txt` e nas notas da versão).

## Criar a chave nova (uma vez só)

**Decisão sua**: quem guarda a chave. Ela fica só com você e nos segredos do GitHub, nunca no código.

No Termux (ou em qualquer computador com Java):

```bash
pkg install openjdk-17            # no Termux; no computador, qualquer JDK 17+
keytool -genkeypair -keystore tvdrop-assinatura.jks -alias tvdrop2 \
  -keyalg RSA -keysize 3072 -validity 10000 -dname "CN=TV Drop"
# escolha uma senha forte; use a mesma para a chave quando ele perguntar
keytool -list -v -keystore tvdrop-assinatura.jks | grep SHA256   # o SHA-256 da chave nova: anote
base64 -w0 tvdrop-assinatura.jks > tvdrop-assinatura.b64
```

1. **Guarde** `tvdrop-assinatura.jks` e a senha em dois lugares privados (por exemplo, Google Drive e um gerenciador de senhas). **Se a chave se perder**, depois da primeira versão rotacionada os aparelhos com Android 9+ só instalam uma versão nova desinstalando a antiga (perdendo os dados do app). Também não será possível registrar o pacote no Google com ela.
2. No GitHub, em **cada** repositório (`pereiranord/tv-app` e `pereiranord/Nay-pijamas`): **Settings → Secrets and variables → Actions → New repository secret**:
   - `TVDROP_SIGNING_KEY_B64`: o conteúdo de `tvdrop-assinatura.b64`
   - `TVDROP_SIGNING_PASS`: a senha
3. Apague o `tvdrop-assinatura.b64` do aparelho. Nunca coloque o `.jks` dentro de nenhum repositório.

O próximo build já sai rotacionado. Para conferir um APK baixado:

```bash
apksigner verify --print-certs --verbose TV-Drop-Celular.apk
#   Verified using v3 scheme: true, Signer #1 certificate SHA-256 = a chave nova
apksigner lineage --in TV-Drop-Celular.apk --print-certs
#   Signer #1 = bbd15293… (original), Signer #2 = a chave nova
```

## Registro no Google (verificação de desenvolvedor)

Desde 30/09/2026 o Google exige, no Brasil, que apps instalados de lojas participantes (Google Play, Samsung Galaxy Store, Xiaomi GetApps e outras) venham de desenvolvedores verificados. Downloads diretos (como o GitHub) ficam para a expansão global prevista para 2027, só em celulares e tablets. Instalações por ADB continuam livres.

Quando chegar a hora (ou antes, para não ter surpresa):

1. Crie a conta no Android Developer Console: https://android.google.com/developerconsole (gratuita na distribuição limitada, que tem limite de aparelhos; US$ 25 na distribuição completa, com documento com foto e comprovante de endereço).
2. Em **Packages**, registre `com.pereiranord.tvdrop` com o **SHA-256 da chave nova**. O console aceita várias chaves por pacote; registrar também a original ajuda os aparelhos com Android 8.
3. O console pede uma prova de posse: um APK assinado com a chave, contendo um arquivo que ele fornece em `assets/`. Basta colocar o arquivo em `assets/` e rodar o build.

Não registre só a chave original: ela é pública e qualquer pessoa conseguiria provar "posse" dela.

Referências: https://developer.android.com/developer-verification/guides · https://source.android.com/docs/security/features/apksigning/v3 · https://developer.android.com/tools/apksigner
