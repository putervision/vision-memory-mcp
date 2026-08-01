import { describe, it, expect } from 'vitest';
import {
  generatePlaywrightSnippet,
  generatePlaywrightScript,
} from '../../src/core/automation-hooks.js';

describe('Automation Hooks Engine', () => {
  it('should generate click snippet with selector', () => {
    const snippet = generatePlaywrightSnippet({
      action: 'click',
      target_selector: '#login-btn',
    });
    expect(snippet).toBe("await page.click('#login-btn');");
  });

  it('should generate click snippet with coordinates fallback', () => {
    const snippet = generatePlaywrightSnippet({
      action: 'click',
      target_coords: { x: 100, y: 200 },
    });
    expect(snippet).toBe('await page.mouse.click(100, 200);');
  });

  it('should generate generic click snippet if no selector or coords', () => {
    const snippet = generatePlaywrightSnippet({ action: 'click' });
    expect(snippet).toBe('// Action: click target element');
  });

  it('should generate fill snippet with selector', () => {
    const snippet = generatePlaywrightSnippet({
      action: 'type',
      target_selector: '#username',
      suggested_input_value: 'user123',
    });
    expect(snippet).toBe("await page.fill('#username', 'user123');");
  });

  it('should generate fill snippet with coordinates fallback', () => {
    const snippet = generatePlaywrightSnippet({
      action: 'fill',
      target_coords: { x: 50, y: 50 },
    });
    expect(snippet).toContain('await page.mouse.click(50, 50);');
    expect(snippet).toContain("await page.keyboard.type('example_text');");
  });

  it('should generate generic fill snippet if no selector or coords', () => {
    const snippet = generatePlaywrightSnippet({ action: 'fill' });
    expect(snippet).toBe('// Action: fill target input field');
  });

  it('should generate custom action snippet', () => {
    const snippet = generatePlaywrightSnippet({ action: 'scroll_down' });
    expect(snippet).toBe('// Custom Action: scroll_down');
  });

  it('should generate full Playwright script from array of targets', () => {
    const script = generatePlaywrightScript([{ action: 'click', target_selector: '#btn' }]);
    expect(script).toContain("import { Page } from '@playwright/test';");
    expect(script).toContain("await page.click('#btn');");
  });
});
