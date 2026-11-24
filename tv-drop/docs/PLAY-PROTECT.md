# TV Drop e o Google Play Protect: diagnóstico e resolução

Data: 17/11/2026. Versão analisada: 2.11.21 (a publicada). Versão corrigida: 2.12.

## 1. Causa

**Confirmada pela documentação oficial do Google.** O APK único do TV Drop (o mesmo na TV e no celular) declarava dois serviços que o Play Protect trata como de alto risco quando o app chega por download da internet:

| Componente | Permissão do serviço | Para que serve no TV Drop |
| --- | --- | --- |
| `TvDropAccessibility` | `BIND_ACCESSIBILITY_SERVICE` | Na TV: cursor de touchpad, Voltar/Início, setas no Android 13+, digitar no campo em foco |
| `MediaListener` | `BIND_NOTIFICATION_LISTENER_SERVICE` | Na TV: mostrar no celular o que outros apps estão tocando |

Texto do Google, seção "App blocked": apps baixados de fontes de instalação pela internet (navegador, apps de mensagem, gerenciadores de arquivos) que declaram `RECEIVE_SMS`, `READ_SMS`, `NOTIFICATION_LISTENER` ou `ACCESSIBILITY` têm a instalação **bloqueada automaticamente** ("Google Play Protect will automatically block the installation"). A única forma de o usuário instalar é desligar o Play Protect, exatamente o que acontecia. Fonte: https://developers.google.com/android/play-protect/warning-dev-guidance

Por isso o bloqueio era **"em alguns aparelhos"**:

- **No celular**, o APK baixado pelo navegador ou aberto pelo gerenciador de arquivos cai na regra.
- **Na TV**, a instalação pelo ADB (Termux) não é uma fonte de download da internet, então passa.

**Não é falso positivo, e não é detecção de malware (PHA).** É uma regra por permissões declaradas, que vale para qualquer app, malicioso ou não. Por isso a correção é na origem, e não uma contestação.

**Ressalva:** a mensagem exata que aparece no seu aparelho não foi vista aqui (não há celular nem TV ligados a este ambiente). A regra acima é a única documentada que bloqueia a instalação sem deixar continuar; se a mensagem for outra, anote o texto e veja o item 7.

## 2. Auditoria do APK 2.11.21

APK: `TV-Drop.apk` da release `tv-drop-v2.11.21`, SHA-256 `d3c478864b92307d461c26275b29f3d9d26ef9044698e8ba10f89c7d814cfa7e`, versionCode 21, targetSdk 34.

| Item | Encontrado | Avaliação |
| --- | --- | --- |
| Acessibilidade | Declarada; não lê a tela (só o campo em foco quando pedido para digitar), não clica em telas de instalação nem de permissão, não guarda nada | Legítima, mas dispara o bloqueio. Só a TV usa |
| Leitor de notificações | Declarado; usado só para listar as sessões de mídia ativas | Legítimo, mas dispara o bloqueio. Só a TV usa |
| `REQUEST_INSTALL_PACKAGES` | Instala os APKs enviados à TV via `PackageInstaller`, **sempre com a tela de confirmação do Android** | Legítimo na TV; desnecessário no celular |
| `REQUEST_DELETE_PACKAGES` | Desinstalação pela tela do sistema (`ACTION_DELETE`), com confirmação | Legítimo na TV; desnecessário no celular |
| `SYSTEM_ALERT_WINDOW` | Abrir vídeo/instalação com o TV Drop em segundo plano | Legítimo na TV; desnecessário no celular |
| `PACKAGE_USAGE_STATS` | Tamanho de cada app na tela de armazenamento da TV (liberado por ADB) | Legítimo na TV; desnecessário no celular |
| `RECEIVE_BOOT_COMPLETED` | Liga o receptor quando a TV liga (só se for TV) | Legítimo na TV; desnecessário no celular |
| Espelhamento (`mediaProjection`) | O Android pede autorização a cada vez | Legítimo no celular |
| Código dinâmico | Nenhum (`DexClassLoader`, `Runtime.exec`, `su`: não usados) | OK |
| Bibliotecas nativas | Só `libffmpegJNI.so` (decodificador de áudio Jellyfin/Media3) | OK |
| Dependências | Media3 1.9.0, Jellyfin FFmpeg decoder, ZXing 3.5.3, Play Services Code Scanner 16.1.0 | Bibliotecas conhecidas |
| WebView com ponte JavaScript | Só navega no conteúdo embutido e na página da TV pareada; o resto abre fora do app | Aceitável (ver item 5) |
| Tráfego sem HTTPS | Necessário: a TV serve a interface em `http://` na rede local | Aceitável |
| Atualização automática | Não existe | OK |
| `targetSdk 34` | O Play Protect avisa quando o app mira mais de dois níveis abaixo da versão atual | Corrigido para 35 |
| **Assinatura** | v2 válida, mesma chave em todas as versões; **porém a chave privada e a senha estão no repositório público** | Vulnerabilidade (item 4) |

## 3. O que foi corrigido (2.12)

1. **Dois APKs do mesmo app** (mesmo pacote `com.pereiranord.tvdrop`, mesma assinatura, mesmo código, mesmo versionCode):
   - `TV-Drop-Celular.apk`: **sem** acessibilidade, leitor de notificações, `REQUEST_INSTALL_PACKAGES`, `REQUEST_DELETE_PACKAGES`, `SYSTEM_ALERT_WINDOW`, `PACKAGE_USAGE_STATS`, `RECEIVE_BOOT_COMPLETED` e os receptores de boot e de instalação. Eram 9 permissões em vez de 14 na 2.12; desde a atualização automática o celular voltou a ter `REQUEST_INSTALL_PACKAGES` (10), só para instalar as próprias atualizações, sempre com confirmação do Android. Ela não está entre as permissões que o Play Protect bloqueia. Nada que o celular usa foi removido: todos esses recursos rodam só no servidor da TV, que no celular nunca é ligado.
   - `TV-Drop.apk`: igual ao de antes, para a TV, instalado por ADB como sempre.
   - Implementado com variantes do Gradle (`flavors/celular/AndroidManifest.xml`). Não é ocultação: o APK do celular simplesmente não contém esses serviços.
2. **targetSdk 35** (Android 15), mantendo o layout de sempre nas telas (`windowOptOutEdgeToEdgeEnforcement`).
3. **Rotação da chave de assinatura pronta** (`build.sh` + CI). Falta só a chave nova, que é decisão e guarda sua (item 4).
4. **Distribuição auditável**: cada versão publica os dois APKs, o `SHA256SUMS.txt`, o `SIGNING.txt` (certificado e esquemas de assinatura) e notas dizendo o que vai onde. O APK publicado é o mesmo arquivo que o CI compilou e assinou (GitHub Releases, HTTPS).
5. **Build reproduzível**: o Android Gradle Plugin embutia no bloco de assinatura uma lista de dependências cifrada com uma chave do Google, diferente a cada build (útil só para a Play Console). Foi desligada. Agora o mesmo commit, com o mesmo número de versão, sempre gera o mesmo SHA-256: conferido com dois builds limpos seguidos. Qualquer pessoa pode recompilar e comparar com o `SHA256SUMS.txt`.
6. README corrigido: antes mandava instalar no celular "o mesmo `TV-Drop.apk`", justamente o que o Play Protect bloqueia; agora indica o `TV-Drop-Celular.apk` e diz para **não** desligar o Play Protect.

## 4. Assinatura

- Válida e consistente: v2, certificado `CN=TV Drop`, SHA-256 `bbd1529336bd34bede4139c58e44b2250796d85f58ff26fbc65df0c85825da22`, igual nas versões 2.8.15, 2.9.16 e 2.11.21.
- **Comprometida**: `keystore/tvdrop.jks` e a senha `tvdrop123` estão no repositório público. Qualquer um pode assinar um APK como "TV Drop" e instalá-lo por cima do verdadeiro.
- Correção: rotação v3 para uma chave nova guardada só nos segredos do GitHub. Testada aqui com uma chave descartável: Android 8 vê a chave antiga, Android 9+ vê a nova, e a linhagem antiga→nova sai no APK. Passo a passo em `docs/ASSINATURA.md`. Enquanto a chave nova não existir, os builds continuam com a original e dizem isso nas notas da versão.

## 5. Riscos que continuam

- Até a chave nova ser criada, a identidade do app pode ser falsificada (item 4). Mesmo depois, aparelhos com Android 8.x continuam aceitando a chave antiga (limite da plataforma).
- O `TV-Drop.apk` (TV) continua com acessibilidade e leitor de notificações. Instalado por ADB, não cai na regra. Se alguém o baixar num navegador ou num gerenciador de arquivos da TV, o Play Protect pode bloquear (a documentação não diz se a regra vale em TVs). Também não se sabe se uma atualização do TV Drop enviada pelo próprio TV Drop conta como "fonte da internet".
- A interface da TV é servida em HTTP na rede local e tem uma ponte JavaScript no app do celular. Um aparelho malicioso na mesma rede, fingindo ser a TV pareada, conseguiria chamar essa ponte (escolher TV, preferências, QR, espelhamento com autorização do Android). Não dá acesso a arquivos nem executa código.
- Nada foi testado em aparelho físico neste ambiente: os manifestos, as permissões, a assinatura e o alinhamento foram conferidos com `aapt2`, `apksigner` e `zipalign`. Os testes do app passaram.

## 6. Revisão pelo Google

**Não foi pedida, e não deve ser por enquanto.** A contestação ("Play Protect appeal") serve para classificação errada de um app; aqui o bloqueio é uma regra documentada por permissão, e a correção é não declarar essas permissões no APK que se baixa pela internet, o que foi feito.

Se o `TV-Drop-Celular.apk` 2.12 ainda for bloqueado:

1. Anote o texto exato da mensagem (foto da tela), o modelo do celular, a versão do Android e de onde o APK foi aberto (navegador, gerenciador de arquivos…).
2. Confira o SHA-256 do arquivo com o `SHA256SUMS.txt` da release.
3. Abra a contestação em https://support.google.com/googleplay/android-developer/contact/protectappeals com: pacote `com.pereiranord.tvdrop`, versão, SHA-256 do APK, SHA-256 do certificado de assinatura, link da release no GitHub, a mensagem e este documento (itens 2 e 3).
4. Só considere resolvido quando o Google responder. Ninguém pode afirmar que uma contestação foi aprovada antes disso.

## 7. O que depende do Google

- **Verificação de desenvolvedor**: no Brasil, desde 30/09/2026, ela vale para lojas participantes. Para downloads diretos (como o GitHub), a expansão está prevista para 2027, só em celulares e tablets. A partir daí, até o `TV-Drop-Celular.apk` precisará do pacote registrado no Android Developer Console, com a chave nova (veja `docs/ASSINATURA.md`). Instalações por ADB continuam livres.
- **Contestação**, só se o item 6 for necessário.
- **Play Store** (opcional): resolveria a distribuição e a reputação, mas a política da Play exige justificar e declarar o uso de acessibilidade, e o uso como touchpad da TV precisaria ser aceito na revisão. O APK do celular, que não usa acessibilidade, seria o candidato natural. Com Play App Signing, o registro de identidade é automático.

## Referências

- Play Protect, avisos para desenvolvedores (inclui "App blocked" e o link de contestação): https://developers.google.com/android/play-protect/warning-dev-guidance
- Verificação de desenvolvedor Android: https://developer.android.com/developer-verification/guides
- APK Signature Scheme v3 (rotação de chave): https://source.android.com/docs/security/features/apksigning/v3
- apksigner: https://developer.android.com/tools/apksigner
