import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { logger } from '../logger.js';

export function registerAllPrompts(server: McpServer): void {
  logger.info('Registering MCP standard prompts...');

  // 1. Prompt: analyze-ui-state
  server.registerPrompt(
    'analyze-ui-state',
    {
      title: 'Analyze UI State',
      description:
        'Prompt for analyzing screen layout, key components, and actionable elements from a visual state record.',
      argsSchema: {
        state_id: z.string().describe('Visual state ID to analyze and summarize'),
      },
    },
    (args) => {
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
  server.registerPrompt(
    'diagnose-visual-regression',
    {
      title: 'Diagnose Visual Regression',
      description:
        'Prompt for diagnosing visual differences between two snapshot checkpoints or visual states.',
      argsSchema: {
        baseline_snapshot: z.string().describe('Name or ID of the baseline snapshot'),
        current_snapshot: z.string().describe('Name or ID of the current snapshot'),
      },
    },
    (args) => {
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
  server.registerPrompt(
    'navigate-to-goal',
    {
      title: 'Navigate to Goal UI State',
      description:
        'Prompt for finding and executing the optimal sequence of actions to reach a target visual state or goal.',
      argsSchema: {
        current_state_id: z.string().describe('Current active visual state ID'),
        goal_description: z.string().describe('Target goal description or desired outcome'),
      },
    },
    (args) => {
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
