import React from "react";
import {PanelLeftClose, PanelLeftOpen} from "lucide-react";
import {NambreBrand} from "@/components/brand/NambreBrand";
import {Button} from "@/components/ui/Button";
import {cn} from "@/lib/cn";

export type NavItem = {
  icon: React.ReactNode;
  key: string;
  label: string;
};

export function Sidebar({
  activeKey,
  bottom,
  collapsed,
  items,
  onNavigate,
  onToggleCollapsed,
  title,
}: {
  activeKey: string;
  bottom?: React.ReactNode;
  collapsed: boolean;
  items: NavItem[];
  onNavigate: (key: string) => void;
  onToggleCollapsed: () => void;
  title: string;
}) {
  const collapseLabel = collapsed ? "Expandir sidebar" : "Contraer sidebar";

  return (
    <aside className={cn("sidebar", collapsed ? "sidebar--collapsed" : "")}>
      {collapsed ? (
        <div className="sidebar__header">
          <span className="sidebar__brand" aria-label={title}>
            <NambreBrand decorative mode="mark" />
          </span>
          <Button
            aria-label={collapseLabel}
            className="sidebar__collapse"
            data-tooltip={collapseLabel}
            onClick={onToggleCollapsed}
            title={collapseLabel}
            variant="ghost"
          >
            <PanelLeftOpen size={18} />
          </Button>
        </div>
      ) : (
        <div className="sidebar__header">
          <span className="sidebar__brand" aria-label={title}>
            <NambreBrand mode="horizontal" />
          </span>
          <Button
            aria-label={collapseLabel}
            className="sidebar__collapse"
            onClick={onToggleCollapsed}
            title={collapseLabel}
            variant="ghost"
          >
            <PanelLeftClose size={18} />
          </Button>
        </div>
      )}
      <nav className="sidebar__nav" aria-label="Navegación principal">
        {items.map((item) => (
          <button
            aria-current={activeKey === item.key ? "page" : undefined}
            aria-label={collapsed ? item.label : undefined}
            className={cn("sidebar__link", activeKey === item.key ? "is-active" : "")}
            data-tooltip={collapsed ? item.label : undefined}
            key={item.key}
            onClick={() => onNavigate(item.key)}
            title={collapsed ? item.label : undefined}
            type="button"
          >
            <span className="sidebar__icon">{item.icon}</span>
            {collapsed ? null : <span>{item.label}</span>}
          </button>
        ))}
      </nav>
      {bottom ? <div className="sidebar__bottom">{bottom}</div> : null}
    </aside>
  );
}
