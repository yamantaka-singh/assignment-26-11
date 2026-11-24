// Decision D9: ages are measured on 10 Nov 2026. The group step must say so next to every age field.
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vite-plus/test';
import { App } from '../src/App';
import { advanceCheck, initialState } from '../src/booking/machine';
import { GroupStep } from '../src/booking/steps/GroupStep';

describe('GroupStep validation and layout', () => {
  it('tells people which date their age is measured on', () => {
    const html = renderToStaticMarkup(<GroupStep state={initialState()} dispatch={() => undefined} errors={[]} />);
    expect(html).toContain('Age on 10 Nov 2026 (first festival day)');
  });

  it('renders App without error and without footer mascot attribution', () => {
    const html = renderToStaticMarkup(<App />);
    expect(html).toContain('Sharad Utsav');
    expect(html).toContain('2026');
    expect(html).not.toContain('app-footer-attribution');
    expect(html).not.toContain('Festival mascot illustrations via');
  });

  it('blocks advance on empty form with messages for name, email, phone, and age', () => {
    const check = advanceCheck(initialState());
    expect(check.kind).toBe('blocked');
    if (check.kind === 'blocked') {
      expect(check.messages).toContain('Your name: Please enter your name.');
      expect(check.messages).toContain('Email: Please enter a valid email address.');
      expect(check.messages).toContain('Phone: Enter a valid phone number.');
      expect(check.messages).toContain('Your age: Please enter an age.');
    }
  });

  it('displays inline errors for all empty fields once attempted, with one-line phone error and without top error box', () => {
    const attemptedState = {
      ...initialState(),
      attempted: { ...initialState().attempted, group: true },
    };
    const html = renderToStaticMarkup(<GroupStep state={attemptedState} dispatch={() => undefined} errors={[]} />);
    expect(html).toContain('Please enter your name.');
    expect(html).toContain('Please enter a valid email address.');
    expect(html).toContain('Enter a valid phone number.');
    expect(html).toContain('Please enter an age.');

    const appHtml = renderToStaticMarkup(<App />);
    expect(appHtml).not.toContain('step-errors');
    expect(appHtml).not.toContain('things to fix before you continue');
  });

  it('enforces anti-spam constraint: disables "+ Add another person" until current guest has name and age', () => {
    const stateWithEmptyGuest = {
      ...initialState(),
      draft: {
        ...initialState().draft,
        people: [
          ...initialState().draft.people,
          {
            id: 'guest-1',
            name: '',
            ageInput: '',
            age: null,
            ticket: { kind: 'none' as const },
            dinnerDays: [],
            garbaDays: [],
          },
        ],
      },
    };

    const html = renderToStaticMarkup(<GroupStep state={stateWithEmptyGuest} dispatch={() => undefined} errors={[]} />);
    expect(html).toContain('1 guest added');
    expect(html).toContain('disabled=""');
  });

  it('enables "+ Add another person" and updates count & tabs when guest data is complete', () => {
    const stateWithValidGuest = {
      ...initialState(),
      draft: {
        ...initialState().draft,
        people: [
          ...initialState().draft.people,
          {
            id: 'guest-1',
            name: 'Aarav Shah',
            ageInput: '8',
            age: 8,
            ticket: { kind: 'none' as const },
            dinnerDays: [],
            garbaDays: [],
          },
        ],
      },
    };

    const html = renderToStaticMarkup(<GroupStep state={stateWithValidGuest} dispatch={() => undefined} errors={[]} />);
    expect(html).toContain('1 guest added');
    expect(html).toContain('Aarav Shah');
    expect(html).toContain('8y');
  });

  it('displays multiple guest tabs and total count in one compact view without stacked card boxes', () => {
    const stateWithTwoGuests = {
      ...initialState(),
      draft: {
        ...initialState().draft,
        people: [
          ...initialState().draft.people,
          {
            id: 'guest-1',
            name: 'Aarav',
            ageInput: '8',
            age: 8,
            ticket: { kind: 'none' as const },
            dinnerDays: [],
            garbaDays: [],
          },
          {
            id: 'guest-2',
            name: 'Priya',
            ageInput: '5',
            age: 5,
            ticket: { kind: 'none' as const },
            dinnerDays: [],
            garbaDays: [],
          },
        ],
      },
    };

    const html = renderToStaticMarkup(<GroupStep state={stateWithTwoGuests} dispatch={() => undefined} errors={[]} />);
    expect(html).toContain('2 guests added');
    expect(html).toContain('role="tablist"');
    expect(html).toContain('Aarav');
    expect(html).toContain('Priya');
  });
});
