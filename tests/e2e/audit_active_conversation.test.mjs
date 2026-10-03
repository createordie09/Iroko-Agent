// Audit — la discussion active ne change plus lorsque la liste est rechargée (discussion épinglée présente).
import { test } from 'node:test';
import assert from 'node:assert';
import { chromium } from 'playwright';
import WebSocket from 'ws';

const BASE = 'http://127.0.0.1:3001';

async function api(method, route, body) {
  const { token } = await (await fetch(`${BASE}/api/bootstrap`)).json();
  const res = await fetch(`${BASE}${route}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'X-Iroko-Request': '1', 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined
  });
  return res.json();
}

async function runMockPrompt(convId) {
  const { token } = await (await fetch(`${BASE}/api/bootstrap`)).json();
  const { ticket } = await (await fetch(`${BASE}/api/ws-ticket`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'X-Iroko-Request': '1', 'Content-Type': 'application/json' }
  })).json();
  const ws = new WebSocket(`ws://127.0.0.1:3001/ws?ticket=${ticket}`);
  await new Promise((resolve, reject) => { ws.on('open', resolve); ws.on('error', reject); });
  const done = new Promise((resolve) => {
    ws.on('message', (raw) => {
      const evt = JSON.parse(String(raw));
      if (evt.type === 'completed' || evt.type === 'error') resolve(evt);
    });
  });
  ws.send(JSON.stringify({ type: 'send_prompt', prompt: 'Relance en arrière-plan', conversationId: convId, mode: 'chat', preferredProviderId: 'mock', modelId: 'mock/test' }));
  await done;
  ws.close();
}

test('Audit — la discussion active reste la même après le rechargement de la liste (discussion épinglée présente)', async () => {
  const pinned = (await api('POST', '/api/conversations', { title: 'Epinglee-Audit' })).conversation;
  await api('PUT', `/api/conversations/${pinned.id}/pin`, { pinned: true });
  const active = (await api('POST', '/api/conversations', { title: 'Active-Audit' })).conversation;
  await api('POST', `/api/conversations/${active.id}/messages`, { role: 'user', content: 'Message initial' });

  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    await page.goto('http://127.0.0.1:5173', { waitUntil: 'networkidle' });

    await page.locator('nav button, nav [role="button"], nav a', { hasText: 'Active-Audit' }).first().click();
    const header = page.locator('header');
    await header.getByText('Active-Audit').first().waitFor({ timeout: 10000 });

    // Une tâche se termine sur la discussion affichée : l'application recharge la liste (épinglée en tête)
    await runMockPrompt(active.id);
    await page.getByText('Mode Test Hors-Ligne').first().waitFor({ timeout: 10000 });
    await page.waitForTimeout(1500);

    assert.ok(await header.getByText('Active-Audit').first().isVisible(), 'Le titre affiché doit rester celui de la discussion active');
    assert.ok(!(await header.getByText('Epinglee-Audit').count()), 'La discussion épinglée ne doit pas devenir la discussion active');
    assert.ok((await page.title()).includes('Active-Audit'), 'Le titre du document suit la discussion active');
  } finally {
    if (browser) await browser.close();
    await api('DELETE', `/api/conversations/${pinned.id}`);
    await api('DELETE', `/api/conversations/${active.id}`);
  }
});
