// Decision D9: ages are measured on 10 Nov 2026. The group step must say so next to every age field.
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vite-plus/test';
import { initialState } from '../src/booking/machine';
import { GroupStep } from '../src/booking/steps/GroupStep';

describe('GroupStep age fields', () => {
  it('tells people which date their age is measured on', () => {
    const html = renderToStaticMarkup(<GroupStep state={initialState()} dispatch={() => undefined} errors={[]} />);
    expect(html).toContain('Age on 10 Nov 2026 (first festival day)');
  });
});
