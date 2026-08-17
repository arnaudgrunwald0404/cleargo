import {
    evaluateNotificationCalendar,
    getFirstBusinessDayOfWeekYmd,
    getHolidayName,
    getNonBusinessDayReason,
    getObservedUsHolidays,
    isBusinessDayYmd,
    isWeekendYmd,
} from '@/lib/business-calendar';

describe('business-calendar', () => {
    const originalExtras = process.env.EXTRA_NOTIFICATION_HOLIDAYS;

    afterEach(() => {
        if (originalExtras === undefined) delete process.env.EXTRA_NOTIFICATION_HOLIDAYS;
        else process.env.EXTRA_NOTIFICATION_HOLIDAYS = originalExtras;
    });

    describe('weekends', () => {
        it('flags Saturday and Sunday', () => {
            expect(isWeekendYmd('2026-08-15')).toBe(true); // Saturday
            expect(isWeekendYmd('2026-08-16')).toBe(true); // Sunday
            expect(isWeekendYmd('2026-08-17')).toBe(false); // Monday
        });

        it('reports the weekend day name', () => {
            expect(getNonBusinessDayReason('2026-08-15')).toEqual({
                kind: 'weekend',
                label: 'weekend (Saturday)',
            });
        });
    });

    describe('observed US holidays', () => {
        it('places the 2026 floating holidays on the right weekday', () => {
            const holidays = getObservedUsHolidays(2026);
            expect(holidays.get('2026-01-19')).toBe('Martin Luther King Jr. Day');
            expect(holidays.get('2026-02-16')).toBe("Presidents' Day");
            expect(holidays.get('2026-05-25')).toBe('Memorial Day');
            expect(holidays.get('2026-09-07')).toBe('Labor Day');
            expect(holidays.get('2026-11-26')).toBe('Thanksgiving Day');
        });

        it('keeps weekday fixed-date holidays unshifted', () => {
            const holidays = getObservedUsHolidays(2026);
            expect(holidays.get('2026-01-01')).toBe("New Year's Day"); // Thursday
            expect(holidays.get('2026-06-19')).toBe('Juneteenth'); // Friday
            expect(holidays.get('2026-12-25')).toBe('Christmas Day'); // Friday
        });

        it('treats Columbus Day and Veterans Day as normal working days', () => {
            expect(getHolidayName('2026-10-12')).toBeNull(); // Columbus Day, a Monday
            expect(getHolidayName('2026-11-11')).toBeNull(); // Veterans Day, a Wednesday
            expect(isBusinessDayYmd('2026-10-12')).toBe(true);
            expect(isBusinessDayYmd('2026-11-11')).toBe(true);
            expect(getFirstBusinessDayOfWeekYmd('2026-10-14')).toBe('2026-10-12');
        });

        it('observes a Saturday holiday on the Friday before', () => {
            // July 4, 2026 is a Saturday
            expect(getHolidayName('2026-07-03')).toBe('Independence Day (observed)');
            expect(getHolidayName('2026-07-04')).toBeNull();
        });

        it('shifts a Saturday Juneteenth to the Friday before', () => {
            // June 19, 2027 is a Saturday
            expect(getHolidayName('2027-06-18')).toBe('Juneteenth (observed)');
            expect(isBusinessDayYmd('2027-06-18')).toBe(false);
        });

        it('observes a Sunday holiday on the Monday after', () => {
            // July 4, 2027 is a Sunday
            expect(getHolidayName('2027-07-05')).toBe('Independence Day (observed)');
        });

        it("rolls a Saturday New Year's Day back to Dec 31 of the prior year", () => {
            // Jan 1, 2028 is a Saturday
            expect(getHolidayName('2027-12-31')).toBe("New Year's Day (observed)");
        });

        it('treats holidays as non-business days', () => {
            expect(isBusinessDayYmd('2026-05-25')).toBe(false);
            expect(getNonBusinessDayReason('2026-05-25')).toEqual({
                kind: 'holiday',
                label: 'US holiday (Memorial Day)',
            });
            expect(isBusinessDayYmd('2026-08-17')).toBe(true);
        });
    });

    describe('EXTRA_NOTIFICATION_HOLIDAYS', () => {
        it('honors company closures with and without labels', () => {
            process.env.EXTRA_NOTIFICATION_HOLIDAYS = '2026-11-27:Day after Thanksgiving, 2026-12-24';
            expect(getHolidayName('2026-11-27')).toBe('Day after Thanksgiving');
            expect(getHolidayName('2026-12-24')).toBe('company holiday');
            expect(isBusinessDayYmd('2026-11-27')).toBe(false);
        });

        it('ignores malformed entries', () => {
            process.env.EXTRA_NOTIFICATION_HOLIDAYS = 'not-a-date,,2026-13';
            expect(isBusinessDayYmd('2026-08-17')).toBe(true);
        });
    });

    describe('getFirstBusinessDayOfWeekYmd', () => {
        it('returns Monday for an ordinary week', () => {
            expect(getFirstBusinessDayOfWeekYmd('2026-08-19')).toBe('2026-08-17');
        });

        it('slides past a holiday Monday', () => {
            // Memorial Day week
            expect(getFirstBusinessDayOfWeekYmd('2026-05-25')).toBe('2026-05-26');
            expect(getFirstBusinessDayOfWeekYmd('2026-05-29')).toBe('2026-05-26');
        });

        it('anchors weekend dates to the Monday-based week', () => {
            expect(getFirstBusinessDayOfWeekYmd('2026-08-16')).toBe('2026-08-10'); // Sunday
            expect(getFirstBusinessDayOfWeekYmd('2026-08-15')).toBe('2026-08-10'); // Saturday
        });
    });

    describe('evaluateNotificationCalendar', () => {
        it('blocks daily sends on weekends and holidays', () => {
            expect(evaluateNotificationCalendar('2026-08-15')).toEqual({
                send: false,
                reason: 'weekend (Saturday)',
            });
            expect(evaluateNotificationCalendar('2026-05-25')).toEqual({
                send: false,
                reason: 'US holiday (Memorial Day)',
            });
        });

        it('allows daily sends on business days', () => {
            expect(evaluateNotificationCalendar('2026-08-17')).toEqual({ send: true });
            expect(evaluateNotificationCalendar('2026-08-20', 'daily')).toEqual({ send: true });
        });

        it('limits weekly sends to the first business day of the week', () => {
            expect(evaluateNotificationCalendar('2026-08-17', 'weekly')).toEqual({ send: true });
            expect(evaluateNotificationCalendar('2026-08-18', 'weekly')).toEqual({
                send: false,
                reason: 'not the first business day of the week (sent 2026-08-17)',
            });
        });

        it('defers a weekly send to Tuesday when Monday is a holiday', () => {
            expect(evaluateNotificationCalendar('2026-05-25', 'weekly')).toEqual({
                send: false,
                reason: 'US holiday (Memorial Day)',
            });
            expect(evaluateNotificationCalendar('2026-05-26', 'weekly')).toEqual({ send: true });
        });
    });
});
