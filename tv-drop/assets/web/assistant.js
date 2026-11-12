/* TV Drop assistant: turns a sentence (typed or spoken) into an intent.
 * Pure function, no side effects: the interface checks compatibility and executes.
 * Rules only (no paid AI). A future AI layer can replace interpret() keeping the same output:
 *   { intent, args, label, confirm }
 * Intents: app, key, keys, volumeSet, volumeStep, text, search, timer, timerCancel,
 *          shortcut, queueNext, queuePrev, playerToggle, power, go.
 */
(function (root) {
  'use strict';

  const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[.!?,;]/g, ' ').replace(/\s+/g, ' ').trim();

  const NUM_WORDS = { um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8, nove: 9, dez: 10,
    quinze: 15, vinte: 20, trinta: 30, quarenta: 40, cinquenta: 50, sessenta: 60, noventa: 90, cem: 100 };

  /** First number in the sentence, as digits or words ("30", "trinta"). */
  function number(t) {
    const m = t.match(/\d+/);
    if (m) return +m[0];
    for (const w of t.split(' ')) if (NUM_WORDS[w]) return NUM_WORDS[w];
    return null;
  }

  /** Duration in minutes: "meia hora", "uma hora", "2 horas", "45 minutos", "hora e meia". */
  function minutes(t) {
    if (/\bhora e meia\b/.test(t)) return 90;
    if (/\bmeia hora\b/.test(t)) return 30;
    const n = number(t);
    if (/\bhoras?\b/.test(t) && !/\bminutos?\b/.test(t)) return (n || 1) * 60;
    return n;
  }

  /**
   * @param {string} raw sentence
   * @param {{apps?: {name:string, pkg:string}[], shortcuts?: string[]}} ctx known apps and shortcut names
   */
  function interpret(raw, ctx) {
    ctx = ctx || {};
    const t = norm(raw);
    if (!t) return null;
    let m;

    // timer first: "desligar em 30 minutos" must not turn the TV off now
    if (/\b(cancela(r)?|desativa(r)?|para(r)?)\b.*\btemporizador\b/.test(t)) return { intent: 'timerCancel', label: 'cancelar o temporizador' };
    if (/\b(em|daqui a|depois de|daqui)\b.*\b(minutos?|horas?|hora)\b/.test(t) || /\btemporizador\b/.test(t)) {
      const min = minutes(t);
      if (min) {
        const action = /deslig|apag/.test(t) ? 'power' : /silenci|mudo|sem som/.test(t) ? 'mute' : /encerra|termina|para de tocar|fecha/.test(t) ? 'stop' : 'pause';
        const verb = { power: 'desligar a TV', mute: 'silenciar', stop: 'encerrar a reprodução', pause: 'pausar' }[action];
        return { intent: 'timer', args: { minutes: min, action }, label: `${verb} em ${min} min` };
      }
    }

    if ((m = t.match(/^(executa(r)?|ativa(r)?|liga(r)?|roda(r)?|inicia(r)?)\s+(o\s+|a\s+)?(atalho\s+)?(.+)$/)) && ctx.shortcuts) {
      const name = m[m.length - 1];
      const sc = ctx.shortcuts.find((s) => norm(s) === name || norm(s).includes(name) || name.includes(norm(s)));
      if (sc) return { intent: 'shortcut', args: { name: sc }, label: 'executar "' + sc + '"' };
    }

    if ((m = t.match(/^(abr(ir|a|e)|abre o|abra o|abrir o|abrir a|entra(r)? no|entra(r)? na|vai pro|vai para o|coloca(r)?|bota(r)?)\s+(o |a |no |na )?(.+)$/))) {
      const name = m[8].replace(/^(app|aplicativo)\s+(do |da |de )?/, '').trim();
      const key = name.replace(/\s+/g, '');
      const apps = ctx.apps || [];
      const app = apps.find((a) => norm(a.name).replace(/[^a-z0-9+]/g, '') === key)
        || apps.find((a) => { const n = norm(a.name).replace(/[^a-z0-9+]/g, ''); return n.includes(key) || key.includes(n); });
      if (app) return { intent: 'app', args: { pkg: app.pkg, name: app.name }, label: 'abrir ' + app.name };
      return { intent: 'app', args: { missing: name }, label: `abrir "${name}" (não está instalado na TV)` };
    }

    if ((m = t.match(/\bvolume\s+(em|no|para|pra)\s+(\d+)/)) || (m = t.match(/\b(coloca|deixa|poe)\s+(o\s+)?volume\s+(em|no)?\s*(\d+)/))) {
      const level = +(m[4] || m[2]);
      return { intent: 'volumeSet', args: { level }, label: 'volume em ' + level };
    }
    if (/(aumenta|aumentar|sobe|subir|mais alto|aumente)/.test(t) && /(volume|som)/.test(t) || /^mais (alto|volume)/.test(t)) {
      const n = Math.min(20, number(t) || 2);
      return { intent: 'volumeStep', args: { dir: 'up', steps: n }, label: `aumentar volume (${n}x)` };
    }
    if (/(diminui|diminuir|abaixa|abaixar|desce|baixar|mais baixo|diminua|abaixe)/.test(t) && /(volume|som)/.test(t) || /^mais baixo/.test(t)) {
      const n = Math.min(20, number(t) || 2);
      return { intent: 'volumeStep', args: { dir: 'down', steps: n }, label: `diminuir volume (${n}x)` };
    }
    if (/^(mudo|silencia(r)?|silencio|tira(r)? o som|sem som)\b/.test(t)) return { intent: 'key', args: { key: 'mute' }, label: 'silenciar' };

    if ((m = t.match(/^(pesquisa(r)?|procura(r)?|busca(r)?|pesquise|procure|busque)\s+(por\s+)?(.+)$/))) {
      const q = String(raw).trim().replace(/^\s*\S+\s+(por\s+)?/i, '').replace(/[.!?]+$/, '');
      return { intent: 'search', args: { query: q }, label: `pesquisar "${q}"` };
    }
    if ((m = t.match(/^(digita(r)?|escreve(r)?|digite|escreva)\s+(.+)$/))) {
      const q = String(raw).trim().replace(/^\s*\S+\s+/, '');
      return { intent: 'text', args: { text: q }, label: `digitar "${q}"` };
    }

    if (/^(proximo|proxima|pula(r)?|avanca(r)? (pro|para o) proximo)( video| musica| item)?$/.test(t)) return { intent: 'queueNext', label: 'próximo da fila' };
    if (/^(anterior|volta(r)? (pro|para o) anterior)( video| musica| item)?$/.test(t)) return { intent: 'queuePrev', label: 'anterior da fila' };
    if (/^(pausa(r)?|pause|para(r)?( o video| a musica)?)$/.test(t)) return { intent: 'playerToggle', args: { want: 'pause' }, label: 'pausar' };
    if (/^(continua(r)?|reproduzi(r)?|reproduza|toca(r)?|play|retoma(r)?|despausa(r)?)$/.test(t)) return { intent: 'playerToggle', args: { want: 'play' }, label: 'reproduzir' };

    if (/^(volta(r)?|voltar tela|retorna(r)?|volte)$/.test(t)) return { intent: 'key', args: { key: 'back' }, label: 'voltar' };
    if (/\b(inicio|tela inicial|home|menu principal)\b/.test(t)) return { intent: 'key', args: { key: 'home' }, label: 'ir para o início' };
    if (/^(ok|seleciona(r)?|confirma(r)?|entra(r)?|enter)$/.test(t)) return { intent: 'key', args: { key: 'ok' }, label: 'OK' };
    if ((m = t.match(/^(cima|sobe|subir|baixo|desce|descer|esquerda|direita)( (\d+)( vezes)?)?$/))) {
      const map = { cima: 'up', sobe: 'up', subir: 'up', baixo: 'down', desce: 'down', descer: 'down', esquerda: 'left', direita: 'right' };
      const n = m[3] ? Math.min(10, +m[3]) : 1;
      return { intent: 'keys', args: { key: map[m[1]], times: n }, label: `${m[1]}${n > 1 ? ' ' + n + 'x' : ''}` };
    }
    if (/\b(configurac(ao|oes)|ajustes)\b/.test(t)) return { intent: 'key', args: { key: 'settings' }, label: 'abrir as configurações' };
    if (/\b(desliga(r)?|apaga(r)?|desligue)\b.*\b(tv|televisao)\b|^desliga(r)?$/.test(t)) return { intent: 'power', label: 'desligar a TV', confirm: true };
    if (/\b(liga(r)?|ligue)\b.*\b(tv|televisao)\b/.test(t)) return { intent: 'power', label: 'ligar a TV', confirm: true };
    if (/\b(quero assistir|assistir)\b.*\bfilme\b|\bquero ver um filme\b/.test(t)) return { intent: 'go', args: { view: 'apps' }, label: 'mostrar os apps de streaming' };
    if (/\b(envi[ae](r)?|mand[ae](r)?|transmit[ae]|transmitir)\b.*\b(video|arquivo|foto)\b/.test(t)) return { intent: 'go', args: { view: 'cast' }, label: 'abrir a tela de transmissão' };
    return null;
  }

  const api = { interpret, norm, number, minutes };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TVDropAssistant = api;
})(typeof window !== 'undefined' ? window : this);
