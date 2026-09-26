import { CALENDAR_EVENT_TITLE_MAX_LENGTH } from '../schemas/calendar-event-title.schema';
import { CalendarEventColor } from './calendar-event-color';
import { CalendarEventDescription } from './calendar-event-description';
import { CalendarEventDetails } from './calendar-event-details';
import { CalendarEventId } from './calendar-event-id';
import { CalendarEventTitle } from './calendar-event-title';
import { CalendarEventWindow } from './calendar-event-window';

describe('the value objects of a CalendarEvent', () => {
  describe('CalendarEventId', () => {
    it('generates a new uuid every time, and refuses anything that is not one', () => {
      const id = CalendarEventId.generate();

      expect(CalendarEventId.safeParse(id.value).success).toBe(true);
      expect(id.equals(CalendarEventId.generate())).toBe(false);
      expect(CalendarEventId.safeParse('event:1').success).toBe(false);
    });
  });

  describe('CalendarEventTitle', () => {
    it('trims, refuses the blank and respects the column', () => {
      expect(CalendarEventTitle.parse('  Planning  ').value).toBe('Planning');
      expect(() => CalendarEventTitle.parse('   ')).toThrow(
        /title must not be empty/,
      );
      expect(() =>
        CalendarEventTitle.parse(
          'x'.repeat(CALENDAR_EVENT_TITLE_MAX_LENGTH + 1),
        ),
      ).toThrow(
        new RegExp(
          `title exceeds ${CALENDAR_EVENT_TITLE_MAX_LENGTH} characters`,
        ),
      );
    });
  });

  describe('CalendarEventDescription', () => {
    it('trims and refuses the blank: no description is null, not an empty string', () => {
      expect(CalendarEventDescription.parse('  agenda  ').value).toBe('agenda');
      expect(CalendarEventDescription.safeParse('  ').success).toBe(false);
    });
  });

  describe('CalendarEventColor', () => {
    it('normalizes the case and accepts only the palette', () => {
      expect(CalendarEventColor.parse(' Purple ').value).toBe('purple');
      expect(() => CalendarEventColor.parse('magenta')).toThrow(
        /color must be one of blue, green, red, yellow, purple, orange, gray/,
      );
    });

    it('is blue when nobody chose one', () => {
      expect(CalendarEventColor.standard().value).toBe('blue');
    });
  });

  describe('CalendarEventWindow', () => {
    const nine = new Date('2026-10-01T09:00:00.000Z');
    const ten = new Date('2026-10-01T10:00:00.000Z');
    const eleven = new Date('2026-10-01T11:00:00.000Z');

    it('refuses to end before it starts, and takes a window of no length', () => {
      expect(() => CalendarEventWindow.between(ten, nine)).toThrow(
        /endDate cannot precede startDate/,
      );
      expect(CalendarEventWindow.between(nine, nine).endDate).toEqual(nine);
    });

    it('is equal to another window over the same instants', () => {
      expect(
        CalendarEventWindow.between(nine, ten).equals(
          CalendarEventWindow.between(new Date(nine), new Date(ten)),
        ),
      ).toBe(true);
      expect(
        CalendarEventWindow.between(nine, ten).equals(
          CalendarEventWindow.between(nine, eleven),
        ),
      ).toBe(false);
    });

    it('reschedules one side and keeps the other, into a window of its own', () => {
      const window = CalendarEventWindow.between(nine, ten);

      const longer = window.rescheduledTo({ endDate: eleven });

      expect(longer).toBeInstanceOf(CalendarEventWindow);
      expect(longer).toMatchObject({ startDate: nine, endDate: eleven });
      expect(window.endDate).toEqual(ten);
      expect(() => window.rescheduledTo({ startDate: eleven })).toThrow(
        /endDate cannot precede startDate/,
      );
    });
  });

  describe('CalendarEventDetails', () => {
    it('is blue and has no description when nobody chose them', () => {
      const details = CalendarEventDetails.parse({ title: ' Planning ' });

      expect(details.title.value).toBe('Planning');
      expect(details.description).toBeNull();
      expect(details.color.equals(CalendarEventColor.standard())).toBe(true);
    });

    it('refuses a blank title and a color outside the palette', () => {
      expect(() => CalendarEventDetails.parse({ title: '  ' })).toThrow(
        /title must not be empty/,
      );
      expect(() =>
        CalendarEventDetails.parse({ title: 'Planning', color: 'magenta' }),
      ).toThrow(/color must be one of/);
    });

    it('keeps what a revision leaves out, and loses the description only to a null', () => {
      const details = CalendarEventDetails.parse({
        title: 'Planning',
        description: 'agenda',
        color: 'green',
      });

      const retitled = details.revisedWith({
        title: CalendarEventTitle.parse('Retro'),
      });

      expect(details.revisedWith({}).equals(details)).toBe(true);
      expect(retitled.title.value).toBe('Retro');
      expect(retitled.description?.value).toBe('agenda');
      expect(retitled.color.value).toBe('green');
      expect(details.revisedWith({ description: null }).description).toBeNull();
    });
  });
});
