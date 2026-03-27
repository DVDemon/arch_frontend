"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";

const navItems = [
  { href: "/", label: "Главная", icon: "⌂" },
  { href: "/products", label: "Каталог продуктов", icon: "📦" },
  { href: "/capabilities", label: "Каталог возможностей", icon: "🔧" },
  { href: "/cx", label: "CX", icon: "🧭" },
  { href: "/tech-radar", label: "Технический радар", icon: "📡" },
  { href: "/architecture", label: "Архитектура", icon: "🏗" },
];

export function Sidebar({
  collapsed,
  onToggle,
  mobileOpen,
  onMobileClose,
}: {
  collapsed: boolean;
  onToggle: () => void;
  mobileOpen?: boolean;
  onMobileClose?: () => void;
}) {
  const pathname = usePathname();

  const sidebarContent = (
    <>
      <div className="flex h-14 items-center justify-between border-b border-zinc-200 px-3 dark:border-zinc-800">
        <Link href="/" className="flex shrink-0 items-center" aria-label="BeeAtlas Lite">
          <Image
            src="/logo.png"
            alt="BeeAtlas Lite"
            width={collapsed ? 32 : 40}
            height={collapsed ? 32 : 40}
            className="object-contain"
            unoptimized
          />
        </Link>
        <button
          onClick={onToggle}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-zinc-600 transition-colors hover:bg-zinc-200 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-700 dark:hover:text-zinc-100"
          aria-label={collapsed ? "Развернуть меню" : "Свернуть меню"}
        >
          <span className="text-lg">{collapsed ? "→" : "←"}</span>
        </button>
      </div>
      <nav className="flex-1 overflow-y-auto p-2">
        <ul className="space-y-1">
          {navItems.map((item) => {
            const isActive =
              pathname === item.href ||
              (item.href !== "/" && pathname.startsWith(item.href));
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  onClick={onMobileClose}
                  className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors ${
                    isActive
                      ? "bg-amber-100 font-medium text-amber-900 dark:bg-amber-900/30 dark:text-amber-200"
                      : "text-zinc-600 hover:bg-zinc-200 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-700 dark:hover:text-zinc-100"
                  }`}
                >
                  <span className="shrink-0 text-lg">{item.icon}</span>
                  {!collapsed && <span className="truncate">{item.label}</span>}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <aside
        className={`hidden border-r border-zinc-200 bg-zinc-50 transition-all duration-300 dark:border-zinc-800 dark:bg-zinc-900 md:flex md:flex-col ${
          collapsed ? "w-16" : "w-56"
        }`}
      >
        {sidebarContent}
      </aside>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={onMobileClose}
          aria-hidden="true"
        />
      )}

      {/* Mobile sidebar drawer */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-56 flex-col border-r border-zinc-200 bg-zinc-50 shadow-xl transition-transform duration-300 dark:border-zinc-800 dark:bg-zinc-900 md:hidden ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {sidebarContent}
      </aside>
    </>
  );
}
