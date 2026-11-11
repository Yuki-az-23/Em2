import { describe, it, expect } from 'vitest';
import { makeAi, TEXT_MAX_TOKENS, IMAGE_STEPS } from '../src/ai.js';

function recorder(reply) {
  const calls = [];
  return { calls, env: { AI: { run: async (model, input) => { calls.push([model, input]); return reply(model, input); } } } };
}

describe('Workers AI inputs', () => {
  it('text calls ask for a large enough output budget', async () => {
    const r = recorder((m, input) => (input.response_format ? { text: 't', removed: [] } : { response: 'p' }));
    const ai = makeAi(r.env);
    await ai.redact('שלום');
    await ai.paraphrase('שלום');
    expect(r.calls).toHaveLength(2);
    for (const [model, input] of r.calls) {
      expect(model).toBe('@cf/openai/gpt-oss-120b');
      expect(input.max_tokens).toBe(TEXT_MAX_TOKENS);
    }
    expect(TEXT_MAX_TOKENS).toBe(4096);
  });

  it('the image call uses `steps`, which flux accepts, not `num_steps`', async () => {
    const r = recorder(() => ({ image: btoa('png') }));
    const out = await makeAi(r.env).render('two figures', 'comic');
    expect(out).toBeInstanceOf(ArrayBuffer);
    const [model, input] = r.calls[0];
    expect(model).toBe('@cf/black-forest-labs/flux-1-schnell');
    expect(input.steps).toBe(IMAGE_STEPS);
    expect(input).not.toHaveProperty('num_steps');
    expect(IMAGE_STEPS).toBeLessThanOrEqual(8);
  });
});
