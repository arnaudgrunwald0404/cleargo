import { pickNextMatchingEvent, type CalendarEvent } from '../calendar';

describe('pickNextMatchingEvent', () => {
    const papricoEvent: CalendarEvent = {
        id: '1',
        summary: 'PaPriCo - Monthly Packaging & Pricing Committee',
        status: 'confirmed',
        start: { dateTime: '2026-09-29T10:00:00-07:00' },
        end: { dateTime: '2026-09-29T11:00:00-07:00' },
    };

    it('returns the first event whose title contains the query, with duration', () => {
        const result = pickNextMatchingEvent([papricoEvent], 'PaPriCo');
        expect(result).toEqual({
            summary: 'PaPriCo - Monthly Packaging & Pricing Committee',
            start: '2026-09-29T10:00:00-07:00',
            all_day: false,
            duration_minutes: 60,
        });
    });

    it('matches case-insensitively', () => {
        expect(pickNextMatchingEvent([papricoEvent], 'paprico')).not.toBeNull();
    });

    it('skips events that only match outside the title (q matches descriptions too)', () => {
        const events: CalendarEvent[] = [
            {
                summary: 'Exec staff',
                status: 'confirmed',
                start: { dateTime: '2026-09-22T09:00:00-07:00' },
                end: { dateTime: '2026-09-22T10:00:00-07:00' },
            },
            papricoEvent,
        ];
        expect(pickNextMatchingEvent(events, 'PaPriCo')?.summary).toContain('PaPriCo');
    });

    it('skips cancelled events', () => {
        const cancelled: CalendarEvent = { ...papricoEvent, status: 'cancelled' };
        expect(pickNextMatchingEvent([cancelled], 'PaPriCo')).toBeNull();
        expect(pickNextMatchingEvent([cancelled, papricoEvent], 'PaPriCo')).not.toBeNull();
    });

    it('handles all-day events with no duration', () => {
        const allDay: CalendarEvent = {
            summary: 'PaPriCo offsite',
            status: 'confirmed',
            start: { date: '2026-10-05' },
            end: { date: '2026-10-06' },
        };
        expect(pickNextMatchingEvent([allDay], 'PaPriCo')).toEqual({
            summary: 'PaPriCo offsite',
            start: '2026-10-05',
            all_day: true,
            duration_minutes: null,
        });
    });

    it('returns null when nothing matches or the event has no start', () => {
        expect(pickNextMatchingEvent([], 'PaPriCo')).toBeNull();
        expect(pickNextMatchingEvent([{ summary: 'PaPriCo', status: 'confirmed' }], 'PaPriCo')).toBeNull();
        expect(pickNextMatchingEvent([{ summary: 'Board meeting', status: 'confirmed', start: { date: '2026-10-01' } }], 'PaPriCo')).toBeNull();
    });
});
