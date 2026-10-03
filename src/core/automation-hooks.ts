import { GroundedActionTarget } from '../types.js';

export interface AutomationStep {
  action: string;
  target_selector?: string;
  target_coords?: { x: number; y: number };
  value?: string;
}

function quoteJsString(str: string): string {
  return `'${str.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n').replace(/\r/g, '\\r')}'`;
}

/**
 * Generates executable Playwright code snippets from grounded action targets.
 */
export function generatePlaywrightSnippet(target: GroundedActionTarget): string {
  const action = target.action.toLowerCase();
  const selector = target.target_selector;

  if (action === 'click') {
    if (selector) {
      return `await page.click(${quoteJsString(selector)});`;
    } else if (target.target_coords) {
      const x = Number(target.target_coords.x) || 0;
      const y = Number(target.target_coords.y) || 0;
      return `await page.mouse.click(${x}, ${y});`;
    }
    return `// Action: click target element`;
  } else if (action === 'type' || action === 'fill') {
    const val = target.suggested_input_value || 'example_text';
    if (selector) {
      return `await page.fill(${quoteJsString(selector)}, ${quoteJsString(val)});`;
    } else if (target.target_coords) {
      const x = Number(target.target_coords.x) || 0;
      const y = Number(target.target_coords.y) || 0;
      return `await page.mouse.click(${x}, ${y});\nawait page.keyboard.type(${quoteJsString(val)});`;
    }
    return `// Action: fill target input field`;
  }

  return `// Custom Action: ${target.action}`;
}

/**
 * Generates a full async Playwright navigation function from a sequence of steps.
 */
export function generatePlaywrightScript(targets: GroundedActionTarget[]): string {
  const lines = targets.map((t) => generatePlaywrightSnippet(t));
  return `import { Page } from '@playwright/test';

export async function executeNavPath(page: Page) {
  ${lines.join('\n  ')}
}`;
}
