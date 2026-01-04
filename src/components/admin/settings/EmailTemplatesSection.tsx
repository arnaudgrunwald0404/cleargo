"use client";
import React from "react";
import { Modal } from "@mantine/core";
import { IconMail } from "@tabler/icons-react";
import { PurpleLoader } from '../../PurpleLoader';

export type TemplateType = "invite" | "remind" | "update_criteria";

export type EmailTemplates = {
  invite_subject: string;
  invite_html: string;
  remind_subject: string;
  remind_html: string;
  update_criteria_subject: string;
  update_criteria_html: string;
};

type Props = {
  emailTemplates: EmailTemplates;
  setEmailTemplates: React.Dispatch<React.SetStateAction<EmailTemplates>>;
  loading: boolean;
  saving: boolean;
  activeTemplateType: TemplateType;
  setActiveTemplateType: (t: TemplateType) => void;
  previewOpen: boolean;
  setPreviewOpen: (open: boolean) => void;
  previewType: TemplateType;
  setPreviewType: (t: TemplateType) => void;
};

export default function EmailTemplatesSection({
  emailTemplates,
  setEmailTemplates,
  loading,
  saving,
  activeTemplateType,
  setActiveTemplateType,
  previewOpen,
  setPreviewOpen,
  previewType,
  setPreviewType,
}: Props) {
  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-pink-500 rounded-lg flex items-center justify-center">
            <IconMail className="w-6 h-6 text-white" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Email Templates</h2>
            <p className="text-sm text-gray-500">Customize email templates for different notification types</p>
          </div>
        </div>

        {loading ? (
          <div className="text-center py-8 text-gray-500 flex items-center justify-center gap-2">
            <PurpleLoader size="sm" />
            <span>Loading templates...</span>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="border-b border-gray-200">
              <nav className="flex space-x-1" aria-label="Tabs">
                <button
                  onClick={() => setActiveTemplateType("invite")}
                  className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                    activeTemplateType === "invite"
                      ? "border-indigo-500 text-indigo-600"
                      : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                  }`}
                >
                  Invite
                </button>
                <button
                  onClick={() => setActiveTemplateType("remind")}
                  className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                    activeTemplateType === "remind"
                      ? "border-indigo-500 text-indigo-600"
                      : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                  }`}
                >
                  Reminder
                </button>
                <button
                  onClick={() => setActiveTemplateType("update_criteria")}
                  className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                    activeTemplateType === "update_criteria"
                      ? "border-indigo-500 text-indigo-600"
                      : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                  }`}
                >
                  Update Criteria
                </button>
              </nav>
            </div>

            {activeTemplateType === "invite" && (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Subject Line</label>
                  <input
                    type="text"
                    value={emailTemplates.invite_subject}
                    onChange={(e) => setEmailTemplates({ ...emailTemplates, invite_subject: e.target.value })}
                    placeholder="Welcome to ClearGO"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  />
                  <p className="mt-1 text-xs text-gray-500">Leave empty to use default subject</p>
                </div>
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-sm font-medium text-gray-700">HTML Template</label>
                    <button
                      type="button"
                      onClick={() => {
                        setPreviewType("invite");
                        setPreviewOpen(true);
                      }}
                      className="text-sm text-indigo-600 hover:text-indigo-700 font-medium"
                    >
                      Preview
                    </button>
                  </div>
                  <textarea
                    value={emailTemplates.invite_html}
                    onChange={(e) => setEmailTemplates({ ...emailTemplates, invite_html: e.target.value })}
                    placeholder="Leave empty to use default template"
                    rows={16}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent font-mono text-sm"
                  />
                  <p className="mt-1 text-xs text-gray-500">
                    Available placeholders: {"{"}{"{"}firstName{"}"}{"}"}, {"{"}{"{"}greeting{"}"}{"}"}, {"{"}{"{"}inviteLink{"}"}{"}"}
                  </p>
                </div>
              </div>
            )}

            {activeTemplateType === "remind" && (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Subject Line</label>
                  <input
                    type="text"
                    value={emailTemplates.remind_subject}
                    onChange={(e) => setEmailTemplates({ ...emailTemplates, remind_subject: e.target.value })}
                    placeholder="Reminder: Join ClearGO"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  />
                  <p className="mt-1 text-xs text-gray-500">Leave empty to use default subject</p>
                </div>
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-sm font-medium text-gray-700">HTML Template</label>
                    <button
                      type="button"
                      onClick={() => {
                        setPreviewType("remind");
                        setPreviewOpen(true);
                      }}
                      className="text-sm text-indigo-600 hover:text-indigo-700 font-medium"
                    >
                      Preview
                    </button>
                  </div>
                  <textarea
                    value={emailTemplates.remind_html}
                    onChange={(e) => setEmailTemplates({ ...emailTemplates, remind_html: e.target.value })}
                    placeholder="Leave empty to use default template"
                    rows={16}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent font-mono text-sm"
                  />
                  <p className="mt-1 text-xs text-gray-500">
                    Available placeholders: {"{"}{"{"}firstName{"}"}{"}"}, {"{"}{"{"}greeting{"}"}{"}"}, {"{"}{"{"}inviteLink{"}"}{"}"}
                  </p>
                </div>
              </div>
            )}

            {activeTemplateType === "update_criteria" && (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Subject Line</label>
                  <input
                    type="text"
                    value={emailTemplates.update_criteria_subject}
                    onChange={(e) => setEmailTemplates({ ...emailTemplates, update_criteria_subject: e.target.value })}
                    placeholder="Action Required: Update Criteria in ClearGO"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  />
                  <p className="mt-1 text-xs text-gray-500">Leave empty to use default subject</p>
                </div>
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-sm font-medium text-gray-700">HTML Template</label>
                    <button
                      type="button"
                      onClick={() => {
                        setPreviewType("update_criteria");
                        setPreviewOpen(true);
                      }}
                      className="text-sm text-indigo-600 hover:text-indigo-700 font-medium"
                    >
                      Preview
                    </button>
                  </div>
                  <textarea
                    value={emailTemplates.update_criteria_html}
                    onChange={(e) => setEmailTemplates({ ...emailTemplates, update_criteria_html: e.target.value })}
                    placeholder="Leave empty to use default template"
                    rows={16}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent font-mono text-sm"
                  />
                  <p className="mt-1 text-xs text-gray-500">
                    Available placeholders: {"{"}{"{"}firstName{"}"}{"}"}, {"{"}{"{"}greeting{"}"}{"}"}, {"{"}{"{"}actionLink{"}"}{"}"}
                  </p>
                </div>
              </div>
            )}

            <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-200">
              {saving && (
                <span className="text-sm text-gray-500 flex items-center gap-2">
                  <div className="w-4 h-4 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
                  Saving...
                </span>
              )}
              {!saving && loading === false && (
                <span className="text-sm text-green-600">All changes saved</span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Preview Modal */}
      <Modal
        opened={previewOpen}
        onClose={() => setPreviewOpen(false)}
        title={`Email Preview - ${
          previewType === "invite" ? "Invite" : previewType === "remind" ? "Reminder" : "Update Criteria"
        }`}
        size="xl"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Subject Line</label>
            <div className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm">
              {previewType === "invite"
                ? emailTemplates.invite_subject || "Welcome to ClearGO"
                : previewType === "remind"
                ? emailTemplates.remind_subject || "Reminder: Join ClearGO"
                : emailTemplates.update_criteria_subject || "Action Required: Update Criteria in ClearGO"}
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Email Preview</label>
            <div className="border border-gray-300 rounded-lg overflow-hidden">
              <div
                className="bg-white p-4"
                dangerouslySetInnerHTML={{
                  __html: (() => {
                    const html =
                      previewType === "invite"
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
                              <div style="background-color: #f9fafb; border-left: 4px solid #4f46e5; padding: 16px; margin: 24px 0; border-radius: 4px;">
                                  <p style="color: #374151; font-weight: 600; margin-bottom: 12px; font-size: 15px;">What is ClearGO?</p>
                                  <ul style="color: #4b5563; line-height: 1.8; margin: 0; padding-left: 20px;">
                                      <li>Track and manage launch readiness across all your products and initiatives</li>
                                      <li>Collaborate with your team to ensure successful launches with clear criteria and decision gates</li>
                                      <li>Get real-time visibility into launch status, risks, and readiness scores</li>
                                  </ul>
                              </div>
                              <div style="text-align: center; margin: 30px 0;">
                                  <a href="https://example.com/invite-link" style="display: inline-block; background-color: #4f46e5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: 600; transition: background-color 0.2s;">
                                      Accept Invitation
                                  </a>
                              </div>
                              <p style="color: #6b7280; font-size: 14px; line-height: 1.6; margin-top: 30px;">
                                  This link expires in 30 minutes and can be used once. If you didn't request this invitation, you can safely ignore this email.
                              </p>
                              <p style="color: #6b7280; font-size: 14px; line-height: 1.6; margin-top: 10px;">
                                  If the button doesn't work, copy and paste this link into your browser:<br>
                                  <a href="https://example.com/invite-link" style="color: #4f46e5; word-break: break-all;">https://example.com/invite-link</a>
                              </p>
                          </div>`
                        : previewType === "remind"
                        ? `<div style="font-family: 'Public Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                              <h2 style="font-family: 'Atkinson Hyperlegible', sans-serif; color: #1f2937; margin-bottom: 20px;">Hi John,</h2>
                              <p style="color: #4b5563; line-height: 1.6; margin-bottom: 20px;">
                                  This is a reminder that you have an invitation to join ClearGO. Click the button below to accept your invitation.
                              </p>
                              <div style="background-color: #f9fafb; border-left: 4px solid #4f46e5; padding: 16px; margin: 24px 0; border-radius: 4px;">
                                  <p style="color: #374151; font-weight: 600; margin-bottom: 12px; font-size: 15px;">What is ClearGO?</p>
                                  <ul style="color: #4b5563; line-height: 1.8; margin: 0; padding-left: 20px;">
                                      <li>Track and manage launch readiness across all your products and initiatives</li>
                                      <li>Collaborate with your team to ensure successful launches with clear criteria and decision gates</li>
                                      <li>Get real-time visibility into launch status, risks, and readiness scores</li>
                                  </ul>
                              </div>
                              <div style="text-align: center; margin: 30px 0;">
                                  <a href="https://example.com/invite-link" style="display: inline-block; background-color: #4f46e5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: 600; transition: background-color 0.2s;">
                                      Accept Invitation
                                  </a>
                              </div>
                              <p style="color: #6b7280; font-size: 14px; line-height: 1.6; margin-top: 30px;">
                                  This link expires in 30 minutes and can be used once. If you've already joined, you can safely ignore this email.
                              </p>
                              <p style="color: #6b7280; font-size: 14px; line-height: 1.6; margin-top: 10px;">
                                  If the button doesn't work, copy and paste this link into your browser:<br>
                                  <a href="https://example.com/invite-link" style="color: #4f46e5; word-break: break-all;">https://example.com/invite-link</a>
                              </p>
                          </div>`
                        : `<div style="font-family: 'Public Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                              <h2 style="font-family: 'Atkinson Hyperlegible', sans-serif; color: #1f2937; margin-bottom: 20px;">Hi John,</h2>
                              <p style="color: #4b5563; line-height: 1.6; margin-bottom: 20px;">
                                  You have criteria that require your attention in ClearGO. Please review and update as needed.
                              </p>
                              <div style="text-align: center; margin: 30px 0;">
                                  <a href="https://example.com/action-link" style="display: inline-block; background-color: #4f46e5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: 600; transition: background-color 0.2s;">
                                      View Criteria
                                  </a>
                              </div>
                              <p style="color: #6b7280; font-size: 14px; line-height: 1.6; margin-top: 30px;">
                                  If the button doesn't work, copy and paste this link into your browser:<br>
                                  <a href="https://example.com/action-link" style="color: #4f46e5; word-break: break-all;">https://example.com/action-link</a>
                              </p>
                          </div>`;
                    }

                    return html
                      .replace(/\{\{firstName\}\}/g, "John")
                      .replace(/\{\{greeting\}\}/g, "Hi John,")
                      .replace(/\{\{inviteLink\}\}/g, "https://example.com/invite-link")
                      .replace(/\{\{actionLink\}\}/g, "https://example.com/action-link");
                  })(),
                }}
              />
            </div>
          </div>
          <div className="text-xs text-gray-500 bg-gray-50 p-3 rounded-lg">
            <strong>Note:</strong> This preview uses sample data (firstName: "John", inviteLink: "https://example.com/invite-link"). Actual emails will use real recipient data.
          </div>
        </div>
      </Modal>
    </div>
  );
}
