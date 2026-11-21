import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { compileWorkflow } from '../archify/renderers/workflow/workflow-compiler.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cli = path.join(root, 'archify/bin/archify.mjs');

// The reported stack. Restating the automatic bottom/top ports must not move
// the columns or widen the canvas; the route already stays below the title.
function releaseFlow({ laneLabel = 'Pipeline', pinStack = true, stackSides = 'both' } = {}) {
  const stackPins = stackSides === 'target'
    ? { toSide: 'top' }
    : { fromSide: 'bottom', toSide: 'top' };
  return {
    schema_version: 2,
    diagram_type: 'workflow',
    meta: { title: 'Release flow', output: 'stack.html' },
    lanes: [{ id: 'pipe', label: laneLabel }],
    nodes: [
      { id: 'a', lane: 'pipe', col: 0, type: 'backend', label: 'Compile', sublabel: 'build sources', yOffset: -90 },
      { id: 'b', lane: 'pipe', col: 0, type: 'backend', label: 'Test', sublabel: 'run the suite', yOffset: 0 },
      { id: 'c', lane: 'pipe', col: 0, type: 'backend', label: 'Package', sublabel: 'make artifacts', yOffset: 90 },
      { id: 's1', lane: 'pipe', col: 1, type: 'backend', label: 'Review', sublabel: 'checks the change and its tests' },
      { id: 's2', lane: 'pipe', col: 2, type: 'backend', label: 'Approve', sublabel: 'signs off on the release scope' },
      { id: 's3', lane: 'pipe', col: 3, type: 'backend', label: 'Deploy', sublabel: 'rolls out to every environment' },
      { id: 's4', lane: 'pipe', col: 4, type: 'backend', label: 'Verify', sublabel: 'runs smoke tests in production' },
      { id: 's5', lane: 'pipe', col: 5, type: 'backend', label: 'Announce', sublabel: 'posts release notes to channel' },
    ],
    edges: [
      { id: 'ab', from: 'a', to: 'b', ...(pinStack ? stackPins : {}) },
      { id: 'bc', from: 'b', to: 'c', ...(pinStack ? stackPins : {}) },
      { id: 'c1', from: 'c', to: 's1', label: 'hand off' },
      { id: 'e1', from: 's1', to: 's2', label: 'next step' },
      { id: 'e2', from: 's2', to: 's3', label: 'next step' },
      { id: 'e3', from: 's3', to: 's4', label: 'next step' },
      { id: 'e4', from: 's4', to: 's5', label: 'next step' },
    ],
  };
}

function geometry(workflow, qualityProfile) {
  const result = compileWorkflow({ workflow, qualityProfile });
  const diagnostics = result.diagnostics ?? result.receipt?.diagnostics ?? [];
  assert.equal(result.ok, true, JSON.stringify(diagnostics, null, 2));
  assert.equal(
    diagnostics.some((diagnostic) => diagnostic.code === 'workflow/sublabel-readability'),
    false,
  );
  return {
    viewBox: result.receipt.viewBox,
    columns: result.receipt.columns,
    edges: result.receipt.edges.map((edge) => [edge.id, edge.points]),
    nodes: result.receipt.nodes.map((node) => [node.id, node.x, node.y, node.width, node.height]),
  };
}

test('explicit facing top ports on a same-lane stack keep the automatic columns', () => {
  for (const qualityProfile of ['standard', 'showcase']) {
    for (const stackSides of ['both', 'target']) {
      const pinned = geometry(releaseFlow({ pinStack: true, stackSides }), qualityProfile);
      const automatic = geometry(releaseFlow({ pinStack: false }), qualityProfile);
      assert.deepEqual(pinned, automatic, `${qualityProfile} ${stackSides}`);
      const longerTitle = geometry(releaseFlow({
        laneLabel: 'Build pipeline',
        pinStack: true,
        stackSides,
      }), qualityProfile);
      assert.deepEqual(
        longerTitle.columns,
        pinned.columns,
        `${qualityProfile} ${stackSides}: a longer lane title must not slide a below-title stack`,
      );
      assert.deepEqual(longerTitle.edges, pinned.edges);
    }
  }
});

test('a top corridor that actually crosses a lane title still clears that title', () => {
  const crossLane = (lowerLabel) => ({
    schema_version: 2,
    diagram_type: 'workflow',
    meta: { title: 'Cross lane', output: 'cross.html', legend: { mode: 'hidden' } },
    lanes: [{ id: 'top', label: 'Top' }, { id: 'bottom', label: lowerLabel }],
    nodes: [
      { id: 'a', lane: 'top', col: 0, type: 'backend', label: 'A' },
      { id: 'b', lane: 'bottom', col: 0, type: 'database', label: 'B' },
    ],
    edges: [{ id: 'ab', from: 'a', to: 'b', fromSide: 'bottom', toSide: 'top' }],
  });
  const aboveStack = (label) => ({
    schema_version: 2,
    diagram_type: 'workflow',
    meta: { title: 'Above stack', output: 'above.html', legend: { mode: 'hidden' } },
    lanes: [{ id: 'pipe', label }],
    nodes: [
      { id: 'a', lane: 'pipe', col: 0, type: 'backend', label: 'A', yOffset: -90 },
      { id: 'b', lane: 'pipe', col: 0, type: 'backend', label: 'B', yOffset: 90 },
      { id: 's', lane: 'pipe', col: 2, type: 'backend', label: 'S', sublabel: 'checks the change and its tests' },
    ],
    edges: [
      { id: 'ab', from: 'a', to: 'b', fromSide: 'top', toSide: 'bottom' },
      { id: 'bs', from: 'b', to: 's', label: 'hand' },
    ],
  });

  for (const qualityProfile of ['standard', 'showcase']) {
    const shortCross = geometry(crossLane('B'), qualityProfile);
    const longCross = geometry(crossLane('Responsibility owner'), qualityProfile);
    assert.ok(
      longCross.columns[0] > shortCross.columns[0],
      `${qualityProfile}: a longer lower-lane title must move the same-column top corridor right`,
    );
    for (const layout of [shortCross, longCross]) {
      const points = layout.edges.find(([id]) => id === 'ab')[1];
      assert.equal(points.length, 2, JSON.stringify(points));
      assert.equal(points[0][0], points[1][0]);
      assert.equal(points[0][0], layout.columns[0]);
    }

    const shortAbove = geometry(aboveStack('Pipeline'), qualityProfile);
    const longAbove = geometry(aboveStack('Responsibility owner'), qualityProfile);
    assert.ok(
      longAbove.columns[0] > shortAbove.columns[0],
      `${qualityProfile}: a top port above the stack must still clear a longer lane title`,
    );
  }
});

test('public validation of the reported stack accepts the pinned and automatic documents together', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'archify-stack-top-'));
  const run = (workflow) => {
    const input = path.join(directory, `${workflow.lanes[0].label.replaceAll(' ', '-')}.workflow.json`);
    fs.writeFileSync(input, JSON.stringify(workflow));
    return spawnSync(process.execPath, [
      cli, 'validate', 'workflow', input, '--layout-json', '--quality', 'showcase', '--json',
    ], {
      encoding: 'utf8',
      env: { ...process.env, ARCHIFY_UPDATE_CHECK_DISABLED: '1' },
    });
  };
  try {
    const pinned = run(releaseFlow());
    const automatic = run(releaseFlow({ pinStack: false }));
    assert.equal(pinned.status, 0, pinned.stdout + pinned.stderr);
    assert.equal(automatic.status, 0, automatic.stdout + automatic.stderr);
    const pinnedReceipt = JSON.parse(pinned.stdout);
    const automaticReceipt = JSON.parse(automatic.stdout);
    assert.deepEqual(pinnedReceipt.viewBox, automaticReceipt.viewBox);
    assert.deepEqual(pinnedReceipt.columns, automaticReceipt.columns);
    assert.deepEqual(
      pinnedReceipt.edges.map((edge) => [edge.id, edge.points]),
      automaticReceipt.edges.map((edge) => [edge.id, edge.points]),
    );
    assert.equal(pinnedReceipt.diagnostics.length, 0);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
