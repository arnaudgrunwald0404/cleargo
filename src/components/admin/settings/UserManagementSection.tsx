"use client";
import { PurpleLoader } from '../../PurpleLoader';
import React, { useState, useMemo, useRef, useEffect } from "react";
import { Drawer, Stack, Group, TextInput, MultiSelect, Select, Checkbox, Button, Textarea, Avatar } from "@mantine/core";
import { IconTrash, IconMail, IconPencil, IconUserCircle, IconGripVertical, IconUpload, IconList, IconArrowUp, IconArrowDown, IconArrowsSort } from "@tabler/icons-react";
import type { AppSettings } from "@/lib/settings-db";
import { ROLES } from "@/lib/constants/settings";

type User = {
  id: string;
  email: string;
  first_name?: string;
  last_name?: string;
  avatar_url?: string | null;
  roles?: string[];
  role?: string;
  is_active?: boolean;
  last_logged_in?: string | null;
  pending?: boolean;
  receive_slack_notifications?: boolean;
};

type Props = {
  users: User[];
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
  isSuperAdmin?: boolean;
};

export default function UserManagementSection(props: Props) {
  const {
    users,
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
    isSuperAdmin = false,
  } = props;

  const [newUser, setNewUser] = useState({ email: "", first_name: "", last_name: "", roles: [] as string[], is_active: true });

  const [editingRolesUserId, setEditingRolesUserId] = useState<string | null>(null);
  const [editingRolesDraft, setEditingRolesDraft] = useState<string[] | null>(null);
  const rolesEditRef = useRef<HTMLDivElement>(null);
  const [bulkImportDrawerOpen, setBulkImportDrawerOpen] = useState(false);
  const [bulkImportMode, setBulkImportMode] = useState<"file" | "emails" | null>(null);
  const [bulkImportEmailsStep, setBulkImportEmailsStep] = useState<1 | 2>(1);
  const [bulkImportEmailsText, setBulkImportEmailsText] = useState("");
  const [bulkImportRoles, setBulkImportRoles] = useState<Record<string, string>>({});
  const [bulkImportEmailsLoading, setBulkImportEmailsLoading] = useState(false);

  type SortKey = "firstName" | "lastName" | "email" | "role" | "lastLoggedIn";
  const [userSortKey, setUserSortKey] = useState<SortKey>("lastName");
  const [userSortDir, setUserSortDir] = useState<"asc" | "desc">("asc");

  useEffect(() => {
    if (!editingRolesUserId || editingRolesDraft === null) return;
    const handleMouseDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (rolesEditRef.current?.contains(target)) return;
      if (document.body.contains(target) && (target as Element).closest?.("[role=\"listbox\"]")) return;
      const user = users.find((u) => u.id === editingRolesUserId);
      if (!user) {
        setEditingRolesUserId(null);
        setEditingRolesDraft(null);
        return;
      }
      const original = user.roles?.length ? [...user.roles].sort() : [user.role || "OTHER"];
      const draft = [...editingRolesDraft].sort();
      const same = original.length === draft.length && original.every((r, i) => r === draft[i]);
      if (!same) {
        const roles = draft.length > 0 ? draft : ["OTHER"];
        fetch(`/api/users/${editingRolesUserId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ roles }),
        }).then(async (res) => {
          if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            throw new Error((data as { error?: string })?.error || "Failed to update roles");
          }
          onRefresh();
        }).catch((err: any) => alert(err?.message || "Failed to update roles"));
      }
      setEditingRolesUserId(null);
      setEditingRolesDraft(null);
    };
    document.addEventListener("mousedown", handleMouseDown, true);
    return () => document.removeEventListener("mousedown", handleMouseDown, true);
  }, [editingRolesUserId, editingRolesDraft, users, onRefresh]);

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
      setBulkImportDrawerOpen(false);
      setBulkImportMode(null);
      onRefresh();
    } catch (error: any) {
      alert(`Error: ${error.message}`);
    } finally {
      setBulkImportLoading(false);
    }
  };

  const parsedEmails = useMemo(() => {
    if (!bulkImportEmailsText.trim()) return [];
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const extractEmail = (token: string): string | null => {
      const trimmed = token.trim();
      if (!trimmed) return null;
      const inBrackets = trimmed.match(/<([^>]+)>/);
      const candidate = inBrackets ? inBrackets[1].trim() : trimmed;
      return emailRegex.test(candidate) ? candidate.toLowerCase() : null;
    };
    return bulkImportEmailsText
      .split(/[\n,]+/)
      .map(extractEmail)
      .filter((e): e is string => e != null);
  }, [bulkImportEmailsText]);

  const existingEmails = useMemo(
    () => new Set(users.map((u) => (u.email || "").toLowerCase())),
    [users]
  );

  const parsedEmailsNewOnly = useMemo(() => {
    const unique = [...new Set(parsedEmails)];
    return unique.filter((e) => !existingEmails.has(e));
  }, [parsedEmails, existingEmails]);

  const parsedEmailsAlreadyInSystem = useMemo(
    () => parsedEmails.filter((e) => existingEmails.has(e)),
    [parsedEmails, existingEmails]
  );

  const handleBulkImportEmails = async () => {
    if (parsedEmailsNewOnly.length === 0) return;
    setBulkImportEmailsLoading(true);
    try {
      const usersToImport = parsedEmailsNewOnly.map((email) => ({
        email,
        role: bulkImportRoles[email] ?? "OTHER",
      }));
      const res = await fetch("/api/users/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ users: usersToImport }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to import users");
      }
      const data = await res.json();
      alert(`Successfully imported ${data.created} user(s)`);
      setBulkImportDrawerOpen(false);
      setBulkImportMode(null);
      setBulkImportEmailsStep(1);
      setBulkImportEmailsText("");
      setBulkImportRoles({});
      onRefresh();
    } catch (error: any) {
      alert(`Error: ${error.message}`);
    } finally {
      setBulkImportEmailsLoading(false);
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
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = data.details ? `${data.error}: ${data.details}` : (data.error || "Failed to delete users");
        throw new Error(msg);
      }
      setSelectedUserIds(new Set());
      onRefresh();
    } catch (error: any) {
      alert(`Error: ${error.message}`);
    }
  };

  const handleDeleteUser = async (id: string): Promise<boolean> => {
    try {
      const res = await fetch(`/api/users/${id}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = data.details ? `${data.error}: ${data.details}` : (data.error || "Failed to delete user");
        throw new Error(msg);
      }
      return true;
    } catch (error: any) {
      alert(`Error: ${error.message}`);
      return false;
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

  const editingUser = users.find((u) => u.id === editingUserId);

  const sortedUsers = useMemo(() => {
    const firstRole = (u: User) => ((u.roles && u.roles[0]) || u.role || "OTHER").toLowerCase();
    const cmp = (a: User, b: User): number => {
      let v = 0;
      switch (userSortKey) {
        case "firstName":
          v = (a.first_name || "").toLowerCase().localeCompare((b.first_name || "").toLowerCase());
          break;
        case "lastName":
          v = (a.last_name || "").toLowerCase().localeCompare((b.last_name || "").toLowerCase());
          break;
        case "email":
          v = (a.email || "").toLowerCase().localeCompare((b.email || "").toLowerCase());
          break;
        case "role":
          v = firstRole(a).localeCompare(firstRole(b));
          break;
        case "lastLoggedIn": {
          const ta = a.last_logged_in ? new Date(a.last_logged_in).getTime() : 0;
          const tb = b.last_logged_in ? new Date(b.last_logged_in).getTime() : 0;
          v = ta - tb;
          break;
        }
      }
      if (v !== 0) return userSortDir === "asc" ? v : -v;
      const aEmail = (a.email || "").toLowerCase();
      const bEmail = (b.email || "").toLowerCase();
      return aEmail.localeCompare(bEmail);
    };
    return [...users].sort(cmp);
  }, [users, userSortKey, userSortDir]);

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
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="text-md font-semibold text-gray-900">Users</h3>
                <p className="text-sm text-gray-500">
                  Manage users, roles, and permissions · {users.filter((u) => u.is_active !== false).length} active / {users.length} total
                </p>
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={() => setShowAddUser(true)} className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-medium transition-colors">
                  Add User
                </button>
                <button type="button" onClick={() => { setBulkImportDrawerOpen(true); setBulkImportMode(null); setBulkImportEmailsStep(1); setBulkImportEmailsText(""); setBulkImportRoles({}); }} className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 font-medium transition-colors">
                  Import Bulk
                </button>
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
              <div className="border-2 border-purple-200 rounded-lg bg-purple-50 overflow-x-auto overflow-y-visible">
                <table className="min-w-full divide-y divide-purple-200 table-fixed" style={{ minWidth: '900px' }}>
              <colgroup>
                <col className="w-12" />
                <col className="w-12" />
                <col className="w-auto" />
                <col className="w-auto" />
                <col className="w-40" />
                <col className="w-auto" />
                <col className="w-32" />
                <col className="w-20" />
                <col className="w-40" />
              </colgroup>
              <thead className="bg-purple-100">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-purple-900 w-12">
                    <input
                      type="checkbox"
                      checked={selectedUserIds.size === sortedUsers.length && sortedUsers.length > 0}
                      onChange={(e) => {
                        if (e.target.checked) setSelectedUserIds(new Set(sortedUsers.map((u) => u.id)));
                        else setSelectedUserIds(new Set());
                      }}
                      />
                  </th>
                  <th className="px-2 py-2 text-left text-xs font-medium text-purple-900 w-12" title="Photo" />
                  {(["firstName", "lastName", "email", "role", "lastLoggedIn"] as SortKey[]).map((key) => (
                    <th
                      key={key}
                      className="px-4 py-2 text-left text-xs font-medium text-purple-900 cursor-pointer select-none hover:bg-purple-200/50 transition-colors"
                      onClick={() => {
                        if (userSortKey === key) {
                          setUserSortDir((d) => (d === "asc" ? "desc" : "asc"));
                        } else {
                          setUserSortKey(key);
                          setUserSortDir("asc");
                        }
                      }}
                    >
                      <span className="inline-flex items-center gap-1">
                        {key === "firstName" ? "First Name" : key === "lastName" ? "Last Name" : key === "email" ? "Email" : key === "role" ? "Roles" : "Last Logged In"}
                        {userSortKey === key ? (userSortDir === "asc" ? <IconArrowUp size={14} /> : <IconArrowDown size={14} />) : <IconArrowsSort size={14} className="opacity-40" />}
                      </span>
                    </th>
                  ))}
                  <th className="px-4 py-2 text-left text-xs font-medium text-purple-900 w-20" title="Receive Slack notifications">Slack</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-purple-900 w-40">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-purple-200">
                {sortedUsers.map((user) => (
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
                    <td className="px-2 py-3 w-12">
                      {user.avatar_url ? (
                        <Avatar src={user.avatar_url} alt={user.email} radius="xl" size={32} />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center" title="No photo">
                          <IconUserCircle className="w-6 h-6 text-purple-400" />
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900">{user.first_name || "—"}</td>
                    <td className="px-4 py-3 text-sm text-gray-900">{user.last_name || "—"}</td>
                    <td className="px-4 py-3 text-sm text-gray-700 max-w-0 truncate" title={user.email}>{user.email}</td>
                    <td className="px-4 py-2 text-sm align-top">
                      {editingRolesUserId === user.id ? (
                        <div ref={rolesEditRef}>
                          <MultiSelect
                            size="xs"
                            data={ROLES as unknown as string[]}
                            value={editingRolesDraft ?? (user.roles?.length ? user.roles : [user.role || "OTHER"])}
                            onChange={(value) => setEditingRolesDraft(value.length > 0 ? value : ["OTHER"])}
                            placeholder="Roles"
                            classNames={{ input: "min-h-8 text-xs" }}
                            styles={{ input: { minHeight: 28 } }}
                          />
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            setEditingRolesUserId(user.id);
                            setEditingRolesDraft(user.roles?.length ? [...user.roles] : [user.role || "OTHER"]);
                          }}
                          className="flex flex-wrap gap-1 text-left rounded hover:bg-purple-100/80 transition-colors -m-1 p-1"
                        >
                          {(user.roles || [user.role || "OTHER"]).map((role: string) => (
                            <span key={role} className="px-2 py-1 text-xs bg-blue-100 text-blue-700 rounded">
                              {role}
                            </span>
                          ))}
                        </button>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700 whitespace-nowrap w-32">{user.last_logged_in ? new Date(user.last_logged_in).toLocaleDateString() : "Never"}</td>
                    <td className="px-4 py-3 w-20">
                      <input
                        type="checkbox"
                        checked={!!user.receive_slack_notifications}
                        title="Receive Slack notifications"
                        onChange={async (e) => {
                          const checked = e.target.checked;
                          try {
                            const res = await fetch(`/api/users/${user.id}`, {
                              method: "PATCH",
                              headers: { "Content-Type": "application/json" },
                              credentials: "include",
                              body: JSON.stringify({ receive_slack_notifications: checked }),
                            });
                            const data = await res.json().catch(() => ({}));
                            if (!res.ok) throw new Error(data?.error || "Failed to update");
                            onRefresh();
                          } catch (err: any) {
                            alert(err?.message || "Failed to update Slack notification setting");
                          }
                        }}
                        className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                      />
                    </td>
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
          isSuperAdmin={isSuperAdmin}
          onClose={() => setEditingUserId(null)}
          onSave={async (patch) => {
            const res = await fetch(`/api/users/${editingUser.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) });
            if (!res.ok) throw new Error("Failed to update");
            setEditingUserId(null);
            onRefresh();
          }}
          onDelete={async () => {
            const ok = await handleDeleteUser(editingUser.id);
            if (ok) {
              setEditingUserId(null);
              onRefresh();
            }
          }}
        />
      )}

      <Drawer
        opened={bulkImportDrawerOpen}
        onClose={() => {
          setBulkImportDrawerOpen(false);
          setBulkImportMode(null);
          setBulkImportEmailsStep(1);
          setBulkImportEmailsText("");
          setBulkImportRoles({});
          setBulkImportFile(null);
        }}
        title="Bulk import users"
        position="right"
        size="md"
        padding="lg"
        styles={{ content: { overflowX: 'hidden' } }}
      >
        <Stack gap="lg">
          {bulkImportMode === null && (
            <>
              <p className="text-sm text-gray-600">Choose how to import users:</p>
              <div className="flex flex-col gap-3">
                <label className="flex items-center gap-3 p-4 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer transition-colors">
                  <IconUpload className="w-5 h-5 text-gray-500" />
                  <div className="flex-1">
                    <span className="font-medium text-gray-900">Upload a file</span>
                    <p className="text-xs text-gray-500 mt-0.5">.xlsx, .xls, or .csv with Email, First Name, Last Name, Roles, Active</p>
                  </div>
                  <input
                    type="file"
                    accept=".xlsx,.xls,.csv"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) {
                        setBulkImportFile(f);
                        setBulkImportMode("file");
                      }
                    }}
                  />
                </label>
                <button
                  type="button"
                  onClick={() => setBulkImportMode("emails")}
                  className="flex items-center gap-3 p-4 border border-gray-200 rounded-lg hover:bg-gray-50 text-left transition-colors w-full"
                >
                  <IconList className="w-5 h-5 text-gray-500" />
                  <div className="flex-1">
                    <span className="font-medium text-gray-900">Paste email list</span>
                    <p className="text-xs text-gray-500 mt-0.5">Comma-separated emails; choose one role for all on the next screen</p>
                  </div>
                </button>
              </div>
            </>
          )}

          {bulkImportMode === "file" && (
            <>
              {bulkImportFile ? (
                <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                  <p className="text-sm text-blue-800 font-medium">{bulkImportFile.name}</p>
                  <p className="text-xs text-blue-600 mt-1">Click Import to add these users (roles per row from file).</p>
                </div>
              ) : (
                <label className="flex flex-col items-center gap-2 p-6 border-2 border-dashed border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer">
                  <IconUpload className="w-10 h-10 text-gray-400" />
                  <span className="text-sm text-gray-600">Choose .xlsx, .xls, or .csv</span>
                  <input
                    type="file"
                    accept=".xlsx,.xls,.csv"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) setBulkImportFile(f);
                    }}
                  />
                </label>
              )}
              <Group justify="space-between">
                <Button variant="subtle" onClick={() => { setBulkImportMode(null); setBulkImportFile(null); }}>Back</Button>
                <Group>
                  <Button variant="outline" onClick={() => { setBulkImportDrawerOpen(false); setBulkImportMode(null); setBulkImportFile(null); }}>Cancel</Button>
                  <Button onClick={handleBulkImport} disabled={!bulkImportFile || bulkImportLoading}>
                    {bulkImportLoading ? "Importing..." : "Import"}
                  </Button>
                </Group>
              </Group>
            </>
          )}

          {bulkImportMode === "emails" && bulkImportEmailsStep === 1 && (
            <>
              <Textarea
                label="Paste emails (comma- or newline-separated)"
                placeholder="email1@example.com, email2@example.com, ..."
                value={bulkImportEmailsText}
                onChange={(e) => setBulkImportEmailsText(e.currentTarget.value)}
                minRows={5}
                classNames={{ input: "font-mono text-sm" }}
              />
              <p className="text-xs text-gray-500">Invalid lines will be ignored. On the next screen you will choose one role for all.</p>
              <Group justify="space-between">
                <Button variant="subtle" onClick={() => setBulkImportMode(null)}>Back</Button>
                <Group>
                  <Button variant="outline" onClick={() => { setBulkImportDrawerOpen(false); setBulkImportMode(null); setBulkImportEmailsText(""); }}>Cancel</Button>
                  <Button onClick={() => setBulkImportEmailsStep(2)} disabled={parsedEmails.length === 0}>
                    Next ({parsedEmailsNewOnly.length} new{parsedEmailsAlreadyInSystem.length > 0 ? `, ${parsedEmailsAlreadyInSystem.length} already in system` : ""})
                  </Button>
                </Group>
              </Group>
            </>
          )}

          {bulkImportMode === "emails" && bulkImportEmailsStep === 2 && (
            <>
              {parsedEmailsAlreadyInSystem.length > 0 && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
                  {parsedEmailsAlreadyInSystem.length} email(s) already in system; {parsedEmailsNewOnly.length} new to add.
                </div>
              )}
              {parsedEmailsNewOnly.length === 0 ? (
                <p className="text-sm text-gray-600">All {parsedEmails.length} email(s) are already in the system. Nothing to import.</p>
              ) : (
                <>
                  <p className="text-sm text-gray-600">Assign a role to each new user. Default is OTHER.</p>
                  <div className="max-h-[50vh] overflow-y-auto border border-gray-200 rounded-lg divide-y divide-gray-100">
                    {parsedEmailsNewOnly.map((email) => (
                      <div key={email} className="flex items-center gap-3 px-3 py-2 hover:bg-gray-50">
                        <span className="flex-1 min-w-0 truncate text-sm text-gray-800" title={email}>{email}</span>
                        <Select
                          size="xs"
                          data={ROLES as unknown as string[]}
                          value={bulkImportRoles[email] ?? "OTHER"}
                          onChange={(v) => v && setBulkImportRoles((prev) => ({ ...prev, [email]: v }))}
                          allowDeselect={false}
                          styles={{ root: { minWidth: 120 } }}
                        />
                      </div>
                    ))}
                  </div>
                </>
              )}
              <Group justify="space-between">
                <Button variant="subtle" onClick={() => setBulkImportEmailsStep(1)}>Back</Button>
                <Group>
                  <Button variant="outline" onClick={() => { setBulkImportDrawerOpen(false); setBulkImportMode(null); setBulkImportEmailsStep(1); setBulkImportEmailsText(""); setBulkImportRoles({}); }}>Cancel</Button>
                  <Button onClick={handleBulkImportEmails} disabled={bulkImportEmailsLoading || parsedEmailsNewOnly.length === 0}>
                    {bulkImportEmailsLoading ? "Importing..." : "Import"}
                  </Button>
                </Group>
              </Group>
            </>
          )}
        </Stack>
      </Drawer>

    </div>
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

function ImpersonateForm({ email }: { email: string }) {
  return (
    <form action="/api/admin/impersonate" method="post" className="inline">
      <input type="hidden" name="email" value={email} />
      <Button type="submit" variant="outline" color="amber" leftSection={<IconUserCircle size={16} />}>
        Impersonate
      </Button>
    </form>
  );
}

function EditUserDrawer({ user, opened, onClose, onSave, onDelete, isSuperAdmin = false }: { user: User; opened: boolean; onClose: () => void; onSave: (patch: any) => Promise<void>; onDelete: () => Promise<void>; isSuperAdmin?: boolean }) {
  const [patch, setPatch] = useState({ email: user.email || "", first_name: user.first_name || "", last_name: user.last_name || "", roles: user.roles || [user.role || "OTHER"], is_active: user.is_active !== false });
  return (
    <Drawer opened={opened} onClose={onClose} title="Edit User" position="right" size="xl" padding="lg" styles={{ content: { overflowX: 'hidden' } }}>
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
          <Group>
            <Button variant="outline" color="red" leftSection={<IconTrash size={16} />} onClick={async () => { if (confirm("Are you sure you want to delete this user? This cannot be undone.")) { await onDelete(); } }}>Delete</Button>
            {isSuperAdmin && user.email && (
              <ImpersonateForm email={user.email} />
            )}
          </Group>
          <Group>
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={() => onSave(patch)}>Save Changes</Button>
          </Group>
        </Group>
      </Stack>
    </Drawer>
  );
}
