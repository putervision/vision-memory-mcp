import { describe, it, expect } from 'vitest';
import { exportObservationDetections } from '../../src/core/grounding.js';
import { GroundedElement } from '../../src/types.js';

describe('Observation Detection Perception Bridge Contract', () => {
  it('returns empty array when no elements provided', () => {
    expect(exportObservationDetections([])).toEqual([]);
    expect(exportObservationDetections(undefined as any)).toEqual([]);
  });

  it('transforms GroundedElements to ObservationDetection records matching world-model contract', () => {
    const elements: GroundedElement[] = [
      {
        id: 'btn_submit',
        role: 'button',
        label: 'Submit Order',
        selector: '#btn_submit',
        bbox: [100, 200, 150, 50],
        center: [175, 225],
        state: 'enabled',
        value: undefined,
      },
      {
        id: 'input_name',
        role: 'input',
        label: 'Full Name',
        selector: 'input[name="full_name"]',
        bbox: [100, 100, 300, 40],
        center: [250, 120],
        state: 'filled',
        value: 'Alice Cooper',
      },
      {
        id: 'btn_disabled',
        role: 'button',
        label: 'Disabled Action',
        selector: '#disabled_btn',
        bbox: [100, 300, 120, 40],
        center: [160, 320],
        state: 'disabled',
      },
    ];

    const detections = exportObservationDetections(elements, {
      viewport_width: 1920,
      viewport_height: 1080,
      depth_estimate: 1.5,
    });

    expect(detections.length).toBe(3);

    // Verify first detection
    const d0 = detections[0];
    expect(d0.label).toBe('Submit Order');
    expect(d0.class_name).toBe('button');
    expect(d0.confidence).toBe(0.95);
    expect(d0.bounding_box_2d).toEqual({
      x: 100,
      y: 200,
      width: 150,
      height: 50,
    });
    expect(d0.estimated_position).toBeDefined();
    expect(typeof d0.estimated_position!.x).toBe('number');
    expect(typeof d0.estimated_position!.y).toBe('number');
    expect(d0.estimated_position!.z).toBe(1.5);
    expect(d0.attributes).toEqual({
      id: 'btn_submit',
      selector: '#btn_submit',
      role: 'button',
      state: 'enabled',
      value: undefined,
    });

    // Verify disabled element gets lower confidence
    const d2 = detections[2];
    expect(d2.confidence).toBe(0.7);
    expect(d2.attributes?.state).toBe('disabled');
  });

  it('normalizes estimated 3D position into [-1, 1] range based on viewport dimensions', () => {
    const centerElement: GroundedElement = {
      id: 'center_elem',
      role: 'button',
      label: 'Center',
      selector: '#center',
      bbox: [910, 490, 100, 100],
      center: [960, 540], // exact middle of 1920x1080
    };

    const detections = exportObservationDetections([centerElement], {
      viewport_width: 1920,
      viewport_height: 1080,
    });

    expect(detections[0].estimated_position!.x).toBe(0);
    expect(detections[0].estimated_position!.y).toBe(0);
    expect(detections[0].estimated_position!.z).toBe(1.0);
  });
});
