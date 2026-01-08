"use client";
import { PurpleLoader } from '../../PurpleLoader';
import React, { useState, useMemo } from "react";
import { Drawer, Stack, Group, TextInput, MultiSelect, Checkbox, Button } from "@mantine/core";
import { IconTrash, IconMail, IconPencil, IconGripVertical, IconCheck, IconX } from "@tabler/icons-react";
import type { AppSettings } from "@/lib/settings-db";
import { ROLES } from "@/lib/constants/settings";

type User = {
  id: string;
  email: string;
  first_name?: string;
  last_name?: string;
  roles?: string[];
  role?: string;
  is_active?: boolean;
  last_logged_in?: string | null;
  pending?: boolean;
};

type Props = {
  users: User[];
  pendingUsers?: User[];
  loading: boolean;
  onRefresh: () => void;
  editingUserId: string | null;
  setEditingUserId: (id: string | null) => void;
  selectedUserIds: Set<string>;
  setSelectedUserIds: (ids: Set<string>) => void;
  showAddUser: boolean;
  setShowAddUser: (show: boolean) => void;
  bulkImportFile: File | null;
  setBulkImportFile: (file: File | null) => void;
  bulkImportLoading: boolean;
  setBulkImportLoading: (loading: boolean) => void;
  settings: AppSettings;
  setSettings: React.Dispatch<React.SetStateAction<AppSettings | null>>;
  updatePodMapping: (pod: string, userEmail: string | null) => Promise<void>;
  updatePodOrder: (newOrder: string[]) => Promise<void>;
  handleSave: (e: React.FormEvent) => Promise<void>;
  pods: string[];
  podsLoading: boolean;
  saving: boolean;
  domainInput: string;
  setDomainInput: (input: string) => void;
  addDomain: () => void;
  removeDomain: (domain: string) => void;
  activeSubSection?: string;
  draggedPodIndex: number | null;
  setDraggedPodIndex: (index: number | null) => void;
};

export default function UserManagementSection(props: Props) {
  const {
    users,
    pendingUsers = [],
    loading,
    onRefresh,
    editingUserId,
    setEditingUserId,
    selectedUserIds,
    setSelectedUserIds,
    showAddUser,
    setShowAddUser,
    bulkImportFile,
    setBulkImportFile,
    bulkImportLoading,
    setBulkImportLoading,
    settings,
    setSettings,
    updatePodMapping,
    updatePodOrder,
    handleSave,
    pods,
    podsLoading,
    saving,
    domainInput,
    setDomainInput,
    addDomain,
    removeDomain,
    activeSubSection = "users",
    draggedPodIndex,
    setDraggedPodIndex,
  } = props;

  const [newUser, setNewUser] = useState({ email: "", first_name: "", last_name: "", roles: [] as string[], is_active: true });
  const [approvingUserEmail, setApprovingUserEmail] = useState<string | null>(null);
  const [approveRoles, setApproveRoles] = useState<string[]>([]);
  const [approving, setApproving] = useState(false);

  const handleAddUser = async () => {
    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...newUser, roles: newUser.roles.length > 0 ? newUser.roles : ["OTHER"] }),
      });
      if (!res.ok) throw new Error("Failed to create user");
      setNewUser({ email: "", first_name: "", last_name: "", roles: [], is_active: true });
      setShowAddUser(false);
      onRefresh();
    } catch (error: any) {
      alert(`Error: ${error.message}`);
    }
  };

  const handleBulkImport = async () => {
    if (!bulkImportFile) return;
    setBulkImportLoading(true);
    try {
      const formData = new FormData();
      formData.append("file", bulkImportFile);
      const res = await fetch("/api/users/bulk", { method: "POST", body: formData });
      if (!res.ok) throw new Error("Failed to import users");
      const data = await res.json();
      alert(`Successfully imported ${data.created} user(s)`);
      setBulkImportFile(null);
      onRefresh();
    } catch (error: any) {
      alert(`Error: ${error.message}`);
    } finally {
      setBulkImportLoading(false);
    }
  };

  const handleBulkDelete = async () => {
    if (selectedUserIds.size === 0) return;
    if (!confirm(`Delete ${selectedUserIds.size} user(s)?`)) return;
    try {
      const res = await fetch("/api/users/bulk-delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: Array.from(selectedUserIds) }),
      });
      if (!res.ok) throw new Error("Failed to delete users");
      setSelectedUserIds(new Set());
      onRefresh();
    } catch (error: any) {
      alert(`Error: ${error.message}`);
    }
  };

  const handleDeleteUser = async (id: string) => {
    if (!confirm("Delete this user?")) return;
    try {
      const res = await fetch(`/api/users/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete user");
      onRefresh();
    } catch (error: any) {
      alert(`Error: ${error.message}`);
    }
  };

  const handleInviteUser = async (id: string, type: "invite" | "remind" = "invite") => {
    try {
      const res = await fetch(`/api/users/${id}/invite`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type }),
      });
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to send invitation");
      }
      const data = await res.json();
      alert(`Success: ${data.message}`);
    } catch (error: any) {
      alert(`Error: ${error.message}`);
    }
  };

  const handleBulkInvite = async (type: "invite" | "remind" = "invite") => {
    if (selectedUserIds.size === 0) {
      alert("Please select at least one user");
      return;
    }
    if (!confirm(`${type === "invite" ? "Invite" : "Remind"} ${selectedUserIds.size} user(s)?`)) return;
    try {
      const res = await fetch("/api/users/bulk-invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userIds: Array.from(selectedUserIds), type }),
      });
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to send invitations");
      }
      const data = await res.json();
      alert(`Success: ${data.sent} invitation(s) sent${data.failed > 0 ? `, ${data.failed} failed` : ""}`);
    } catch (error: any) {
      alert(`Error: ${error.message}`);
    }
  };

  const handleApproveUser = async () => {
    if (!approvingUserEmail) return;
    if (approveRoles.length === 0) {
      alert("Please select at least one role");
      return;
    }
    setApproving(true);
    try {
      const pendingUser = pendingUsers.find(u => u.email === approvingUserEmail);
      const res = await fetch("/api/users/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: approvingUserEmail,
          first_name: pendingUser?.first_name,
          last_name: pendingUser?.last_name,
          roles: approveRoles,
          is_active: true,
        }),
      });
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to approve user");
      }
      setApprovingUserEmail(null);
      setApproveRoles([]);
      onRefresh();
      alert("User approved successfully! An email has been sent to notify them.");
    } catch (error: any) {
      alert(`Error: ${error.message}`);
    } finally {
      setApproving(false);
    }
  };

  const handleDenyUser = async (email: string) => {
    if (!confirm(`Are you sure you want to deny and delete the access request for ${email}? This action cannot be undone.`)) {
      return;
    }
    try {
      const res = await fetch(`/api/users/pending/${encodeURIComponent(email)}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to deny user");
      }
      onRefresh();
      alert("Access request denied. The user has been removed from the system and an email notification has been sent.");
    } catch (error: any) {
      alert(`Error: ${error.message}`);
    }
  };

  const editingUser = users.find((u) => u.id === editingUserId);

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 bg-gradient-to-br from-green-500 to-emerald-500 rounded-lg flex items-center justify-center">
            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
            </svg>
          </div>
          <div>
            <h2 className="text-lg font-semibold text-gray-900">User Management</h2>
            <p className="text-sm text-gray-500">Manage users, roles, PM mapping, and domains</p>
          </div>
        </div>

        {activeSubSection === "users" && (
          <div>
            {/* Pending Users Section - Only show when there are pending requests */}
            {pendingUsers.length > 0 && (
              <div className="mb-8 p-4 bg-amber-50 border border-amber-200 rounded-lg">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-md font-semibold text-gray-900 flex items-center gap-2">
                      <span className="w-2 h-2 bg-amber-500 rounded-full"></span>
                      Pending Access Requests ({pendingUsers.length})
                    </h3>
                    <p className="text-sm text-gray-600 mt-1">
                      Users waiting for approval
                    </p>
                  </div>
                </div>
                <div className="space-y-2">
                  {pendingUsers.map((pendingUser) => (
                    <div key={pendingUser.id || pendingUser.email} className="flex items-center justify-between p-3 bg-white rounded-lg border border-amber-200">
                      <div className="flex-1">
                        <p className="text-sm font-medium text-gray-900">{pendingUser.email}</p>
                        {pendingUser.last_logged_in && (
                          <p className="text-xs text-gray-500 mt-1">
                            Last logged in: {new Date(pendingUser.last_logged_in).toLocaleDateString()}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleDenyUser(pendingUser.email)}
                          className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium transition-colors flex items-center gap-2"
                          title="Deny and delete access request"
                        >
                          <IconX className="w-4 h-4" />
                          Deny
                        </button>
                        <button
                          onClick={() => {
                            setApprovingUserEmail(pendingUser.email);
                            setApproveRoles([]);
                          }}
                          className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium transition-colors flex items-center gap-2"
                          title="Approve access request"
                        >
                          <IconCheck className="w-4 h-4" />
                          Approve
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="text-md font-semibold text-gray-900">Users</h3>
                <p className="text-sm text-gray-500">Manage users, roles, and permissions</p>
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={() => setShowAddUser(true)} className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-medium transition-colors">
                  Add User
                </button>
                <label className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 font-medium transition-colors cursor-pointer">
                  Import Bulk
                  <input type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(e) => setBulkImportFile(e.target.files?.[0] || null)} />
                </label>
                {selectedUserIds.size > 0 && (
                  <>
                    <button
                      type="button"
                      onClick={() => handleBulkInvite("invite")}
                      className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-medium transition-colors flex items-center gap-2"
                    >
                      <IconMail className="w-4 h-4" />
                      Invite Selected ({selectedUserIds.size})
                    </button>
                    <button type="button" onClick={handleBulkDelete} className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium transition-colors">
                      Delete Selected ({selectedUserIds.size})
                    </button>
                  </>
                )}
              </div>
            </div>

        {bulkImportFile && (
          <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-lg flex items-center justify-between">
            <span className="text-sm text-blue-700">{bulkImportFile.name}</span>
            <div className="flex gap-2">
              <button type="button" onClick={handleBulkImport} disabled={bulkImportLoading} className="px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 disabled:opacity-50">
                {bulkImportLoading ? "Importing..." : "Import"}
              </button>
              <button type="button" onClick={() => setBulkImportFile(null)} className="px-3 py-1 bg-gray-200 text-gray-700 rounded text-sm hover:bg-gray-300">
                Cancel
              </button>
            </div>
          </div>
        )}

        {showAddUser && (
          <div className="mb-6 p-4 bg-gray-50 border border-gray-200 rounded-lg">
            <h3 className="font-medium text-gray-900 mb-4">Add New User</h3>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <input type="email" placeholder="Email *" value={newUser.email} onChange={(e) => setNewUser({ ...newUser, email: e.target.value })} className="px-3 py-2 border border-gray-300 rounded-lg" />
                <MultiSelect
                  data={ROLES as unknown as string[]}
                  value={newUser.roles}
                  onChange={(value) => setNewUser({ ...newUser, roles: value })}
                  placeholder="Select roles"
                  styles={{ input: { minHeight: "calc(2.5rem + 4px)", height: "calc(2.5rem + 4px)", fontSize: "1rem", display: "flex", alignItems: "center" } }}
                  classNames={{ input: "text-base" }}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <input type="text" placeholder="First Name" value={newUser.first_name} onChange={(e) => setNewUser({ ...newUser, first_name: e.target.value })} className="px-3 py-2 border border-gray-300 rounded-lg" />
                <input type="text" placeholder="Last Name" value={newUser.last_name} onChange={(e) => setNewUser({ ...newUser, last_name: e.target.value })} className="px-3 py-2 border border-gray-300 rounded-lg" />
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={handleAddUser} className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700">
                  Add
                </button>
                <button type="button" onClick={() => setShowAddUser(false)} className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300">
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

            {loading ? (
              <div className="text-center py-8 text-gray-500 flex items-center justify-center gap-2">
                <PurpleLoader size="sm" />
                <span>Loading users...</span>
              </div>
            ) : (
              <div className="border-2 border-purple-200 rounded-lg bg-purple-50 overflow-hidden">
                <table className="min-w-full divide-y divide-purple-200 table-fixed">
              <colgroup>
                <col className="w-12" />
                <col className="w-auto" />
                <col className="w-auto" />
                <col className="w-auto" />
                <col className="w-auto" />
                <col className="w-32" />
                <col className="w-40" />
              </colgroup>
              <thead className="bg-purple-100">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-purple-900 w-12">
                    <input
                      type="checkbox"
                      checked={selectedUserIds.size === users.length && users.length > 0}
                      onChange={(e) => {
                        if (e.target.checked) setSelectedUserIds(new Set(users.map((u) => u.id)));
                        else setSelectedUserIds(new Set());
                      }}
                    />
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-purple-900">First Name</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-purple-900">Last Name</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-purple-900">Email</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-purple-900">Roles</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-purple-900 w-32">Last Logged In</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-purple-900 w-40">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-purple-200">
                {users.map((user) => (
                  <tr key={user.id} className="hover:bg-purple-50 transition-colors">
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={selectedUserIds.has(user.id)}
                        onChange={(e) => {
                          const next = new Set(selectedUserIds);
                          if (e.target.checked) next.add(user.id);
                          else next.delete(user.id);
                          setSelectedUserIds(next);
                        }}
                      />
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900">{user.first_name || "—"}</td>
                    <td className="px-4 py-3 text-sm text-gray-900">{user.last_name || "—"}</td>
                    <td className="px-4 py-3 text-sm text-gray-700">{user.email}</td>
                    <td className="px-4 py-3 text-sm">
                      <div className="flex flex-wrap gap-1">
                        {(user.roles || [user.role || "OTHER"]).map((role: string) => (
                          <span key={role} className="px-2 py-1 text-xs bg-blue-100 text-blue-700 rounded">
                            {role}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700 whitespace-nowrap w-32">{user.last_logged_in ? new Date(user.last_logged_in).toLocaleDateString() : "Never"}</td>
                    <td className="px-4 py-3 whitespace-nowrap w-40">
                      <div className="flex justify-end gap-1">
                        {!user.last_logged_in && (
                          <button onClick={() => handleInviteUser(user.id, "invite")} className="p-1.5 rounded hover:bg-blue-50 text-blue-600 transition-colors" title="Invite">
                            <IconMail className="w-4 h-4" />
                          </button>
                        )}
                        <button onClick={() => setEditingUserId(user.id)} className="p-1.5 rounded hover:bg-gray-100 text-gray-600 transition-colors" title="Edit">
                          <IconPencil className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
          </div>
        )}

        {activeSubSection === "pm-mapping" && (
          <div>
            {/* Pod → Product Manager Mapping */}
            <div className="mb-4">
              <h3 className="text-md font-semibold text-gray-900">Pod → Product Manager Mapping</h3>
              <p className="text-sm text-gray-500">Map pod names to product managers for criteria resolution. Drag and drop to reorder pods (this order will be used throughout the app).</p>
            </div>
            <div>
              {podsLoading ? (
                <div className="text-center py-8 text-gray-500">Loading pods...</div>
              ) : pods.length === 0 ? (
                <p className="text-sm text-gray-500 italic">No pods found. Pods will appear here once launches are synced from AHA.</p>
              ) : (
                <PodMappingTable
                  pods={pods}
                  settings={settings}
                  setSettings={setSettings}
                  users={users}
                  updatePodMapping={updatePodMapping}
                  updatePodOrder={updatePodOrder}
                  draggedPodIndex={draggedPodIndex}
                  setDraggedPodIndex={setDraggedPodIndex}
                />
              )}
            </div>
          </div>
        )}

        {activeSubSection === "domains" && (
          <div>
            {/* Allowlisted Domains */}
            <div className="mb-4">
              <h3 className="text-md font-semibold text-gray-900">Allowlisted Domains</h3>
              <p className="text-sm text-gray-500">Email domains permitted to access the application</p>
            </div>
            <div>
              <div className="flex gap-3 mb-4">
                <input
                  type="text"
                  value={domainInput}
                  onChange={(e) => setDomainInput(e.target.value)}
                  placeholder="example.com"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addDomain();
                    }
                  }}
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                />
                <button type="button" onClick={addDomain} className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-medium transition-colors">
                  Add Domain
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {settings.allowlisted_domains.map((domain) => (
                  <span key={domain} className="inline-flex items-center gap-2 bg-gray-100 px-3 py-1.5 rounded-lg border border-gray-200">
                    <span className="text-sm text-gray-700">{domain}</span>
                    <button type="button" onClick={() => removeDomain(domain)} className="text-gray-400 hover:text-red-600 transition-colors">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {editingUser && (
        <EditUserDrawer
          user={editingUser}
          opened={!!editingUserId}
          onClose={() => setEditingUserId(null)}
          onSave={async (patch) => {
            const res = await fetch(`/api/users/${editingUser.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) });
            if (!res.ok) throw new Error("Failed to update");
            setEditingUserId(null);
            onRefresh();
          }}
          onDelete={async () => {
            await handleDeleteUser(editingUser.id);
            setEditingUserId(null);
          }}
        />
      )}

      {approvingUserEmail && (
        <ApproveUserDrawer
          email={approvingUserEmail}
          opened={!!approvingUserEmail}
          onClose={() => {
            setApprovingUserEmail(null);
            setApproveRoles([]);
          }}
          onApprove={handleApproveUser}
          roles={approveRoles}
          setRoles={setApproveRoles}
          approving={approving}
        />
      )}
    </div>
  );
}

function ApproveUserDrawer({
  email,
  opened,
  onClose,
  onApprove,
  roles,
  setRoles,
  approving,
}: {
  email: string;
  opened: boolean;
  onClose: () => void;
  onApprove: () => void;
  roles: string[];
  setRoles: (roles: string[]) => void;
  approving: boolean;
}) {
  return (
    <Drawer opened={opened} onClose={onClose} title="Approve User Access" position="right" size="xl" padding="lg">
      <Stack gap="md">
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <p className="text-sm text-green-800">
            <strong>Email:</strong> {email}
          </p>
          <p className="text-sm text-green-700 mt-2">
            This user has requested access to ClearGO. Select their roles below and approve to grant access. An email will be sent to notify them.
          </p>
        </div>
        <MultiSelect
          label="Roles *"
          description="Select one or more roles for this user"
          data={ROLES as unknown as string[]}
          value={roles}
          onChange={(value) => setRoles(value)}
          placeholder="Select roles"
          required
          styles={{ input: { minHeight: "calc(2.5rem + 4px)", height: "calc(2.5rem + 4px)", fontSize: "1rem", display: "flex", alignItems: "center" } }}
          classNames={{ input: "text-base" }}
        />
        <Group justify="space-between" mt="xl">
          <Button variant="outline" onClick={onClose} disabled={approving}>
            Cancel
          </Button>
          <Button onClick={onApprove} disabled={approving || roles.length === 0} leftSection={<IconCheck size={16} />}>
            {approving ? "Approving..." : "Approve Access"}
          </Button>
        </Group>
      </Stack>
    </Drawer>
  );
}

function PodMappingTable({
  pods,
  settings,
  setSettings,
  users,
  updatePodMapping,
  updatePodOrder,
  draggedPodIndex,
  setDraggedPodIndex,
}: {
  pods: string[];
  settings: AppSettings;
  setSettings: React.Dispatch<React.SetStateAction<AppSettings | null>>;
  users: User[];
  updatePodMapping: (pod: string, userEmail: string | null) => Promise<void>;
  updatePodOrder: (newOrder: string[]) => Promise<void>;
  draggedPodIndex: number | null;
  setDraggedPodIndex: (index: number | null) => void;
}) {
  const podOrder = settings.pod_order || [];
  
  // Sort pods based on saved order, then add any new pods at the end
  const sortedPods = useMemo(() => {
    const ordered: string[] = [];
    const unordered: string[] = [];
    
    // First, add pods in the saved order
    podOrder.forEach(pod => {
      if (pods.includes(pod)) {
        ordered.push(pod);
      }
    });
    
    // Then add any pods not in the order
    pods.forEach(pod => {
      if (!podOrder.includes(pod)) {
        unordered.push(pod);
      }
    });
    
    return [...ordered, ...unordered];
  }, [pods, podOrder]);

  const handleDragStart = (index: number) => {
    setDraggedPodIndex(index);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.currentTarget.classList.add('opacity-50');
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.currentTarget.classList.remove('opacity-50');
  };

  const handleDrop = async (e: React.DragEvent, dropIndex: number) => {
    e.preventDefault();
    e.currentTarget.classList.remove('opacity-50');
    
    if (draggedPodIndex === null || draggedPodIndex === dropIndex) {
      setDraggedPodIndex(null);
      return;
    }

    const newOrder = [...sortedPods];
    const [draggedPod] = newOrder.splice(draggedPodIndex, 1);
    newOrder.splice(dropIndex, 0, draggedPod);

    // Optimistically update UI
    const updatedSettings = {
      ...settings,
      pod_order: newOrder,
    };
    setSettings(updatedSettings);

    // Save to database directly
    try {
      await updatePodOrder(newOrder);
      console.log('Pod order saved successfully:', newOrder);
    } catch (error: any) {
      console.error('Failed to save pod order:', error);
      // Revert on error
      setSettings(settings);
      alert(`Failed to save pod order: ${error.message || error}`);
    }

    setDraggedPodIndex(null);
  };

  const handleDragEnd = () => {
    setDraggedPodIndex(null);
    // Remove opacity from all rows
    document.querySelectorAll('.pod-row').forEach(row => {
      row.classList.remove('opacity-50');
    });
  };

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-12"></th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Pod</th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Product Manager</th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {sortedPods.map((pod: string, index: number) => {
            const currentMapping = settings.pod_product_manager_mapping || {};
            const currentEmail = currentMapping[pod] || "";
            const isDragging = draggedPodIndex === index;
            
            return (
              <tr
                key={pod}
                className={`pod-row hover:bg-gray-50 transition-colors ${isDragging ? 'opacity-50' : ''}`}
                draggable
                onDragStart={() => handleDragStart(index)}
                onDragOver={(e) => handleDragOver(e, index)}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, index)}
                onDragEnd={handleDragEnd}
                style={{ cursor: 'move' }}
              >
                <td className="px-6 py-4 whitespace-nowrap w-12">
                  <IconGripVertical className="w-5 h-5 text-gray-400" />
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className="text-sm font-medium text-gray-900">{pod}</span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <select
                    value={currentEmail}
                    onChange={(e) => updatePodMapping(pod, e.target.value || null)}
                    className="w-full max-w-md px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent bg-white text-sm"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <option value="">— Select Product Manager —</option>
                    {users
                      .filter((u) => u.is_active !== false)
                      .map((user) => {
                        const displayName = user.first_name || user.last_name ? `${user.first_name || ""} ${user.last_name || ""}`.trim() : user.email;
                        return (
                          <option key={user.id} value={user.email}>
                            {displayName} {user.email !== displayName ? `(${user.email})` : ""}
                          </option>
                        );
                      })}
                  </select>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function EditUserDrawer({ user, opened, onClose, onSave, onDelete }: { user: User; opened: boolean; onClose: () => void; onSave: (patch: any) => Promise<void>; onDelete: () => Promise<void> }) {
  const [patch, setPatch] = useState({ email: user.email || "", first_name: user.first_name || "", last_name: user.last_name || "", roles: user.roles || [user.role || "OTHER"], is_active: user.is_active !== false });
  return (
    <Drawer opened={opened} onClose={onClose} title="Edit User" position="right" size="xl" padding="lg">
      <Stack gap="md">
        <Group grow>
          <TextInput label="Email" value={patch.email} onChange={(e) => setPatch({ ...patch, email: e.target.value })} required />
          <MultiSelect
            label="Roles"
            data={ROLES as unknown as string[]}
            value={patch.roles}
            onChange={(value) => setPatch({ ...patch, roles: value })}
            styles={{ input: { minHeight: "calc(2.5rem + 4px)", height: "calc(2.5rem + 4px)", fontSize: "1rem", display: "flex", alignItems: "center" } }}
            classNames={{ input: "text-base" }}
          />
        </Group>
        <Group grow>
          <TextInput label="First Name" value={patch.first_name} onChange={(e) => setPatch({ ...patch, first_name: e.target.value })} />
          <TextInput label="Last Name" value={patch.last_name} onChange={(e) => setPatch({ ...patch, last_name: e.target.value })} />
        </Group>
        <Checkbox label="Active" checked={patch.is_active} onChange={(e) => setPatch({ ...patch, is_active: e.target.checked })} />
        <Group justify="space-between" mt="xl">
          <Button variant="outline" color="red" leftSection={<IconTrash size={16} />} onClick={async () => { if (confirm("Are you sure you want to delete this user?")) { await onDelete(); } }}>Delete</Button>
          <Group>
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={() => onSave(patch)}>Save Changes</Button>
          </Group>
        </Group>
      </Stack>
    </Drawer>
  );
}
