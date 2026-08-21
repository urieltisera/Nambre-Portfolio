"use client";

import React, {useState} from "react";
import {Menu} from "lucide-react";
import {NambreBrand} from "@/components/brand/NambreBrand";
import {NavItem, Sidebar} from "@/components/layout/Sidebar";
import {MobileDrawer} from "@/components/layout/MobileDrawer";
import {Button} from "@/components/ui/Button";
import {cn} from "@/lib/cn";

export function OwnerAppShell({
  activeView,
  bottomContent,
  children,
  desktopUtility,
  items,
  mobileTitle,
  onNavigate,
  title,
}: {
  activeView: string;
  bottomContent?: React.ReactNode | ((collapsed: boolean) => React.ReactNode);
  children: React.ReactNode;
  desktopUtility?: React.ReactNode;
  items: NavItem[];
  mobileTitle: string;
  onNavigate: (view: string) => void;
  title: string;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  function handleNavigate(nextView: string) {
    onNavigate(nextView);
    setMobileOpen(false);
  }

  return (
    <div className={cn("owner-shell", collapsed ? "is-collapsed" : "")}>
      <Sidebar
        activeKey={activeView}
        bottom={typeof bottomContent === "function" ? bottomContent(collapsed) : bottomContent}
        collapsed={collapsed}
        items={items}
        onNavigate={handleNavigate}
        onToggleCollapsed={() => setCollapsed((current) => !current)}
        title={title}
      />

      <div className="owner-shell__main">
        <header className="owner-shell__mobile-header">
          <Button
            aria-label="Abrir navegación"
            className="owner-shell__menu-trigger"
            onClick={() => setMobileOpen(true)}
            variant="secondary"
          >
            <Menu size={18} />
          </Button>
          <div className="owner-shell__mobile-brand">
            <NambreBrand className="owner-shell__mobile-logo" />
            <p>{mobileTitle}</p>
          </div>
        </header>

        {desktopUtility ? <div className="owner-shell__utility">{desktopUtility}</div> : null}

        <main className={cn("owner-shell__content", collapsed ? "is-collapsed" : "")}>
          {children}
        </main>
      </div>

      <MobileDrawer onClose={() => setMobileOpen(false)} open={mobileOpen} title={title}>
        <div className="mobile-drawer__body">
          <nav className="mobile-drawer__nav" aria-label="Navegación móvil">
            {items.map((item) => (
              <button
                className={cn(
                  "mobile-drawer__link",
                  activeView === item.key ? "is-active" : "",
                )}
                key={item.key}
                onClick={() => handleNavigate(item.key)}
                type="button"
              >
                <span className="sidebar__icon">{item.icon}</span>
                <span>{item.label}</span>
              </button>
            ))}
          </nav>
          {bottomContent ? (
            <div className="mobile-drawer__footer">
              {typeof bottomContent === "function" ? bottomContent(false) : bottomContent}
            </div>
          ) : null}
        </div>
      </MobileDrawer>
    </div>
  );
}
