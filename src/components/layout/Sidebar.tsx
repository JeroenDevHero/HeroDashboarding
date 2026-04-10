"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

const navItems = [
  { href: "/dashboards", icon: "dashboard", label: "Home" },
  { href: "/dashboards", icon: "grid_view", label: "Dashboards" },
  { href: "/klips", icon: "bar_chart", label: "Klips" },
  { href: "/datasources", icon: "database", label: "Databronnen", roles: ["admin", "builder"] },
  { href: "/ai", icon: "smart_toy", label: "AI Assistent" },
  { href: "/knowledge", icon: "library_books", label: "Kennisbank" },
  { href: "/klipfolio", icon: "swap_horiz", label: "Klipfolio", roles: ["admin", "builder"] },
  { href: "/admin", icon: "settings", label: "Beheer", roles: ["admin"] },
];

export default function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside
      className={`flex flex-col bg-hero-blue text-white transition-all duration-200 ${
        collapsed ? "w-16" : "w-60"
      }`}
    >
      <div className="flex h-16 items-center justify-between px-4">
        {!collapsed && (
          <span className="text-lg font-semibold tracking-tight">Hero</span>
        )}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="rounded p-1 text-white/70 hover:bg-white/10 hover:text-white"
        >
          <span className="material-symbols-rounded text-[20px]">
            {collapsed ? "chevron_right" : "chevron_left"}
          </span>
        </button>
      </div>

      <nav className="mt-2 flex flex-1 flex-col gap-1 px-2">
        {navItems.map((item) => {
          const isActive = pathname.startsWith(item.href);
          return (
            <Link
              key={item.href + item.label}
              href={item.href}
              className={`flex items-center gap-3 rounded-[var(--radius-button)] px-3 py-2 text-sm transition-colors ${
                isActive
                  ? "bg-white/15 text-white"
                  : "text-white/70 hover:bg-white/10 hover:text-white"
              }`}
            >
              <span className="material-symbols-rounded text-[20px]">
                {item.icon}
              </span>
              {!collapsed && <span>{item.label}</span>}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
