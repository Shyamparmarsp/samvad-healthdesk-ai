/**
 * Minimal Chrome DevTools Protocol driver (no external dependencies).
 *
 * Used by tests/api/browser/* to drive the actual built frontend. It intentionally
 * reimplements only what the journeys need: navigation, evaluation, clicking by
 * accessible text, typing, waiting for text, and reading the rendered DOM.
 */

import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME_PATH =
  process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class CdpSession {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    this.consoleErrors = [];
    this.pageErrors = [];
    this.network = [];

    ws.onmessage = (event) => {
      const message = JSON.parse(event.data);
      if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') {
        this.consoleErrors.push(
          message.params.args.map((a) => a.value ?? a.description ?? '').join(' '),
        );
      }
      if (message.method === 'Network.requestWillBeSent') {
        const url = message.params.request.url;
        if (/\/functions\/v1\/|\/auth\/v1\/|\/rest\/v1\//.test(url)) {
          this.network.push({ phase: 'request', url, method: message.params.request.method });
        }
      }
      if (message.method === 'Network.responseReceived') {
        const url = message.params.response.url;
        if (/\/functions\/v1\/|\/auth\/v1\/|\/rest\/v1\//.test(url)) {
          this.network.push({ phase: 'response', url, status: message.params.response.status });
        }
      }
      if (message.method === 'Network.loadingFailed') {
        this.network.push({ phase: 'failed', error: message.params.errorText, type: message.params.type });
      }
      if (message.method === 'Runtime.exceptionThrown') {
        this.pageErrors.push(message.params.exceptionDetails?.exception?.description ?? message.params.exceptionDetails?.text ?? 'unknown');
      }
      if (message.id && this.pending.has(message.id)) {
        const { resolve, reject } = this.pending.get(message.id);
        this.pending.delete(message.id);
        if (message.error) reject(new Error(message.error.message || JSON.stringify(message.error)));
        else resolve(message.result);
      }
    };
  }

  static async connect(wsUrl) {
    const ws = new WebSocket(wsUrl);
    await new Promise((resolve, reject) => {
      ws.onopen = resolve;
      ws.onerror = () => reject(new Error('CDP websocket failed'));
    });
    const session = new CdpSession(ws);
    await session.send('Runtime.enable');
    await session.send('Page.enable');
    await session.send('Network.enable');
    return session;
  }

  send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = ++this.id;
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async eval(expression) {
    const result = await this.send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
      userGesture: true,
    });
    if (result.exceptionDetails) {
      throw new Error(
        `eval failed: ${result.exceptionDetails.exception?.description ?? result.exceptionDetails.text}`,
      );
    }
    return result.result?.value;
  }

  bodyText() {
    return this.eval('document.body ? document.body.innerText : ""');
  }

  async goto(url) {
    await this.send('Page.navigate', { url });
    await sleep(400);
    await this.waitFor('document.readyState === "complete"', 10_000);
    await sleep(300);
  }

  async waitFor(expression, timeoutMs = 8_000) {
    const start = Date.now();
    let last;
    while (Date.now() - start < timeoutMs) {
      try {
        last = await this.eval(expression);
        if (last) return last;
      } catch {
        // page may be mid-navigation
      }
      await sleep(100);
    }
    throw new Error(`Timed out waiting for ${expression}`);
  }

  async waitForText(matcher, timeoutMs = 8_000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const text = await this.bodyText();
      const ok = typeof matcher === 'string' ? text.includes(matcher) : matcher.test(text);
      if (ok) return text;
      await sleep(120);
    }
    const text = await this.bodyText();
    throw new Error(
      `Timed out waiting for text ${String(matcher)}. Body: "${String(text).slice(0, 400).replace(/\n/g, " | ")}"`,
    );
  }

  async waitForTextGone(matcher, timeoutMs = 8_000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const text = await this.bodyText();
      const stillThere = typeof matcher === 'string' ? text.includes(matcher) : matcher.test(text);
      if (!stillThere) return text;
      await sleep(120);
    }
    throw new Error(`Timed out waiting for text to disappear: ${String(matcher)}`);
  }

  /** Clicks the first element whose accessible name or text matches. */
  async click(matcher, { selector = 'button, a, [role="button"]' } = {}) {
    // A RegExp must be passed as source+flags; String(re) would include the slashes.
    const isRegExp = matcher instanceof RegExp;
    const wanted = isRegExp ? matcher.source : String(matcher);
    const flags = isRegExp ? matcher.flags : '';
    const found = await this.eval(`(() => {
      const wanted = ${JSON.stringify(wanted)};
      const isRe = ${isRegExp};
      const re = isRe ? new RegExp(wanted, ${JSON.stringify(flags)}) : null;
      const nodes = Array.from(document.querySelectorAll(${JSON.stringify(selector)}));
      const matches = nodes.filter((node) => {
        if (node.disabled) return false;
        const label = (node.getAttribute('aria-label') || '') + ' ' + (node.innerText || node.textContent || '');
        return re ? re.test(label) : label.includes(wanted);
      });
      if (matches.length === 0) return null;
      const target = matches[0];
      target.scrollIntoView({ block: 'center' });
      target.click();
      return (target.getAttribute('aria-label') || target.innerText || '').trim().slice(0, 80);
    })()`);
    if (!found) throw new Error(`No clickable element matched ${String(matcher)}`);
    return found;
  }

  /** Clicks an element whose aria-label (or text) matches exactly. */
  async clickExact(label) {
    const clicked = await this.eval(`(() => {
      const wanted = ${JSON.stringify(label)};
      const nodes = Array.from(document.querySelectorAll('button, a, [role="button"]'));
      const node = nodes.find((n) => !n.disabled && ((n.getAttribute('aria-label') || '').trim() === wanted));
      if (!node) return false;
      node.scrollIntoView({ block: 'center' });
      node.click();
      return true;
    })()`);
    if (!clicked) throw new Error(`No element with exact aria-label "${label}"`);
  }

  async type(selectorOrPlaceholder, value) {
    const ok = await this.eval(`(() => {
      const target = document.querySelector(${JSON.stringify(selectorOrPlaceholder)})
        || document.querySelector('[placeholder="' + ${JSON.stringify(selectorOrPlaceholder)} + '"]');
      if (!target) return false;
      const proto = Object.getPrototypeOf(target);
      const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
      setter ? setter.call(target, ${JSON.stringify(value)}) : (target.value = ${JSON.stringify(value)});
      target.dispatchEvent(new Event('input', { bubbles: true }));
      target.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    })()`);
    if (!ok) throw new Error(`No input found for ${selectorOrPlaceholder}`);
  }

  async pressEnter(selector) {
    const ok = await this.eval(`(() => {
      const target = document.querySelector(${JSON.stringify(selector)});
      if (!target) return false;
      for (const type of ['keydown', 'keyup']) {
        target.dispatchEvent(new KeyboardEvent(type, { key: 'Enter', code: 'Enter', bubbles: true }));
      }
      return true;
    })()`);
    return ok;
  }

  async clearStorage() {
    await this.eval('(() => { localStorage.clear(); sessionStorage.clear(); return true; })()');
  }
}

/** Launches headless Chrome with a fake microphone and returns a connected session. */
export async function launchBrowser({ port = 9333 } = {}) {
  const profileDir = mkdtempSync(join(tmpdir(), 'samvad-cdp-'));
  const chrome = spawn(
    CHROME_PATH,
    [
      '--headless=new',
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${profileDir}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-gpu',
      '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-stream',
      '--autoplay-policy=no-user-gesture-required',
      'about:blank',
    ],
    { stdio: 'ignore' },
  );

  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (res.ok) break;
    } catch {
      // not up yet
    }
    await sleep(200);
  }

  const target = await (await fetch(`http://127.0.0.1:${port}/json/new`, { method: 'PUT' })).json();
  const session = await CdpSession.connect(target.webSocketDebuggerUrl);

  return {
    session,
    async close() {
      try {
        await session.send('Browser.close');
      } catch {
        // ignore
      }
      chrome.kill('SIGKILL');
      await sleep(300);
      try {
        rmSync(profileDir, { recursive: true, force: true });
      } catch {
        // ignore
      }
    },
  };
}
