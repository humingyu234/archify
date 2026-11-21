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

function labelOffsetDocument() {
  return {
    schema_version: 2,
    diagram_type: 'workflow',
    meta: { title: 'Label offset side effect', output: 'label-offset.html' },
    lanes: [
      { id: 'req', label: 'Requests' },
      { id: 'svc', label: 'Services' },
    ],
    nodes: [
      { id: 'req0', lane: 'req', col: 0, type: 'external', label: 'Client' },
      { id: 'req1', lane: 'req', col: 1, type: 'backend', label: 'Gateway' },
      { id: 'req2', lane: 'req', col: 2, type: 'backend', label: 'Auth' },
      { id: 'svc2', lane: 'svc', col: 2, type: 'backend', label: 'Stock' },
      { id: 'svc3', lane: 'svc', col: 3, type: 'backend', label: 'Payments' },
    ],
    edges: [
      { id: 'req0-req1', from: 'req0', to: 'req1', label: 'next' },
      { id: 'req1-req2', from: 'req1', to: 'req2', label: 'next' },
      { id: 'req0-req2', from: 'req0', to: 'req2', label: 'skip' },
      { id: 'req2-svc2', from: 'req2', to: 'svc2', label: 'check' },
      { id: 'svc2-svc3', from: 'svc2', to: 'svc3', label: 'next' },
    ],
  };
}

function compile(workflow, qualityProfile) {
  return compileWorkflow({ workflow, qualityProfile });
}

function routes(result) {
  return result.receipt.edges.map((edge) => [edge.id, edge.points]);
}

function labels(result) {
  return result.receipt.labels.map((label) => [label.edge, label.x, label.y]);
}

test('a relative label offset moves only that label', () => {
  for (const qualityProfile of ['standard', 'showcase']) {
    for (const [field, delta] of [['labelDy', 4], ['labelDx', 4], ['labelDy', 0], ['labelDx', 0]]) {
      const automatic = compile(labelOffsetDocument(), qualityProfile);
      const nudged = labelOffsetDocument();
      nudged.edges.find((edge) => edge.id === 'svc2-svc3')[field] = delta;
      const result = compile(nudged, qualityProfile);
      assert.equal(automatic.ok, true, JSON.stringify(automatic.diagnostics));
      assert.equal(result.ok, true, `${qualityProfile} ${field} ${delta}: ${JSON.stringify(result.diagnostics)}`);
      assert.deepEqual(result.receipt.viewBox, automatic.receipt.viewBox);
      assert.deepEqual(routes(result), routes(automatic), `${qualityProfile} ${field}`);
      const automaticLabels = new Map(labels(automatic).map(([edge, x, y]) => [edge, [x, y]]));
      for (const [edge, x, y] of labels(result)) {
        const [ax, ay] = automaticLabels.get(edge);
        const dx = edge === 'svc2-svc3' && field === 'labelDx' ? delta : 0;
        const dy = edge === 'svc2-svc3' && field === 'labelDy' ? delta : 0;
        assert.deepEqual([x - ax, y - ay], [dx, dy], `${qualityProfile} ${field} ${edge}`);
      }
    }
  }
});

function orderPlatform() {
  const lanes = ['req', 'svc', 'data'];
  const names = {
    req: ['Client', 'Gateway', 'Auth', 'Quota', 'Router', 'Reply'],
    svc: ['Orders', 'Pricing', 'Stock', 'Payments', 'Shipping', 'Notify'],
    data: ['Cache', 'Orders DB', 'Ledger', 'Events', 'Search', 'Archive'],
  };
  const subs = {
    req: ['client step', 'gateway step', 'auth step', 'quota step', 'router step', 'reply step'],
    svc: ['orders step', 'pricing step', 'stock step', 'payments step', 'shipping step', 'notify step'],
    data: ['cache step', 'orders db step', 'ledger step', 'events step', 'search step', 'archive step'],
  };
  const edges = [
    ['req0-req1', 'req0', 'req1', 'next'], ['req1-req2', 'req1', 'req2', 'next'],
    ['req2-req3', 'req2', 'req3', 'next'], ['req3-req4', 'req3', 'req4', 'next'],
    ['req4-req5', 'req4', 'req5', 'next'], ['svc0-svc1', 'svc0', 'svc1', 'next'],
    ['svc1-svc2', 'svc1', 'svc2', 'next'], ['svc2-svc3', 'svc2', 'svc3', 'next'],
    ['svc3-svc4', 'svc3', 'svc4', 'next'], ['svc4-svc5', 'svc4', 'svc5', 'next'],
    ['data0-data1', 'data0', 'data1', 'next'], ['data1-data2', 'data1', 'data2', 'next'],
    ['data2-data3', 'data2', 'data3', 'next'], ['data3-data4', 'data3', 'data4', 'next'],
    ['data4-data5', 'data4', 'data5', 'next'], ['req2-svc2', 'req2', 'svc2', 'check'],
    ['svc0-data1', 'svc0', 'data1', 'save'], ['svc3-data2', 'svc3', 'data2', 'post'],
    ['data3-svc4', 'data3', 'svc4', 'event'], ['req0-req2', 'req0', 'req2', 'skip'],
    ['svc1-svc3', 'svc1', 'svc3', 'batch'], ['req4-req3', 'req4', 'req3', 'retry'],
    ['req1-svc0', 'req1', 'svc0', 'order'], ['svc2-req3', 'svc2', 'req3', 'reserve'],
    ['svc5-data5', 'svc5', 'data5', 'archive'],
  ];
  return {
    schema_version: 2,
    diagram_type: 'workflow',
    meta: { title: 'Order platform', output: 'platform.html' },
    lanes: lanes.map((id) => ({ id, label: id === 'req' ? 'Requests' : id === 'svc' ? 'Services' : 'Data' })),
    nodes: lanes.flatMap((lane) => names[lane].map((label, col) => ({
      id: `${lane}${col}`, lane, col, type: 'backend', label, sublabel: subs[lane][col],
    }))),
    edges: edges.map(([id, from, to, label]) => ({ id, from, to, label })),
  };
}

test('one labelDy on the 18-node workflow does not reroute any edge', () => {
  const qualityProfile = 'showcase';
  const automatic = compile(orderPlatform(), qualityProfile);
  assert.equal(automatic.ok, true, JSON.stringify(automatic.diagnostics));
  for (const edge of orderPlatform().edges) {
    const nudged = orderPlatform();
    nudged.edges.find((candidate) => candidate.id === edge.id).labelDy = 4;
    const result = compile(nudged, qualityProfile);
    assert.deepEqual(routes(result), routes(automatic), edge.id);
    for (const [id, x, y] of labels(automatic)) {
      const moved = labels(result).find(([candidate]) => candidate === id);
      assert.ok(moved, id);
      if (id === edge.id) assert.deepEqual([moved[1], moved[2]], [x, y + 4], edge.id);
      else assert.deepEqual([moved[1], moved[2]], [x, y], `${edge.id} moved ${id}`);
    }
    if (result.ok) {
      assert.deepEqual(result.receipt.viewBox, automatic.receipt.viewBox, edge.id);
      continue;
    }
    assert.deepEqual(result.receipt.requiredViewBox, automatic.receipt.viewBox, edge.id);
    assert.ok(result.diagnostics.length > 0, edge.id);
    assert.ok(result.diagnostics.every((diagnostic) => (
      diagnostic.message?.includes(`"${edge.id}"`)
      || diagnostic.subject?.edge === edge.id
    )), JSON.stringify(result.diagnostics, null, 2));
  }
});

test('an automatic labelAt stays put when labelDy is also set', () => {
  const document = (route) => ({
    schema_version: 2,
    diagram_type: 'workflow',
    meta: { title: 'Absolute label', output: 'abs.html', legend: { mode: 'hidden' } },
    lanes: [{ id: 'top', label: 'Top' }, { id: 'bottom', label: 'Bottom' }],
    nodes: [
      { id: 'a', lane: 'top', col: 0, type: 'backend', label: 'A' },
      { id: 'b', lane: 'bottom', col: 0, type: 'backend', label: 'B' },
      { id: 'c', lane: 'top', col: 1, type: 'backend', label: 'C' },
      { id: 'd', lane: 'bottom', col: 1, type: 'backend', label: 'D' },
    ],
    edges: [
      { id: 'ab', from: 'a', to: 'b', label: 'down' },
      {
        id: 'cd', from: 'c', to: 'd', label: 'down',
        labelAt: [154.2, 181], labelDy: 12,
        ...(route ? { route } : {}),
      },
    ],
  });
  for (const route of [undefined, 'straight']) {
    const result = compile(document(route), 'showcase');
    assert.equal(result.ok, true, JSON.stringify(result.diagnostics));
    const label = result.receipt.labels.find((entry) => entry.edge === 'cd');
    assert.deepEqual([label.x, label.y], [154.2, 181], route || 'auto');
  }
});

function singleColumnChain(extra) {
  return {
    schema_version: 2,
    diagram_type: 'workflow',
    meta: { title: 'Chain', output: 'chain.html', legend: { mode: 'hidden' } },
    lanes: [{ id: 'main', label: 'Main' }],
    nodes: [
      { id: 'a', lane: 'main', col: 0, type: 'backend', label: 'A' },
      { id: 'b', lane: 'main', col: 0, type: 'backend', label: 'B' },
      { id: 'c', lane: 'main', col: 0, type: 'backend', label: 'C' },
    ],
    edges: [
      { id: 'ab', from: 'a', to: 'b', label: 'next' },
      { id: 'bc', from: 'b', to: 'c', label: 'next', ...extra },
    ],
  };
}

test('a label offset on a single-column chain keeps the automatic stack gaps', () => {
  const automatic = compile(singleColumnChain(), 'showcase');
  assert.equal(automatic.ok, true, JSON.stringify(automatic.diagnostics));
  assert.deepEqual(automatic.receipt.nodes.map((node) => [node.id, node.y]), [
    ['a', 86], ['b', 176], ['c', 266],
  ]);
  assert.deepEqual(routes(automatic), [
    ['ab', [[118, 138], [118, 176]]],
    ['bc', [[118, 228], [118, 266]]],
  ]);
  for (const [field, delta] of [['labelDy', 0], ['labelDy', 4], ['labelDx', 0]]) {
    const result = compile(singleColumnChain({ [field]: delta }), 'showcase');
    assert.equal(result.ok, true, `${field} ${delta}: ${JSON.stringify(result.diagnostics)}`);
    assert.deepEqual(
      result.receipt.nodes.map((node) => [node.id, node.y]),
      automatic.receipt.nodes.map((node) => [node.id, node.y]),
    );
    assert.deepEqual(routes(result), routes(automatic));
    const moved = new Map(labels(result).map(([edge, x, y]) => [edge, [x, y]]));
    for (const [edge, x, y] of labels(automatic)) {
      const [nx, ny] = moved.get(edge);
      const dx = edge === 'bc' && field === 'labelDx' ? delta : 0;
      const dy = edge === 'bc' && field === 'labelDy' ? delta : 0;
      assert.deepEqual([nx - x, ny - y], [dx, dy], `${field} ${edge}`);
    }
  }
  for (const extra of [{ labelSegment: 0 }, { bias: 0.5 }]) {
    const result = compile(singleColumnChain(extra), 'showcase');
    assert.equal(result.ok, false, JSON.stringify(extra));
    assert.ok(result.diagnostics.some((diagnostic) => diagnostic.code === 'workflow/node-overlap'));
  }
});

test('public validation keeps the reported routes when one labelDy is added', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'archify-label-dy-'));
  const run = (workflow, name) => {
    const input = path.join(directory, name);
    fs.writeFileSync(input, JSON.stringify(workflow));
    return spawnSync(process.execPath, [
      cli, 'validate', 'workflow', input, '--layout-json', '--quality', 'showcase', '--json',
    ], {
      encoding: 'utf8',
      env: { ...process.env, ARCHIFY_UPDATE_CHECK_DISABLED: '1' },
    });
  };
  try {
    const automatic = run(labelOffsetDocument(), 'automatic.workflow.json');
    const nudgedDocument = labelOffsetDocument();
    nudgedDocument.edges.find((edge) => edge.id === 'svc2-svc3').labelDy = 4;
    const nudged = run(nudgedDocument, 'nudged.workflow.json');
    assert.equal(automatic.status, 0, automatic.stdout + automatic.stderr);
    assert.equal(nudged.status, 0, nudged.stdout + nudged.stderr);
    const before = JSON.parse(automatic.stdout);
    const after = JSON.parse(nudged.stdout);
    assert.deepEqual(after.viewBox, before.viewBox);
    assert.deepEqual(
      after.edges.map((edge) => [edge.id, edge.points]),
      before.edges.map((edge) => [edge.id, edge.points]),
    );
    const beforeLabel = before.labels.find((label) => label.edge === 'svc2-svc3');
    const afterLabel = after.labels.find((label) => label.edge === 'svc2-svc3');
    assert.equal(afterLabel.x, beforeLabel.x);
    assert.equal(afterLabel.y, beforeLabel.y + 4);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
