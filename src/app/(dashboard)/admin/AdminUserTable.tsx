"use client";

import { useState } from "react";
import Badge from "@/components/ui/Badge";
import { updateUserRole } from "@/lib/actions/profile";

interface Profile {
  id: string;
  email?: string | null;
  display_name?: string | null;
  role: string;
  created_at?: string | null;
}

interface AdminUserTableProps {
  profiles: Profile[];
  currentUserId: string;
}

const roleLabels: Record<string, string> = {
  viewer: "Viewer",
  builder: "Builder",
  admin: "Admin",
};

const roleBadgeVariant: Record<string, "info" | "success" | "warning" | "error"> = {
  viewer: "info",
  builder: "success",
  admin: "warning",
};

export default function AdminUserTable({
  profiles,
  currentUserId,
}: AdminUserTableProps) {
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Record<string, { type: "success" | "error"; message: string }>>({});

  async function handleRoleChange(userId: string, newRole: string) {
    setUpdatingId(userId);
    setFeedback((prev) => {
      const next = { ...prev };
      delete next[userId];
      return next;
    });

    try {
      await updateUserRole(userId, newRole);
      setFeedback((prev) => ({
        ...prev,
        [userId]: { type: "success", message: "Rol bijgewerkt" },
      }));
    } catch (err) {
      setFeedback((prev) => ({
        ...prev,
        [userId]: {
          type: "error",
          message: err instanceof Error ? err.message : "Fout bij bijwerken",
        },
      }));
    } finally {
      setUpdatingId(null);
    }
  }

  return (
    <div className="overflow-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-hero-grey-light">
            <th className="py-2 pr-4 text-left text-xs font-medium text-hero-grey-regular">
              Gebruiker
            </th>
            <th className="py-2 pr-4 text-left text-xs font-medium text-hero-grey-regular">
              E-mail
            </th>
            <th className="py-2 pr-4 text-left text-xs font-medium text-hero-grey-regular">
              Rol
            </th>
            <th className="py-2 pr-4 text-left text-xs font-medium text-hero-grey-regular">
              Lid sinds
            </th>
            <th className="py-2 text-left text-xs font-medium text-hero-grey-regular">
              Wijzig rol
            </th>
          </tr>
        </thead>
        <tbody>
          {profiles.map((p) => {
            const isCurrentUser = p.id === currentUserId;
            return (
              <tr
                key={p.id}
                className="border-b border-hero-grey-light/50 last:border-0"
              >
                <td className="py-3 pr-4">
                  <span className="font-medium text-hero-grey-black">
                    {p.display_name || "Onbekend"}
                  </span>
                  {isCurrentUser && (
                    <span className="ml-2 text-[11px] text-hero-grey-regular">
                      (jij)
                    </span>
                  )}
                </td>
                <td className="py-3 pr-4 text-hero-grey-regular">
                  {p.email || "-"}
                </td>
                <td className="py-3 pr-4">
                  <Badge variant={roleBadgeVariant[p.role] ?? "info"}>
                    {roleLabels[p.role] || p.role}
                  </Badge>
                </td>
                <td className="py-3 pr-4 text-hero-grey-regular">
                  {p.created_at
                    ? new Date(p.created_at).toLocaleDateString("nl-NL")
                    : "-"}
                </td>
                <td className="py-3">
                  {isCurrentUser ? (
                    <span className="text-xs text-hero-grey-regular">
                      Kan niet wijzigen
                    </span>
                  ) : (
                    <div>
                      <select
                        value={p.role}
                        onChange={(e) => handleRoleChange(p.id, e.target.value)}
                        disabled={updatingId === p.id}
                        className="h-8 rounded-[var(--radius-input)] border border-hero-grey-light bg-white px-2 text-xs text-hero-grey-black focus:border-hero-blue-medium focus:outline-none focus:ring-2 focus:ring-hero-blue-medium/30 disabled:opacity-50 cursor-pointer"
                      >
                        <option value="viewer">Viewer</option>
                        <option value="builder">Builder</option>
                        <option value="admin">Admin</option>
                      </select>
                      {feedback[p.id] && (
                        <p
                          className={`mt-1 text-[11px] ${
                            feedback[p.id].type === "success"
                              ? "text-emerald-600"
                              : "text-red-500"
                          }`}
                        >
                          {feedback[p.id].message}
                        </p>
                      )}
                    </div>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
