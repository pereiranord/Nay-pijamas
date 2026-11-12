// Tests for assets/web/assistant.js — run with: node tv-drop/test/assistant.test.js
'use strict';
const assert = require('assert');
const path = require('path');
const { interpret, minutes } = require(path.join(__dirname, '..', 'assets', 'web', 'assistant.js'));

const ctx = {
  apps: [{ name: 'YouTube', pkg: 'com.google.android.youtube.tv' }, { name: 'Netflix', pkg: 'com.netflix.ninja' },
    { name: 'Globoplay', pkg: 'com.globo.globotv' }, { name: 'Prime Video', pkg: 'com.amazon.amazonvideo.livingroom' }],
  shortcuts: ['Modo filme', 'Modo descanso'],
};
let n = 0;
function t(sentence, check) {
  const r = interpret(sentence, ctx);
  try { check(r); n++; } catch (e) { console.error('FALHOU:', JSON.stringify(sentence), '->', JSON.stringify(r)); throw e; }
}

t('Abrir YouTube', (r) => { assert.strictEqual(r.intent, 'app'); assert.strictEqual(r.args.pkg, 'com.google.android.youtube.tv'); });
t('abre a netflix', (r) => assert.strictEqual(r.args.pkg, 'com.netflix.ninja'));
t('abrir o prime video', (r) => assert.strictEqual(r.args.pkg, 'com.amazon.amazonvideo.livingroom'));
t('abrir disney', (r) => { assert.strictEqual(r.intent, 'app'); assert.ok(r.args.missing); });
t('Aumentar volume', (r) => { assert.strictEqual(r.intent, 'volumeStep'); assert.strictEqual(r.args.dir, 'up'); });
t('diminuir o volume 5 vezes', (r) => { assert.strictEqual(r.args.dir, 'down'); assert.strictEqual(r.args.steps, 5); });
t('Coloque o volume em 20', (r) => { assert.strictEqual(r.intent, 'volumeSet'); assert.strictEqual(r.args.level, 20); });
t('volume em 12', (r) => assert.strictEqual(r.args.level, 12));
t('Voltar', (r) => assert.strictEqual(r.args.key, 'back'));
t('Ir para o início', (r) => assert.strictEqual(r.args.key, 'home'));
t('Pesquisar filmes de ação', (r) => { assert.strictEqual(r.intent, 'search'); assert.strictEqual(r.args.query, 'filmes de ação'); });
t('Pausar reprodução', (r) => assert.ok(r === null || r.intent === 'playerToggle'));
t('pausar', (r) => assert.strictEqual(r.intent, 'playerToggle'));
t('Reproduzir', (r) => assert.strictEqual(r.args.want, 'play'));
t('Desligue em 30 minutos', (r) => { assert.strictEqual(r.intent, 'timer'); assert.deepStrictEqual(r.args, { minutes: 30, action: 'power' }); });
t('desligar a tv daqui a uma hora', (r) => assert.deepStrictEqual(r.args, { minutes: 60, action: 'power' }));
t('pausar em meia hora', (r) => assert.deepStrictEqual(r.args, { minutes: 30, action: 'pause' }));
t('cancelar o temporizador', (r) => assert.strictEqual(r.intent, 'timerCancel'));
t('Desligar a TV', (r) => { assert.strictEqual(r.intent, 'power'); assert.strictEqual(r.confirm, true); });
t('ativar modo filme', (r) => { assert.strictEqual(r.intent, 'shortcut'); assert.strictEqual(r.args.name, 'Modo filme'); });
t('Quero assistir um filme', (r) => assert.strictEqual(r.args.view, 'apps'));
t('Envie esse vídeo para a televisão', (r) => assert.strictEqual(r.args.view, 'cast'));
t('direita 3', (r) => { assert.strictEqual(r.intent, 'keys'); assert.strictEqual(r.args.times, 3); });
t('próximo', (r) => assert.strictEqual(r.intent, 'queueNext'));
t('digitar stranger things', (r) => assert.strictEqual(r.args.text, 'stranger things'));
t('blá blá blá', (r) => assert.strictEqual(r, null));
assert.strictEqual(minutes('em 2 horas'), 120);
console.log('assistant.js:', n + 1, 'testes ok');
