import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { parseAXTreeToGroundedElements, matchGroundedTarget } from '../../src/core/grounding.js';
import {
  getRegistry,
  registerProject,
  unregisterProject,
  getProjectFromRegistry,
  REGISTRY_PATH,
} from '../../src/core/registry.js';
import fs from 'fs';
import path from 'path';
import os from 'os';

describe('Grounding & Global Registry Exhaustive Test Suite', () => {
  describe('grounding module', () => {
    it('should handle empty, invalid, and oversized AX tree inputs', () => {
      expect(parseAXTreeToGroundedElements(null)).toEqual([]);
      expect(parseAXTreeToGroundedElements('')).toEqual([]);
      expect(parseAXTreeToGroundedElements('{invalid json')).toEqual([]);

      const oversized = 'a'.repeat(1024 * 1024 + 10);
      expect(parseAXTreeToGroundedElements(oversized)).toEqual([]);
    });

    it('should parse complex AX tree structures with bounds, rects, and selectors', () => {
      const axTree = {
        role: 'dialog',
        children: [
          {
            role: 'button',
            label: 'Submit Form',
            id: 'btn-submit',
            rect: { x: 10, y: 20, width: 100, height: 40 },
          },
          {
            role: 'input',
            label: 'Email Address',
            bounds: { left: 10, top: 70, width: 200, height: 30 },
            disabled: true,
          },
          {
            role: 'checkbox',
            label: 'Remember Me',
            bbox: [10, 110, 20, 20],
            focused: true,
          },
        ],
      };

      const elements = parseAXTreeToGroundedElements(axTree);
      expect(elements.length).toBe(3);

      expect(elements[0].selector).toBe('#btn-submit');
      expect(elements[0].center).toEqual([60, 40]);

      expect(elements[1].role).toBe('input');
      expect(elements[1].state).toBe('disabled');

      expect(elements[2].role).toBe('checkbox');
      expect(elements[2].state).toBe('focused');
    });

    it('should match natural language actions to grounded targets', () => {
      const elements = parseAXTreeToGroundedElements([
        {
          role: 'button',
          label: 'Submit Payment',
          id: 'pay-btn',
          rect: { x: 0, y: 0, width: 50, height: 20 },
        },
        {
          role: 'input',
          label: 'Card Number',
          id: 'card-input',
          rect: { x: 0, y: 30, width: 150, height: 30 },
        },
      ]);

      // Click intent
      const clickTarget = matchGroundedTarget(elements, 'Click on Submit Payment button');
      expect(clickTarget).toBeDefined();
      expect(clickTarget?.action).toBe('click');
      expect(clickTarget?.element_label).toBe('Submit Payment');

      // Type intent
      const typeTarget = matchGroundedTarget(elements, 'Type 1234 into Card Number input');
      expect(typeTarget).toBeDefined();
      expect(typeTarget?.action).toBe('type');
      expect(typeTarget?.element_label).toBe('Card Number');

      // Empty fallback
      expect(matchGroundedTarget([], 'click button')).toBeNull();
    });
  });

  describe('global registry module', () => {
    const testProjectName = 'test_unit_registry_proj';
    const testProjPath = path.join(os.tmpdir(), 'test-unit-reg-proj');
    let tmpDir: string;
    let origEnvReg: string | undefined;

    beforeEach(() => {
      origEnvReg = process.env.VISION_MEMORY_REGISTRY_PATH;
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vis-ground-reg-'));
      process.env.VISION_MEMORY_REGISTRY_PATH = path.join(tmpDir, 'projects.json');
    });

    afterEach(() => {
      unregisterProject(testProjectName);
      if (origEnvReg !== undefined) {
        process.env.VISION_MEMORY_REGISTRY_PATH = origEnvReg;
      } else {
        delete process.env.VISION_MEMORY_REGISTRY_PATH;
      }
      if (fs.existsSync(testProjPath)) {
        try {
          fs.rmSync(testProjPath, { recursive: true, force: true });
        } catch {}
      }
      if (fs.existsSync(tmpDir)) {
        try {
          fs.rmSync(tmpDir, { recursive: true, force: true });
        } catch {}
      }
    });

    it('should register, lookup, and unregister projects', () => {
      fs.mkdirSync(testProjPath, { recursive: true });

      // Homedir rejection check
      registerProject('home_proj', os.homedir());
      expect(getProjectFromRegistry('home_proj')).toBeUndefined();

      // Valid project registration
      registerProject(testProjectName, testProjPath);
      expect(getProjectFromRegistry(testProjectName)).toBe(path.resolve(testProjPath));

      const all = getRegistry();
      expect(all[testProjectName]).toBe(path.resolve(testProjPath));

      // Unregister
      unregisterProject(testProjectName);
      expect(getProjectFromRegistry(testProjectName)).toBeUndefined();
    });
  });
});
