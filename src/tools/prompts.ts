import { logger } from '../logger.js';

export function registerAllPrompts(server: any): void {
  logger.info('Registering MCP standard prompts...');

  const registerPrompt = (
    name: string,
    metadata: { title: string; description: string; argsSchema?: Record<string, any> },
    handler: (args: any, extra?: { signal?: AbortSignal }) => Promise<any> | any
  ) => {
    if (typeof server.registerPrompt === 'function') {
      server.registerPrompt(name, metadata, handler);
    } else if (typeof server.prompt === 'function') {
      server.prompt(name, metadata.description, metadata.argsSchema || {}, handler);
    }
  };

  // 1. Prompt: analyze-ui-state
  registerPrompt(
    'analyze-ui-state',
    {
      title: 'Analyze UI State',
      description:
        'Prompt for analyzing screen layout, key components, and actionable elements from a visual state record.',
      argsSchema: {
        properties: {
          state_id: { type: 'string', description: 'Visual state ID to analyze and summarize' },
        },
        required: ['state_id'],
      },
    },
    (args: any) => {
      return {
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text: `Retrieve and inspect visual state record "${args.state_id}". Analyze its layout structure, active form inputs, interactive buttons, error alerts, and identify the primary action required for an agent operating on this screen.`,
            },
          },
        ],
      };
    }
  );

  // 2. Prompt: diagnose-visual-regression
  registerPrompt(
    'diagnose-visual-regression',
    {
      title: 'Diagnose Visual Regression',
      description:
        'Prompt for diagnosing visual differences between two snapshot checkpoints or visual states.',
      argsSchema: {
        properties: {
          baseline_snapshot: { type: 'string', description: 'Name or ID of the baseline snapshot' },
          current_snapshot: { type: 'string', description: 'Name or ID of the current snapshot' },
        },
        required: ['baseline_snapshot', 'current_snapshot'],
      },
    },
    (args: any) => {
      return {
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text: `Compare baseline snapshot "${args.baseline_snapshot}" against current snapshot "${args.current_snapshot}". Identify layout shifts, missing UI elements, unexpected color or component changes, and assess whether any breaking visual regression occurred.`,
            },
          },
        ],
      };
    }
  );

  // 3. Prompt: navigate-to-goal
  registerPrompt(
    'navigate-to-goal',
    {
      title: 'Navigate to Goal UI State',
      description:
        'Prompt for finding and executing the optimal sequence of actions to reach a target visual state or goal.',
      argsSchema: {
        properties: {
          current_state_id: { type: 'string', description: 'Current active visual state ID' },
          goal_description: {
            type: 'string',
            description: 'Target goal description or desired outcome',
          },
        },
        required: ['current_state_id', 'goal_description'],
      },
    },
    (args: any) => {
      return {
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text: `Starting from visual state "${args.current_state_id}", find the highest-probability navigation path to achieve goal: "${args.goal_description}". List each step with required action type, target UI element, and expected outcome.`,
            },
          },
        ],
      };
    }
  );
}
