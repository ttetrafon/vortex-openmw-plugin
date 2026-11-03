import React from "react";
import { Button } from "react-bootstrap";
import { useTranslation } from "react-i18next";

import type { ISubgroup } from "./reducers";
import { sortGroups } from "./sort";

const COLS = 5;
const X_STEP = 190;
const Y_STEP = 110;
const PAD = 70;

// the vertical layout: one column in load order with the names next to the nodes, for names that
// are too long to fit between the nodes of the other layout
const V_X = 70; // x of the nodes, there is room on the left for the arcs of rules that skip nodes
const V_TOP = 24;
const V_STEP = 34;
const V_CHAR_WIDTH = 8; // estimated width of a character of the name
const V_LABEL_GAP = 16;

interface IProps {
  groups: ISubgroup[];
  id: string;
  selected?: string | undefined;
  onSelect?: ((name: string | undefined) => void) | undefined;
  onAdd?: ((name: string) => void) | undefined;
  onRemove?: ((name: string) => void) | undefined;
  onAddRule: (group: string, after: string) => void;
  onRemoveRule: (group: string, after: string) => void;
  label?: ((name: string) => string) | undefined;
  /** Lists the nodes in one column with their names on the right, for long names. */
  vertical?: boolean | undefined;
}

function GroupGraph(props: IProps) {
  const { groups, id, selected, onSelect, onAdd, onRemove, onAddRule, onRemoveRule, label, vertical } = props;
  const { t } = useTranslation();
  const [newName, setNewName] = React.useState("");
  // used for ctrl+click rules when the parent doesn't track the selection
  const [localSelected, setLocalSelected] = React.useState<string | undefined>(undefined);
  const current = onSelect !== undefined ? selected : localSelected;
  const select = onSelect ?? setLocalSelected;

  const sorted = React.useMemo(() => sortGroups(groups), [groups]);
  const labelOf = (name: string): string => (label !== undefined ? label(name) : name);
  const pos = new Map<string, { x: number; y: number }>();
  sorted.forEach((g, idx) => {
    if (vertical) {
      pos.set(g.name, { x: V_X, y: V_TOP + idx * V_STEP });
      return;
    }
    // snake layout: even rows go left to right, odd rows right to left
    const row = Math.floor(idx / COLS);
    const col = idx % COLS;
    pos.set(g.name, {
      x: PAD + (row % 2 === 0 ? col : COLS - 1 - col) * X_STEP,
      y: PAD + row * Y_STEP,
    });
  });
  const longest = Math.max(0, ...sorted.map((g) => labelOf(g.name).length));
  const width = vertical
    ? V_X + V_LABEL_GAP + longest * V_CHAR_WIDTH + V_TOP
    : PAD * 2 + (COLS - 1) * X_STEP;
  const height = vertical
    ? V_TOP * 2 + Math.max(0, sorted.length - 1) * V_STEP
    : PAD * 2 + Math.max(0, Math.ceil(sorted.length / COLS) - 1) * Y_STEP;

  // The line of a rule. Vertically, a rule between nodes that aren't next to each other is an arc on
  // the left, so that it doesn't run through the nodes in between.
  const edgePath = (from: { x: number; y: number }, to: { x: number; y: number }): string => {
    const span = Math.abs(to.y - from.y) / V_STEP;
    if (!vertical || span <= 1) return `M ${from.x} ${from.y} L ${to.x} ${to.y}`;
    const bend = Math.min(14 + 8 * span, V_X - 14);
    return `M ${from.x} ${from.y} Q ${from.x - bend * 2} ${(from.y + to.y) / 2} ${to.x} ${to.y}`;
  };
  const marker = `${id}-arrow`;

  const add = () => {
    const name = newName.trim();
    if (name.length === 0) return;
    onAdd?.(name);
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
      <div style={vertical ? { overflow: "auto", maxHeight: "55vh" } : undefined}>
      <svg
        {...(vertical
          ? { width, height, style: { display: "block" } }
          : { width: "100%", style: { maxHeight: "40vh" } })}
        viewBox={`0 0 ${width} ${height}`}
      >
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
            const d = edgePath(from, to);
            return (
              <g
                key={`${a}->${g.name}`}
                style={{ cursor: "pointer" }}
                onContextMenu={(e) => {
                  e.preventDefault();
                  onRemoveRule(g.name, a);
                }}
              >
                <path d={d} fill="none" stroke="#888" strokeWidth={2} markerEnd={`url(#${marker})`} />
                {/* a wider line that can't be seen, so that the rule is easier to hit */}
                <path d={d} fill="none" stroke="transparent" strokeWidth={12} />
              </g>
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
                if (onRemove === undefined) return;
                onRemove(g.name);
                if (current === g.name) select(undefined);
              }}
            >
              <circle cx={p.x} cy={p.y} r={9} fill={current === g.name ? "#8ab4ff" : "#888"} />
              {vertical ? (
                <text x={p.x + V_LABEL_GAP} y={p.y + 5} fontSize={14} fill="currentColor">
                  {labelOf(g.name)}
                </text>
              ) : (
                <text x={p.x} y={p.y - 16} textAnchor="middle" fontSize={14} fill="currentColor">
                  {labelOf(g.name)}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      </div>
      {onAdd !== undefined ? (
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
      ) : null}
    </div>
  );
}

export default GroupGraph;
