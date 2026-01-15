"use client";

import { useState } from "react";
import { useSettings } from "@/contexts/SettingsContext";
import EmailTemplatesSection from "@/components/admin/settings/EmailTemplatesSection";
import { Modal } from "@mantine/core";

export default function EmailTemplatesPage() {
    const {
        emailTemplates,
        setEmailTemplates,
        emailTemplatesLoading,
        emailTemplatesSaving,
    } = useSettings();

    const [activeTemplateType, setActiveTemplateType] = useState<"invite" | "remind" | "update_criteria">("invite");
    const [previewOpen, setPreviewOpen] = useState(false);
    const [previewType, setPreviewType] = useState<"invite" | "remind" | "update_criteria">("invite");

    return (
        <>
            <EmailTemplatesSection
                emailTemplates={emailTemplates}
                setEmailTemplates={setEmailTemplates}
                loading={emailTemplatesLoading}
                saving={emailTemplatesSaving}
                activeTemplateType={activeTemplateType}
                setActiveTemplateType={setActiveTemplateType}
                previewOpen={previewOpen}
                setPreviewOpen={setPreviewOpen}
                previewType={previewType}
                setPreviewType={setPreviewType}
            />
            <Modal
                opened={previewOpen}
                onClose={() => setPreviewOpen(false)}
                title={`Email Preview - ${previewType === "invite" ? "Invite"
                    : previewType === "remind" ? "Reminder"
                        : "Update Criteria"
                    }`}
                size="xl"
            >
                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            Subject Line
                        </label>
                        <div className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm">
                            {previewType === "invite"
                                ? (emailTemplates.invite_subject || "Welcome to ClearGO")
                                : previewType === "remind"
                                    ? (emailTemplates.remind_subject || "Reminder: Join ClearGO")
                                    : (emailTemplates.update_criteria_subject || "Action Required: Update Criteria in ClearGO")
                            }
                        </div>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            Email Preview
                        </label>
                        <div className="border border-gray-300 rounded-lg overflow-hidden">
                            <div
                                className="bg-white p-4"
                                dangerouslySetInnerHTML={{
                                    __html: (() => {
                                        const html = previewType === "invite"
                                            ? emailTemplates.invite_html
                                            : previewType === "remind"
                                                ? emailTemplates.remind_html
                                                : emailTemplates.update_criteria_html;

                                        if (!html) {
                                            return previewType === "invite"
                                                ? `<div style="font-family: 'Public Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                                                    <h2 style="font-family: 'Atkinson Hyperlegible', sans-serif; color: #1f2937; margin-bottom: 20px;">Hi John,</h2>
                                                    <p style="color: #4b5563; line-height: 1.6; margin-bottom: 20px;">
                                                        You've been invited to join ClearGO. Click the button below to get started.
                                                    </p>
                                                </div>`
                                                : previewType === "remind"
                                                    ? `<div style="font-family: 'Public Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                                                        <h2 style="font-family: 'Atkinson Hyperlegible', sans-serif; color: #1f2937; margin-bottom: 20px;">Hi John,</h2>
                                                        <p style="color: #4b5563; line-height: 1.6; margin-bottom: 20px;">
                                                            This is a reminder that you have an invitation to join ClearGO. Click the button below to accept your invitation.
                                                        </p>
                                                    </div>`
                                                    : `<div style="font-family: 'Public Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                                                        <h2 style="font-family: 'Atkinson Hyperlegible', sans-serif; color: #1f2937; margin-bottom: 20px;">Hi John,</h2>
                                                        <p style="color: #4b5563; line-height: 1.6; margin-bottom: 20px;">
                                                            You have criteria that require your attention in ClearGO. Please review and update as needed.
                                                        </p>
                                                    </div>`;
                                        }

                                        return html
                                            .replace(/\{\{firstName\}\}/g, "John")
                                            .replace(/\{\{greeting\}\}/g, "Hi John,")
                                            .replace(/\{\{inviteLink\}\}/g, "https://example.com/invite-link")
                                            .replace(/\{\{actionLink\}\}/g, "https://example.com/action-link");
                                    })()
                                }}
                            />
                        </div>
                    </div>
                    <div className="text-xs text-gray-500 bg-gray-50 p-3 rounded-lg">
                        <strong>Note:</strong> This preview uses sample data (firstName: "John", inviteLink: "https://example.com/invite-link"). Actual emails will use real recipient data.
                    </div>
                </div>
            </Modal>
        </>
    );
}
