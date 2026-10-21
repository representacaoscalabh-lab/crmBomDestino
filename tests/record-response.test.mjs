import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

const exports = {};
const code = ts.transpileModule(fs.readFileSync(new URL('../src/lib/record-response.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
new Function('exports', code)(exports);
const { readRecordResponse } = exports;

test('API ausente ou resposta vazia permite consulta pelo Firebase', async () => {
  for (const [body, status] of [['', 200], ['', 204], ['<html>Site</html>', 200], ['', 404], ['', 405], ['{"code":"server-not-configured"}', 503]]) {
    assert.equal((await readRecordResponse(new Response(status === 204 ? null : body, { status }))).fallback, true);
  }
});

test('preserva JSON valido e detalhe inexistente', async () => {
  assert.deepEqual(await readRecordResponse(Response.json({ rows: [] })), { fallback: false, value: { rows: [] } });
  assert.deepEqual(await readRecordResponse(Response.json(null)), { fallback: false, value: null });
});

test('erros de acesso e falhas de servidor nao acionam fallback', async () => {
  for (const status of [401, 403, 500, 502, 503]) {
    await assert.rejects(readRecordResponse(new Response('', { status })), status < 500 ? /sessão/ : /HTTP/);
  }
  await assert.rejects(readRecordResponse(Response.json({ error: 'Acesso negado.' }, { status: 403 })), /Acesso negado/);
});
