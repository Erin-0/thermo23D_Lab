/* Socle minimal pour exécuter le harnais de simulation dans Node (aucun DOM réel).
 * Le harnais est regroupé par esbuild dans .tmp/sim-tests.mjs (npm run test:sim). */
const nodes = new Map();
globalThis.document = {
  getElementById: (id) => {
    if (!nodes.has(id)) nodes.set(id, { innerHTML: '', style: {} });
    return nodes.get(id);
  },
  createElement: (tag) => ({
    tagName: String(tag).toUpperCase(),
    width: 0,
    height: 0,
    innerHTML: '',
    style: {},
    getContext: () => null,
  }),
};
globalThis.window = globalThis;
await import('../.tmp/sim-tests.mjs');
