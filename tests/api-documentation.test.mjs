import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

const catalog = JSON.parse(fs.readFileSync(new URL('../src/cfg/api-collections.json', import.meta.url), 'utf8'));
function load(browser = {}) {
  const config = { name: 'CRM', version: '1.0.0', basePath: '/api/v1', maxLimit: 100, defaultLimit: 25, collections: catalog };
  const resolve = id => id === '@/cfg/api' ? { apiConfig: config } : { buildApiOpenApi: () => ({ openapi: '3.0.3', paths: { '/api/v1': {} } }) };
  const code = ts.transpileModule(fs.readFileSync(new URL('../src/lib/api-documentation.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports = {};
  new Function('exports', 'require', 'document', 'URL', 'setTimeout', 'navigator', 'HTMLElement', code)(exports, resolve, browser.document, browser.URL, browser.setTimeout, browser.navigator, browser.HTMLElement || class {});
  return exports;
}

test('copiar tudo inclui todas as colecoes, campos, autenticacao e OpenAPI com o dominio atual', () => {
  const lib = load();
  const text = lib.apiDocumentation('https://crm.example');
  for (const item of catalog) assert.ok(text.includes(`"name": "${item.name}"`));
  assert.match(text, /productId/);
  assert.match(text, /Authorization: Bearer <Firebase ID token>/);
  assert.match(text, /https:\/\/crm.example\/api\/v1/);
  assert.deepEqual(lib.openApiDocument('https://crm.example').servers, [{ url: 'https://crm.example' }]);
});

test('download gera JSON sem rede, anexa link antes do clique e libera URL depois', async () => {
  const events = [];
  let blob, cleanup;
  const link = { click: () => events.push('click'), remove: () => events.push('remove') };
  const lib = load({
    document: { createElement: tag => { assert.equal(tag, 'a'); return link; }, body: { appendChild: () => events.push('append') } },
    URL: { createObjectURL: value => { blob = value; return 'blob:document'; }, revokeObjectURL: url => events.push(url) },
    setTimeout: (callback, delay) => { assert.equal(delay, 60000); cleanup = callback; },
  });
  lib.downloadApiDocument('https://crm.example');
  assert.equal(link.download, 'crm-api-openapi.json');
  assert.equal(link.href, 'blob:document');
  assert.deepEqual(events, ['append', 'click', 'remove']);
  const spec = JSON.parse(await blob.text());
  assert.equal(spec.openapi, '3.0.3');
  assert.equal(spec.servers[0].url, 'https://crm.example');
  cleanup();
  assert.equal(events.at(-1), 'blob:document');
});

test('copia usa clipboard e recorre a selecao quando o navegador bloqueia', async () => {
  let copied;
  await load({ navigator: { clipboard: { writeText: async text => { copied = text; } } } }).copyApiText('documentacao');
  assert.equal(copied, 'documentacao');
  for (const success of [true, false]) {
    const events = [];
    const textarea = { setAttribute: () => {}, style: {}, select: () => events.push('select'), remove: () => events.push('remove') };
    const lib = load({ navigator: { clipboard: { writeText: async () => { throw new Error('blocked'); } } },
      document: { createElement: () => textarea, body: { appendChild: () => events.push('append') }, execCommand: () => success },
    });
    if (success) await lib.copyApiText('todos os campos');
    else await assert.rejects(lib.copyApiText('todos os campos'), /bloqueou/);
    assert.equal(textarea.value, 'todos os campos');
    assert.deepEqual(events, ['append', 'select', 'remove']);
  }
});
