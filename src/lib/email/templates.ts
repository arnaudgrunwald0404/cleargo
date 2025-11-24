export function getLaunchStatusChangeEmail(
    launchName: string,
    oldStatus: string,
    newStatus: string,
    launchUrl: string
) {
    return {
        subject: `[Launch Console] Status Change: ${launchName}`,
        html: `
            <h2>Launch Status Changed</h2>
            <p>The readiness status for <strong>${launchName}</strong> has changed.</p>
            <ul>
                <li><strong>Old Status:</strong> ${oldStatus}</li>
                <li><strong>New Status:</strong> ${newStatus}</li>
            </ul>
            <p><a href="${launchUrl}">View Launch</a></p>
        `
    };
}

export function getRiskAlertEmail(
    launchName: string,
    riskLevel: string,
    reason: string,
    launchUrl: string
) {
    return {
        subject: `[Launch Console] Risk Alert: ${launchName}`,
        html: `
            <h2 style="color: red;">High Risk Alert</h2>
            <p>The risk level for <strong>${launchName}</strong> is now <strong>${riskLevel}</strong>.</p>
            <p><strong>Reason:</strong> ${reason}</p>
            <p><a href="${launchUrl}">View Launch</a></p>
        `
    };
}
