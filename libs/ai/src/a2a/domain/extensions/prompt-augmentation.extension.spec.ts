import { TaskState } from '@a2a-js/sdk';

import { A2aWire } from '../../testing/a2a-wire';
import { A2aPart } from '../a2a-part';
import { PromptAugmentationExtension } from './prompt-augmentation.extension';

const augmentation = new PromptAugmentationExtension();
const instructions = augmentation.encode({
  type: 'prompt-augmentation',
  instructions: 'Responda em inglês.',
});

describe('PromptAugmentationExtension', () => {
  it('hands the caller’s instructions to the turn', () => {
    const request = A2aWire.requestContext(
      A2aWire.activated([augmentation.uri]),
      {
        userMessage: A2aWire.message([instructions]),
      },
    );

    expect(augmentation.instructionsFor(request)).toBe('Responda em inglês.');
  });

  it('keeps the instructions of the task a turn resumes', () => {
    const request = A2aWire.requestContext(
      A2aWire.activated([augmentation.uri]),
      {
        userMessage: A2aWire.message([A2aPart.text('ok')]),
        task: {
          status: {
            state: TaskState.TASK_STATE_INPUT_REQUIRED,
            message: A2aWire.message([instructions]),
          },
        } as never,
      },
    );

    expect(augmentation.instructionsFor(request)).toBe('Responda em inglês.');
  });

  it('ignores instructions from a caller that did not negotiate them', () => {
    const request = A2aWire.requestContext(A2aWire.activated([]), {
      userMessage: A2aWire.message([instructions]),
    });

    expect(augmentation.instructionsFor(request)).toBe('');
  });
});
