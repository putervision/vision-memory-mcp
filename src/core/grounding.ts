import { GroundedElement, GroundedActionTarget } from '../types.js';
import { logger } from '../logger.js';

/**
 * Parses raw Accessibility Tree (AX Tree) JSON or object structures into a list of GroundedElements.
 */
export function parseAXTreeToGroundedElements(
  axTreeInput?: string | object | null
): GroundedElement[] {
  if (!axTreeInput) return [];

  let rawTree: any;
  if (typeof axTreeInput === 'string') {
    try {
      rawTree = JSON.parse(axTreeInput);
    } catch {
      logger.debug('Failed to parse accessibility_tree JSON in grounding module.');
      return [];
    }
  } else {
    rawTree = axTreeInput;
  }

  const results: GroundedElement[] = [];

  function traverse(node: any, path: string = '') {
    if (!node || typeof node !== 'object') return;

    const role = (node.role || node.type || node.nodeType || 'other').toLowerCase();
    const label = (
      node.label ||
      node.name ||
      node.text ||
      node.title ||
      node.placeholder ||
      ''
    ).trim();
    const id = node.id || node.elementId || node.nodeId || '';
    const state = node.state || (node.disabled ? 'disabled' : node.focused ? 'focused' : 'enabled');
    const value = node.value || node.inputValue || '';

    // Bounding Box extraction: [x, y, width, height]
    let bbox: [number, number, number, number] = [0, 0, 0, 0];
    if (Array.isArray(node.bbox) && node.bbox.length === 4) {
      bbox = [node.bbox[0], node.bbox[1], node.bbox[2], node.bbox[3]];
    } else if (node.rect && typeof node.rect === 'object') {
      bbox = [node.rect.x || 0, node.rect.y || 0, node.rect.width || 0, node.rect.height || 0];
    } else if (node.bounds && typeof node.bounds === 'object') {
      bbox = [
        node.bounds.left || 0,
        node.bounds.top || 0,
        node.bounds.width || 0,
        node.bounds.height || 0,
      ];
    }

    const centerX = Math.round(bbox[0] + bbox[2] / 2);
    const centerY = Math.round(bbox[1] + bbox[3] / 2);

    // CSS Selector generation fallback
    let selector = '';
    if (id) {
      selector = `#${id}`;
    } else if (node.selector) {
      selector = node.selector;
    } else if (label) {
      const sanitizedLabel = label.replace(/"/g, '\\"');
      selector = `${role}[aria-label="${sanitizedLabel}"], ${role}:has-text("${sanitizedLabel}")`;
    } else if (path) {
      selector = path;
    }

    const isInteractive =
      [
        'button',
        'input',
        'link',
        'checkbox',
        'combobox',
        'textbox',
        'select',
        'radio',
        'menuitem',
      ].includes(role) ||
      Boolean(
        node.clickable || node.interactive || id || (label && role !== 'text' && role !== 'generic')
      );

    if (isInteractive && (label || id || selector)) {
      results.push({
        id: id || selector || `elem_${results.length + 1}`,
        role,
        label: label || id || role,
        selector,
        bbox,
        center: [centerX, centerY],
        state,
        value,
      });
    }

    // Recurse children
    const children = node.children || node.nodes || node.childNodes;
    if (Array.isArray(children)) {
      children.forEach((child, index) => {
        traverse(child, `${selector || role} > *:nth-child(${index + 1})`);
      });
    }
  }

  if (Array.isArray(rawTree)) {
    rawTree.forEach((item, idx) => traverse(item, `*:nth-child(${idx + 1})`));
  } else {
    traverse(rawTree);
  }

  return results;
}

/**
 * Matches a natural language goal description against grounded interactive elements to produce concrete action targets.
 */
export function matchGroundedTarget(
  elements: GroundedElement[],
  goalOrActionDescription: string
): GroundedActionTarget | null {
  if (!elements.length || !goalOrActionDescription) return null;

  const query = goalOrActionDescription.toLowerCase();

  // Determine intent (click vs type)
  const isType =
    query.includes('type') ||
    query.includes('enter') ||
    query.includes('fill') ||
    query.includes('input');
  const action = isType ? 'type' : 'click';

  let bestMatch: GroundedElement | null = null;
  let bestScore = -1;

  for (const elem of elements) {
    let score = 0;
    const labelLower = elem.label.toLowerCase();
    const roleLower = elem.role.toLowerCase();

    if (query.includes(labelLower) && labelLower.length > 0) {
      score += 10 + labelLower.length;
    }

    if (isType && (roleLower === 'input' || roleLower === 'textbox' || roleLower === 'combobox')) {
      score += 5;
    } else if (!isType && (roleLower === 'button' || roleLower === 'link')) {
      score += 5;
    }

    if (score > bestScore) {
      bestScore = score;
      bestMatch = elem;
    }
  }

  if (!bestMatch || bestScore <= 0) {
    // Fallback to first interactive element of matching type
    bestMatch =
      elements.find((e) => (isType ? e.role === 'input' : e.role === 'button')) || elements[0];
  }

  return {
    action,
    target_selector: bestMatch.selector,
    target_coords: { x: bestMatch.center[0], y: bestMatch.center[1] },
    element_label: bestMatch.label,
    element_role: bestMatch.role,
  };
}
