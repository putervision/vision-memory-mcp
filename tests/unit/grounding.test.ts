import { describe, it, expect } from 'vitest';
import { parseAXTreeToGroundedElements, matchGroundedTarget } from '../../src/core/grounding.js';

describe('Element Grounding Module', () => {
  it('should parse raw AX tree JSON into GroundedElements with bounding boxes', () => {
    const sampleTree = {
      role: 'form',
      children: [
        {
          role: 'textbox',
          id: 'username-input',
          label: 'Username',
          bbox: [100, 200, 300, 40],
        },
        {
          role: 'button',
          id: 'submit-btn',
          label: 'Log In',
          bbox: [100, 260, 150, 45],
        },
      ],
    };

    const elements = parseAXTreeToGroundedElements(JSON.stringify(sampleTree));
    expect(elements).toHaveLength(2);
    expect(elements[0].id).toBe('username-input');
    expect(elements[0].selector).toBe('#username-input');
    expect(elements[0].center).toEqual([250, 220]);

    expect(elements[1].id).toBe('submit-btn');
    expect(elements[1].label).toBe('Log In');
    expect(elements[1].center).toEqual([175, 283]);
  });

  it('should match goal description to grounded target', () => {
    const sampleElements = [
      {
        id: 'search-input',
        role: 'input',
        label: 'Search Query',
        selector: '#search-input',
        bbox: [50, 50, 200, 30] as [number, number, number, number],
        center: [150, 65] as [number, number],
      },
      {
        id: 'checkout-button',
        role: 'button',
        label: 'Proceed to Checkout',
        selector: '#checkout-button',
        bbox: [50, 400, 200, 50] as [number, number, number, number],
        center: [150, 425] as [number, number],
      },
    ];

    const match = matchGroundedTarget(sampleElements, 'click proceed to checkout button');
    expect(match).not.toBeNull();
    expect(match?.action).toBe('click');
    expect(match?.target_selector).toBe('#checkout-button');
    expect(match?.target_coords).toEqual({ x: 150, y: 425 });
  });
});
