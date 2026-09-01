import {
    buildLaunchRiskAlertMessage,
    formatRiskLevel,
    normalizeRiskLevel,
} from '../templates';

describe('normalizeRiskLevel', () => {
    it('accepts the upper case values epic.risk_level actually stores', () => {
        expect(normalizeRiskLevel('HIGH')).toBe('HIGH');
        expect(normalizeRiskLevel('MEDIUM')).toBe('MEDIUM');
        expect(normalizeRiskLevel('LOW')).toBe('LOW');
    });

    it('still accepts the title case the admin preview passes', () => {
        expect(normalizeRiskLevel('High')).toBe('HIGH');
        expect(normalizeRiskLevel('Medium')).toBe('MEDIUM');
    });

    it('returns null rather than silently falling back to low', () => {
        expect(normalizeRiskLevel(null)).toBeNull();
        expect(normalizeRiskLevel(undefined)).toBeNull();
        expect(normalizeRiskLevel('')).toBeNull();
        expect(normalizeRiskLevel('catastrophic')).toBeNull();
    });
});

describe('formatRiskLevel', () => {
    it('renders stored values as prose instead of screaming enums', () => {
        expect(formatRiskLevel('HIGH')).toBe('High');
        expect(formatRiskLevel('LOW')).toBe('Low');
    });

    it('names the absence rather than printing null', () => {
        expect(formatRiskLevel(null)).toBe('Not set');
    });
});

describe('buildLaunchRiskAlertMessage', () => {
    const base = {
        launch_name: 'Mobile App v2',
        launch_id: 'E1',
        tier: 'TIER_1',
        readiness_score: 0.65,
        days_to_launch: 7,
        gate_blockers: 3,
        owner_name: 'Dana Reed',
    };

    it('renders a stored HIGH risk as high, not low', () => {
        const { text } = buildLaunchRiskAlertMessage({ ...base, risk_level: 'HIGH' });
        expect(text).toContain('High Risk Alert');
        expect(text).not.toContain('🟢');
    });

    it('does not call a medium-risk alert a high risk alert', () => {
        const { text } = buildLaunchRiskAlertMessage({ ...base, risk_level: 'MEDIUM' });
        expect(text).toContain('Medium Risk Alert');
    });

    it('reaches the same verdict for either casing', () => {
        const upper = buildLaunchRiskAlertMessage({ ...base, risk_level: 'HIGH' });
        const title = buildLaunchRiskAlertMessage({ ...base, risk_level: 'High' });
        expect(upper.text).toBe(title.text);
    });

    it('names the launch and owner it was given', () => {
        const { blocks } = buildLaunchRiskAlertMessage({ ...base, risk_level: 'HIGH' });
        const rendered = JSON.stringify(blocks);
        expect(rendered).toContain('Mobile App v2');
        expect(rendered).toContain('Dana Reed');
        expect(rendered).not.toContain('undefined');
    });
});
