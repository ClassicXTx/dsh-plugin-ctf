"""Structural check for the CTF preset patch: parse it with a real YAML loader and
report every model-facing row plus whether it is disabled."""
import sys
import yaml


class Loader(yaml.SafeLoader):
    pass


# `!!js` expressions are not YAML values; keep them as their scalar source text.
Loader.add_multi_constructor(
    'tag:yaml.org,2002:js',
    lambda loader, suffix, node: loader.construct_scalar(node) if isinstance(node, yaml.ScalarNode) else None,
)

with open(sys.argv[1], encoding='utf-8') as handle:
    document = yaml.load(handle, Loader=Loader)

assert isinstance(document, list), 'patch root must be a sequence'
entry = document[0]['insert'][0]
config = entry['config']
print('preset id          :', config['id'])
print('preset name        :', config['name'])
print('agent-instructions :', next(p for p in config['plugins'] if p['id'] == 'agent-instructions')['config'])
print('tool-web           :', next(p for p in config['plugins'] if p['id'] == 'tool-web')['config'])
mcp = next(p for p in config['plugins'] if p['id'] == 'mcp-ctf-browser')['config']
if isinstance(mcp, str):
    # The browser row builds its config from runtime.mjs, so it is a `!!js` expression here;
    # runtime.test.mjs is what asserts the arguments it produces.
    print('mcp server         : ctf_browser (config built by runtime.mjs browserConfig())')
else:
    print('mcp server         :', mcp['serverName'], '| toolCallTimeoutMs =', mcp['toolCallTimeoutMs'],
          '| failOnStartupError =', mcp['failOnStartupError'])
print()

gated, enabled = [], []
for plugin in config['plugins']:
    if plugin.get('group'):
        rows = plugin.get('config') or []
        for row in rows:
            (gated if 'disabled' in row else enabled).append((plugin['id'], row.get('id'), row.get('disabled')))
    else:
        (gated if 'disabled' in plugin else enabled).append(('-', plugin.get('id'), plugin.get('disabled')))

print(f'declared rows: {len(enabled) + len(gated)}')
print('\nDISABLED (conditional):')
for group, row, expression in gated:
    print(f'  {group}/{row}  <- {expression}')
print('\nENABLED rows:')
for group, row, _ in enabled:
    print(f'  {group}/{row}')
