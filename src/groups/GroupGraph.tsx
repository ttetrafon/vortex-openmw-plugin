import React from "react";
import { Button } from "react-bootstrap";
import { useTranslation } from "react-i18next";

import type { ISubgroup } from "./reducers";
import { sortGroups } from "./sort";

const COLS = 5;
const X_STEP = 190;
const Y_STEP = 110;
const PAD = 70;

interface IProps {
  groups: ISubgroup[];
  /** Part of the SVG marker id, has to be unique per graph on the page. */
  id: string;
  selected?: string | undefined;
  onSelect?: ((name: string | undefined) => void) | undefined;
  onAdd: (name: string) => void;
  onRemove: (name: string) => void;
  onAddRule: (group: string, after: string) => void;
  onRemoveRule: (group: string, after: string) => void;
}

function GroupGraph(props: IProps) {
  const { groups, id, selected, onSelect, onAdd, onRemove, onAddRule, onRemoveRule } = props;
  const { t } = useTranslation();
  const [newName, setNewName] = React.useState("");
  // used for ctrl+click rules when the parent doesn't track the selection
  const [localSelected, setLocalSelected] = React.useState<string | undefined>(undefined);
  const current = onSelect !== undefined ? selected : localSelected;
  const select = onSelect ?? setLocalSelected;

  const sorted = React.useMemo(() => sortGroups(groups), [groups]);
  // snake layout: even rows go left to right, odd rows right to left
  const pos = new Map<string, { x: number; y: number }>();
  sorted.forEach((g, idx) => {
    const row = Math.floor(idx / COLS);
    const col = idx % COLS;
    pos.set(g.name, {
      x: PAD + (row % 2 === 0 ? col : COLS - 1 - col) * X_STEP,
      y: PAD + row * Y_STEP,
    });
  });
  const width = PAD * 2 + (COLS - 1) * X_STEP;
  const height = PAD * 2 + Math.max(0, Math.ceil(sorted.length / COLS) - 1) * Y_STEP;
  const marker = `${id}-arrow`;

  const add = () => {
    const name = newName.trim();
    if (name.length === 0) return;
    onAdd(name);
    setNewName("");
  };

  // plain click selects a group, ctrl+click on another one defines "selected loads before clicked"
  const onNodeClick = (evt: React.MouseEvent, name: string) => {
    if (evt.ctrlKey && current !== undefined && current !== name) {
      onAddRule(name, current);
    } else {
      select(name);
    }
  };

  return (
    <div>
      <svg width="100%" viewBox={`0 0 ${width} ${height}`} style={{ maxHeight: "40vh" }}>
        <defs>
          <marker id={marker} viewBox="0 0 10 10" refX="14" refY="5" markerWidth="6" markerHeight="6" orient="auto">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#888" />
          </marker>
        </defs>
        {sorted.flatMap((g) =>
          g.after.map((a) => {
            const from = pos.get(a);
            const to = pos.get(g.name);
            if (from === undefined || to === undefined) return null;
            return (
              <line
                key={`${a}->${g.name}`}
                x1={from.x}
                y1={from.y}
                x2={to.x}
                y2={to.y}
                stroke="#888"
                strokeWidth={2}
                markerEnd={`url(#${marker})`}
                style={{ cursor: "pointer" }}
                onContextMenu={(e) => {
                  e.preventDefault();
                  onRemoveRule(g.name, a);
                }}
              />
            );
          }),
        )}
        {sorted.map((g) => {
          const p = pos.get(g.name)!;
          return (
            <g
              key={g.name}
              style={{ cursor: "pointer" }}
              onClick={(e) => onNodeClick(e, g.name)}
              onContextMenu={(e) => {
                e.preventDefault();
                onRemove(g.name);
                if (current === g.name) select(undefined);
              }}
            >
              <circle cx={p.x} cy={p.y} r={9} fill={current === g.name ? "#8ab4ff" : "#888"} />
              <text x={p.x} y={p.y - 16} textAnchor="middle" fontSize={14} fill="currentColor">
                {g.name}
              </text>
            </g>
          );
        })}
      </svg>
      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
        <input
          className="form-control"
          value={newName}
          placeholder={t("New group name")}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
        />
        <Button onClick={add}>{t("Add")}</Button>
      </div>
    </div>
  );
}

export default GroupGraph;
