"use client";

import { useMemo, useState } from "react";
import type { ComponentRecord, DependencyRelationship } from "@/lib/api";
import { AlertTriangleIcon, ChevronDownIcon, ChevronRightIcon, GitForkIcon } from "@/components/Icons";

type Node = {
  key: string; // purl
  name: string;
  version: string;
  component?: ComponentRecord;
  path: string;
  children: Node[];
};

function buildTree(components: ComponentRecord[], edges: DependencyRelationship[]): Node[] {
  const byPurl = new Map(components.map((component) => [component.purl, component]));
  const childKeys = new Set(edges.map((edge) => edge.child.purl));
  const childrenOf = new Map<string, Array<Omit<Node, "children" | "path">>>();
  for (const edge of edges) {
    const list = childrenOf.get(edge.parent.purl) || [];
    list.push({ key: edge.child.purl, name: edge.child.name, version: edge.child.version, component: byPurl.get(edge.child.purl) });
    childrenOf.set(edge.parent.purl, list);
  }

  let rootComponents = components.filter((component) => component.dependencyType === "DIRECT");
  if (!rootComponents.length) rootComponents = components.filter((component) => !childKeys.has(component.purl));

  function attach(node: Omit<Node, "children" | "path">, parentPath: string, stack: Set<string>): Node {
    const path = `${parentPath}/${node.key}`;
    const kids = (childrenOf.get(node.key) || [])
      .filter((child) => !stack.has(child.key))
      .map((child) => attach(child, path, new Set([...stack, node.key])));
    return { ...node, path, children: kids };
  }

  return rootComponents.map((component) => attach({ key: component.purl, name: component.name, version: component.version, component }, "", new Set([component.purl])));
}

function subtreeMatches(node: Node, query: string): boolean {
  const haystack = `${node.name} ${node.version} ${node.key}`.toLowerCase();
  if (haystack.includes(query)) return true;
  return node.children.some((child) => subtreeMatches(child, query));
}

const severityWeight: Record<string, number> = { CRITICAL: 4, HIGH: 3, MODERATE: 2, MEDIUM: 2, LOW: 1 };

function worstSeverity(node: Node): string | null {
  let worst: string | null = null;
  for (const vuln of node.component?.vulnerabilities || []) {
    const severity = (vuln.severity || "").toUpperCase();
    if (!worst || (severityWeight[severity] || 0) > (severityWeight[worst] || 0)) worst = severity;
  }
  return worst;
}

const severityBadge: Record<string, string> = {
  CRITICAL: "bg-red-100 text-red-800 border-red-200",
  HIGH: "bg-orange-100 text-orange-800 border-orange-200",
  MODERATE: "bg-amber-100 text-amber-800 border-amber-200",
  MEDIUM: "bg-amber-100 text-amber-800 border-amber-200",
  LOW: "bg-sky-100 text-sky-800 border-sky-200",
};

function TreeNode({ node, depth, expanded, toggle, query }: { node: Node; depth: number; expanded: Record<string, boolean>; toggle: (path: string) => void; query: string }) {
  const hasChildren = node.children.length > 0;
  const isOpen = query ? true : expanded[node.path] !== false;
  const severity = worstSeverity(node);
  const vulnCount = node.component?.vulnerabilities.length || 0;
  const licenseUnknown = node.component && !node.component.licenseExpression;
  const isMatch = query && `${node.name} ${node.version}`.toLowerCase().includes(query);

  return (
    <li>
      <div className={`flex items-center gap-1.5 rounded-md px-1.5 py-1 ${isMatch ? "bg-violet-50 ring-1 ring-violet-200" : ""}`}>
        {hasChildren ? (
          <button type="button" onClick={() => toggle(node.path)} aria-label={isOpen ? "Collapse" : "Expand"} aria-expanded={isOpen} className="rounded p-0.5 text-muted hover:text-ink">
            {isOpen ? <ChevronDownIcon className="h-3.5 w-3.5" /> : <ChevronRightIcon className="h-3.5 w-3.5" />}
          </button>
        ) : (
          <span className="w-5" aria-hidden="true" />
        )}
        <span className={`font-mono text-[11.5px] ${depth === 0 ? "font-bold text-ink" : "text-muted"}`}>{node.name}</span>
        <span className="font-mono text-[10.5px] text-muted-light">@{node.version}</span>
        {depth === 0 ? <span className="rounded bg-brand-tint px-1 py-0.5 text-[9px] font-bold uppercase tracking-wide text-brand-dark">direct</span> : null}
        {licenseUnknown ? <span title="License unknown / needs review" className="h-2 w-2 rounded-full bg-amber-400" aria-label="License unknown" /> : null}
        {vulnCount ? (
          <span title={node.component?.vulnerabilities.map((v) => v.osvId).join(", ")} className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[9px] font-bold ${severity ? severityBadge[severity] : "bg-chip text-muted border-line"}`}>
            <AlertTriangleIcon className="h-3 w-3" /> {vulnCount}
          </span>
        ) : null}
      </div>
      {hasChildren && isOpen ? (
        <ul className="ml-4 border-l border-line-soft pl-2">
          {node.children.map((child) => <TreeNode key={child.path} node={child} depth={depth + 1} expanded={expanded} toggle={toggle} query={query} />)}
        </ul>
      ) : null}
    </li>
  );
}

export function DependencyTreeGraph({ components, dependencies, query }: { components: ComponentRecord[]; dependencies: DependencyRelationship[]; query: string }) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const normalized = query.trim().toLowerCase();
  const roots = useMemo(() => buildTree(components, dependencies), [components, dependencies]);
  const visibleRoots = useMemo(() => (normalized ? roots.filter((root) => subtreeMatches(root, normalized)) : roots), [roots, normalized]);

  function expandAll() {
    const all: Record<string, boolean> = {};
    const walk = (nodes: Node[]) => { for (const node of nodes) { all[node.path] = true; walk(node.children); } };
    walk(roots);
    setExpanded(all);
  }
  function collapseAll() {
    const all: Record<string, boolean> = {};
    const walk = (nodes: Node[], depth: number) => { for (const node of nodes) { all[node.path] = depth === 0; walk(node.children, depth + 1); } };
    walk(roots, 0);
    setExpanded(all);
  }
  const toggle = (path: string) => setExpanded((current) => ({ ...current, [path]: current[path] === false }));

  return (
    <div className="max-h-[520px] overflow-auto p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-xs text-muted">
          <GitForkIcon className="h-3.5 w-3.5 text-brand" />
          {dependencies.length} relationships · tree rooted at {roots.length} direct {roots.length === 1 ? "dependency" : "dependencies"}
          {normalized ? <span className="text-muted-light"> · filtered by “{query.trim()}”</span> : null}
        </p>
        <div className="flex gap-2">
          <button type="button" onClick={expandAll} className="rounded-md border border-line px-2 py-1 text-[10.5px] font-semibold text-ink hover:bg-panel">Expand all</button>
          <button type="button" onClick={collapseAll} className="rounded-md border border-line px-2 py-1 text-[10.5px] font-semibold text-ink hover:bg-panel">Collapse all</button>
        </div>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg bg-panel px-3 py-2 text-[10px] text-muted">
        <span className="font-bold text-ink">Legend</span>
        <span className="flex items-center gap-1"><span className="rounded bg-brand-tint px-1 text-[9px] font-bold uppercase text-brand-dark">direct</span> top-level dependency</span>
        <span className="flex items-center gap-1"><span className="inline-flex items-center gap-1 rounded-full border border-red-200 bg-red-100 px-1.5 text-[9px] font-bold text-red-800"><AlertTriangleIcon className="h-3 w-3" />2</span> OSV findings (critical/high)</span>
        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-amber-400 inline-block" /> license unknown</span>
      </div>

      {visibleRoots.length ? (
        <ul>
          {visibleRoots.map((root) => <TreeNode key={root.path} node={root} depth={0} expanded={expanded} toggle={toggle} query={normalized} />)}
        </ul>
      ) : (
        <p className="p-6 text-center text-xs text-muted">No dependency branches match “{query.trim()}”.</p>
      )}
    </div>
  );
}
