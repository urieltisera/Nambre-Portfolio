import React from "react";
import {PanelLeftClose, PanelLeftOpen} from "lucide-react";
import {MenuFlowBrand} from "@/components/brand/MenuFlowBrand";
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
  return (
    <aside className={cn("sidebar", collapsed ? "sidebar--collapsed" : "")}>
      <div className="sidebar__header">
        <span className="sidebar__brand" aria-label={title}>
          <MenuFlowBrand mode={collapsed ? "mark" : "horizontal"} />
        </span>
        <Button
          aria-label={collapsed ? "Expandir sidebar" : "Contraer sidebar"}
          className="sidebar__collapse"
          onClick={onToggleCollapsed}
          data-tooltip={collapsed ? "Expandir sidebar" : undefined}
          title={collapsed ? "Expandir sidebar" : "Contraer sidebar"}
          variant="ghost"
        >
          {collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
        </Button>
      </div>
      <nav className="sidebar__nav" aria-label="Navegación principal">
        {items.map((item) => (
          <button
            aria-label={collapsed ? item.label : undefined}
            className={cn("sidebar__link", activeKey === item.key ? "is-active" : "")}
            data-tooltip={collapsed ? item.label : undefined}
            key={item.key}
            onClick={() => onNavigate(item.key)}
            title={collapsed ? item.label : undefined}
            type="button"
          >
            <span className="sidebar__icon">{item.icon}</span>
            {!collapsed ? <span>{item.label}</span> : null}
          </button>
        ))}
      </nav>
      {bottom ? <div className="sidebar__bottom">{bottom}</div> : null}
    </aside>
  );
}
