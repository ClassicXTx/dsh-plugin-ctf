import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

export const name = 'ctf-stability-mock';
export const inject = ['llm'];

// This adapter only emits a fixed local fixture workflow. No provider SDK or HTTP is used.
export async function apply(ctx, config) {
  const {LlmAdapter} = await import(pathToFileURL(path.join(config.repo, 'packages/llm/llm/lib/index.js')).href);
  const marker = 'CTF_STABILITY_EVENT ';
  const emit = event => console.error(marker + JSON.stringify(event));
  // Web routes Cordis logs to its UI, so stdout alone cannot observe supervisor recovery.
  ctx.logger.exporter({levels: {default: 3}, export(message) {
    const text = typeof message.args[0] === 'string' ? message.args[0] : '';
    if (!text.startsWith('mcp-client(ctf_browser):')) return;
    if (text.includes('reconnected and re-synced tools')) emit({kind: 'mcp-supervisor', state: 'reconnected'});
    else if (text.includes('connection lost; reconnecting')) emit({kind: 'mcp-supervisor', state: 'disconnected'});
    else if (text.includes('giving up after')) emit({kind: 'mcp-supervisor', state: 'exhausted'});
  }});
  ctx.on('session/event', (session, event) => {
    if (['tool/call', 'tool/result', 'assistant/message', 'turn/end'].includes(event.type)) {
      emit({kind: 'session', sessionId: session.id, event});
    }
  }, {global: true});

  const quote = value => "'" + value.replaceAll("'", "''") + "'";
  const commands = mode => ({
    command: '& ' + quote(config.python) + ' -X utf8 ' + quote(config.fixtureScript) + ' ' + mode,
    description: 'Generate and analyze the harmless local CTF regression fixture',
    workdir: config.workspace,
    timeoutMs: 30000,
  });
  const initial = [
    {name: 'skill', args: {name: 'ctf-workbench'}, check: 'skill'},
    {name: 'pwsh', args: commands('initial'), check: 'python'},
    {name: 'mcp__ctf_browser__browser_navigate', args: {url: config.fixtureUrl}, check: 'navigate'},
    {name: 'mcp__ctf_browser__browser_evaluate', args: {function: '() => ({title:document.title,proof:document.querySelector("#proof").textContent,sha256:document.querySelector("#proof").dataset.sha256})'}, check: 'evaluate'},
    {name: 'mcp__ctf_browser__browser_close', args: {}, check: 'close'},
  ];
  const resumed = [
    {name: 'pwsh', args: commands('resumed'), check: 'python'},
    ...initial.slice(2),
  ];
  const cursors = new Map();
  class Adapter extends LlmAdapter {
    async resolveModel(provider, model) { return {provider, id: model, name: model}; }
    async *stream(options) {
      assert.equal(options.provider, 'ctf-stability-local');
      assert.ok(!JSON.stringify(options).includes('UNRELATED_SHARED_SKILL_SENTINEL'));
      assert.ok(!JSON.stringify(options).includes('Shared-root isolation fixture.'));
      // Prompt sections may append user-role reminders after the actual user message.
      const user = options.messages.filter(message => message.role === 'user' && message.content.some(block => block.type === 'text' && /CTF_STABILITY_(?:INITIAL|RESUME|RECONNECT):/.test(block.text))).at(-1);
      const text = user?.content.filter(block => block.type === 'text').map(block => block.text).join('\n');
      const mode = text?.includes('CTF_STABILITY_RECONNECT') ? 'reconnect' : text?.includes('CTF_STABILITY_RESUME') ? 'resumed' : 'initial';
      assert.ok(user, 'Unexpected model request');
      const plan = mode === 'initial' ? initial : mode === 'resumed' ? resumed : initial.slice(2);
      const key = options.sessionId + ':' + mode;
      const step = cursors.get(key) ?? 0;
      cursors.set(key, step + 1);
      if (step === 0) {
        if (mode === 'resumed') {
          assert.ok(options.messages.some(message => message.role === 'assistant' && message.content.some(block => block.type === 'text' && block.text.includes('CTF_STABILITY_INITIAL_OK'))), 'Restored model history lost previous completion');
          assert.ok(options.messages.some(message => message.role === 'tool' && message.toolCallId === 'initial-4-close'), 'Restored model history lost prior tool result');
        }
        const used = [...new Set(initial.map(call => call.name))].map(name => {
          const schema = options.tools?.find(tool => tool.name === name);
          assert.ok(schema, 'Missing model-visible tool: ' + name);
          return schema;
        });
        fs.writeFileSync(path.join(config.runDir, 'tool-schemas-' + mode + '.json'), JSON.stringify(used, null, 2) + '\n');
        emit({kind: 'model-start', mode, toolCount: options.tools.length, restoredHistory: mode === 'resumed'});
      }
      if (step > 0) {
        const previous = plan[step - 1];
        const callId = mode + '-' + (step - 1) + '-' + previous.check;
        const result = options.messages.find(message => message.role === 'tool' && message.toolCallId === callId);
        assert.ok(result, 'Model did not receive previous tool result: ' + callId);
        assert.notEqual(result.isError, true, 'Tool returned error: ' + callId);
      }
      if (step < plan.length) {
        const call = plan[step];
        const schema = options.tools.find(tool => tool.name === call.name).parameters;
        for (const required of schema.required ?? []) assert.ok(Object.hasOwn(call.args, required), 'Required tool argument missing: ' + call.name + '.' + required);
        for (const key of Object.keys(call.args)) assert.ok(Object.hasOwn(schema.properties, key), 'Argument absent from actual tool schema: ' + call.name + '.' + key);
        yield {type: 'block-start', index: 0, blockType: 'tool-call'};
        yield {type: 'block-end', index: 0, block: {type: 'tool-call', id: mode + '-' + step + '-' + call.check, name: call.name, arguments: JSON.stringify(call.args)}};
        yield {type: 'usage', usage: {inputTokens: 1, outputTokens: 1}};
        yield {type: 'finish', reason: {kind: 'tool-calls'}};
      } else {
        assert.equal(step, plan.length, 'Unexpected extra model step');
        const text = 'CTF_STABILITY_' + mode.toUpperCase() + '_OK';
        yield {type: 'block-start', index: 0, blockType: 'text'};
        yield {type: 'text-delta', index: 0, text};
        yield {type: 'block-end', index: 0, block: {type: 'text', text}};
        yield {type: 'usage', usage: {inputTokens: 1, outputTokens: 1}};
        yield {type: 'finish', reason: {kind: 'stop'}};
      }
    }
  }
  ctx.effect(() => ctx.llm.registerAdapter(['ctf-stability-local'], new Adapter()));
}
