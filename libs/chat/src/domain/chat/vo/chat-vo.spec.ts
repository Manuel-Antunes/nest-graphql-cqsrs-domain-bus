import { CHAT_TITLE_MAX_LENGTH } from '../schemas/chat-title.schema';
import { AgentId } from './agent-id';
import { ChatId } from './chat-id';
import { ChatTitle } from './chat-title';

describe('a chat’s value objects', () => {
  describe('ChatTitle.summarizing', () => {
    it('is the question on one line', () => {
      expect(
        ChatTitle.summarizing('  Who am I\n on the   platform? ')?.value,
      ).toBe('Who am I on the platform?');
    });

    it('cuts a long question to the title’s length, and says it was cut', () => {
      const title = ChatTitle.summarizing('word '.repeat(40));

      expect(title?.value).toHaveLength(CHAT_TITLE_MAX_LENGTH);
      expect(title?.value.endsWith('word…')).toBe(true);
    });

    it('is no title for a question with nothing in it', () => {
      expect(ChatTitle.summarizing(' \n\t ')).toBeNull();
    });
  });

  it('refuses a title longer than the column', () => {
    expect(
      ChatTitle.safeParse('x'.repeat(CHAT_TITLE_MAX_LENGTH + 1)).success,
    ).toBe(false);
  });

  it('names an agent in lowercase letters, digits and dashes', () => {
    expect(AgentId.safeParse('posts-manager').success).toBe(true);
    expect(AgentId.safeParse('Theo').success).toBe(false);
    expect(AgentId.safeParse('theo agent').success).toBe(false);
    expect(AgentId.safeParse('').success).toBe(false);
  });

  it('is a thread id only when it is a UUID', () => {
    expect(
      ChatId.safeParse('6d1f2a3b-4c5d-4e6f-8a7b-9c0d1e2f3a4b').success,
    ).toBe(true);
    expect(ChatId.safeParse('thread-1').success).toBe(false);
  });
});
