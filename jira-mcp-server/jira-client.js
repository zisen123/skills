import { load } from 'cheerio';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const CACHE_FILE = join(dirname(fileURLToPath(import.meta.url)), 'project-id-cache.json');

// Issue type name -> id, as configured on this Jira instance.
const ISSUE_TYPE_IDS = {
  '故障': '10100',
  'bug': '10100',
  '任务': '10002',
  'task': '10002',
  '故事': '10001',
  'story': '10001',
  '改进': '10200',
  'improvement': '10200',
  '子任务': '10103',
  'sub-task': '10103',
  'subtask': '10103',
};

export class JiraClient {
  constructor(baseUrl, username, password) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.username = username;
    this.password = password;
    this.sessionId = null;
    this.xsrfToken = null;
  }

  cookieHeader() {
    const parts = [`JSESSIONID=${this.sessionId}`];
    if (this.xsrfToken) parts.push(`atlassian.xsrf.token=${this.xsrfToken}`);
    return parts.join('; ');
  }

  captureXsrf(res) {
    const setCookies = res.headers.getSetCookie?.() || [];
    for (const c of setCookies) {
      if (c.startsWith('atlassian.xsrf.token=')) {
        this.xsrfToken = c.split(';')[0].split('=').slice(1).join('=');
      }
    }
  }

  async login() {
    const res = await fetch(`${this.baseUrl}/rest/auth/1/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: this.username, password: this.password }),
      redirect: 'manual',
    });
    if (res.status !== 200) {
      throw new Error(`Login failed: ${res.status} ${await res.text()}`);
    }
    const data = await res.json();
    this.sessionId = data.session.value;
  }

  async request(path, opts = {}) {
    if (!this.sessionId) await this.login();

    const url = path.startsWith('http') ? path : `${this.baseUrl}${path}`;
    const res = await fetch(url, {
      ...opts,
      headers: {
        Cookie: this.cookieHeader(),
        ...opts.headers,
      },
      redirect: 'manual',
    });
    this.captureXsrf(res);

    if (res.status === 401 || (res.status === 302 && (res.headers.get('location') || '').includes('login'))) {
      await this.login();
      const retry = await fetch(url, {
        ...opts,
        headers: {
          Cookie: this.cookieHeader(),
          ...opts.headers,
        },
        redirect: 'manual',
      });
      this.captureXsrf(retry);
      return retry;
    }
    return res;
  }

  extractAtlToken(html) {
    const match = html.match(/atl_token=([A-Za-z0-9_-]+)/);
    return match ? match[1] : null;
  }

  async search(jql, maxResults = 20) {
    const res = await this.request(`/issues/?jql=${encodeURIComponent(jql)}`);
    const html = await res.text();
    const $ = load(html);

    const issues = [];

    // Jira's split-view: <a class="splitview-issue-link" data-issue-key="...">
    $('a[data-issue-key]').each((_, el) => {
      const $el = $(el);
      const key = $el.attr('data-issue-key');
      if (!key) return;
      const summary = $el.find('.issue-link-summary').text().trim();
      const typeTitle = $el.find('img[title]').attr('title')?.replace(/ - $/, '') || '';
      issues.push({ key, summary, type: typeTitle });
    });

    // Fallback: table-based list view (issuerow)
    if (issues.length === 0) {
      $('tr[data-issuekey]').each((_, el) => {
        const $el = $(el);
        const key = $el.attr('data-issuekey');
        if (!key) return;
        const summary = $el.find('td.summary a').text().trim();
        const status = $el.find('td.status span').text().trim();
        const assignee = $el.find('td.assignee a').text().trim();
        const priority = $el.find('td.priority img').attr('alt') || '';
        const type = $el.find('td.issuetype img').attr('alt') || '';
        issues.push({ key, summary, status, type, priority, assignee });
      });
    }

    return issues.slice(0, maxResults);
  }

  async getIssue(issueKey) {
    const res = await this.request(`/browse/${issueKey}`);
    const html = await res.text();
    const $ = load(html);

    const title = $('title').text().trim();
    if (title.includes('您无法查看') || title.includes('Permission')) {
      throw new Error(`No permission to view ${issueKey}`);
    }

    const summary = $('#summary-val').text().trim();
    const statusText = $('#status-val').text().trim();
    const type = $('#type-val').text().trim();
    const priority = $('#priority-val').text().trim();
    const resolution = $('#resolution-val').text().trim();
    const assignee = $('#assignee-val').text().trim();
    const reporter = $('#reporter-val').text().trim();
    const created = $('#created-val time').attr('datetime') || $('#created-val').text().trim();
    const updated = $('#updated-val time').attr('datetime') || $('#updated-val').text().trim();

    const description = $('#description-val .user-content-block').text().trim();

    const labels = [];
    $('.labels .lozenge').each((_, el) => labels.push($(el).text().trim()));

    const components = [];
    $('#components-field .component-val').each((_, el) => components.push($(el).text().trim()));
    if (components.length === 0) {
      $('#components-val').find('a').each((_, el) => components.push($(el).text().trim()));
    }

    const comments = [];
    $('.activity-comment').each((_, el) => {
      const $c = $(el);
      const author = $c.find('.action-head a.user-hover').text().trim();
      const date = $c.find('.action-head time').attr('datetime')
        || $c.find('.date').text().trim();
      const body = $c.find('.action-body').text().trim();
      comments.push({ author, date, body });
    });

    const transitions = [];
    $('#opsbar-transitions_more .issueaction-workflow-transition, #action_id_\\d+').each((_, el) => {
      const $t = $(el);
      transitions.push({
        name: $t.text().trim(),
        id: ($t.attr('href') || '').match(/action=(\d+)/)?.[1] || $t.attr('id')?.replace('action_id_', ''),
      });
    });
    $('#opsbar-transitions_more a').each((_, el) => {
      const $t = $(el);
      const name = $t.text().trim();
      const id = ($t.attr('href') || '').match(/action=(\d+)/)?.[1];
      if (name && id) transitions.push({ name, id });
    });
    $('[id^="action_id_"]').each((_, el) => {
      const $t = $(el);
      const name = $t.find('.trigger-label').text().trim() || $t.text().trim();
      const id = $t.attr('id')?.replace('action_id_', '');
      if (name && id && !transitions.find(t => t.id === id)) {
        transitions.push({ name, id });
      }
    });

    const atlToken = this.extractAtlToken(html);

    return {
      key: issueKey,
      summary,
      status: statusText,
      type,
      priority,
      resolution,
      assignee,
      reporter,
      created,
      updated,
      description,
      labels,
      components,
      comments,
      transitions,
      _atlToken: atlToken,
    };
  }

  async addComment(issueKey, comment) {
    const issueData = await this.getIssue(issueKey);
    const atlToken = issueData._atlToken;
    if (!atlToken) throw new Error('Could not extract XSRF token');

    const issueIdMatch = await this.request(`/browse/${issueKey}`);
    const html = await issueIdMatch.text();
    const idMatch = html.match(/id="issue_actions_container"[^>]*data-issue-id="(\d+)"/);
    const numericId = idMatch?.[1] || html.match(/name="id" value="(\d+)"/)?.[1];

    const params = new URLSearchParams();
    params.set('atl_token', atlToken);
    params.set('comment', comment);
    if (numericId) params.set('id', numericId);

    const res = await this.request(`/secure/AddComment.jspa`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });

    return res.status === 302 || res.status === 200;
  }

  async transition(issueKey, actionId) {
    const pageRes = await this.request(`/browse/${issueKey}`);
    const html = await pageRes.text();
    const atlToken = this.extractAtlToken(html);
    const idMatch = html.match(/name="id" value="(\d+)"/);
    const numericId = idMatch?.[1];
    if (!atlToken) throw new Error('Could not extract XSRF token');

    const params = new URLSearchParams();
    params.set('atl_token', atlToken);
    params.set('action', actionId);
    if (numericId) params.set('id', numericId);

    const res = await this.request(`/secure/WorkflowUIDispatcher.jspa`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });

    return res.status === 302 || res.status === 200;
  }

  async assign(issueKey, assignee) {
    const pageRes = await this.request(`/browse/${issueKey}`);
    const html = await pageRes.text();
    const atlToken = this.extractAtlToken(html);
    if (!atlToken) throw new Error('Could not extract XSRF token');

    const params = new URLSearchParams();
    params.set('atl_token', atlToken);
    params.set('assignee', assignee);

    const res = await this.request(`/secure/AssignIssue.jspa?key=${issueKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });

    return res.status === 302 || res.status === 200;
  }

  loadCache() {
    try {
      return JSON.parse(readFileSync(CACHE_FILE, 'utf8'));
    } catch {
      return {};
    }
  }

  saveCache(cache) {
    try {
      writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2));
    } catch {
      // cache is best-effort; ignore write failures
    }
  }

  // Resolve a project key (e.g. "CV184XSDK") to its numeric pid by reading the
  // data-projectkey embedded in the create-issue form. REST is rate-limited (429)
  // on this instance, so we probe HTML pages and cache results to disk.
  async resolveProjectId(projectKey) {
    const cache = this.loadCache();
    if (cache[projectKey]) return cache[projectKey];

    for (let pid = 10000; pid <= 10800; pid++) {
      const res = await this.request(`/secure/CreateIssueDetails!init.jspa?pid=${pid}&issuetype=10002`);
      const html = await res.text();
      const key = html.match(/data-projectkey="([^"]+)"/)?.[1];
      if (!key) continue;
      if (!cache[key]) {
        cache[key] = pid;
        this.saveCache(cache);
      }
      if (key === projectKey) return pid;
    }
    throw new Error(`Could not resolve project id for "${projectKey}"`);
  }

  async createIssue({ projectKey, issueType = '故障', summary, description = '', priority, assignee, reporter }) {
    if (!projectKey) throw new Error('projectKey is required');
    if (!summary) throw new Error('summary is required');

    const pid = await this.resolveProjectId(projectKey);
    const typeId = /^\d+$/.test(String(issueType))
      ? String(issueType)
      : ISSUE_TYPE_IDS[String(issueType).toLowerCase()] || ISSUE_TYPE_IDS[issueType];
    if (!typeId) throw new Error(`Unknown issue type "${issueType}"`);

    // Fetch the create form to obtain fresh tokens (and the xsrf cookie via request()).
    const formRes = await this.request(`/secure/CreateIssueDetails!init.jspa?pid=${pid}&issuetype=${typeId}`);
    const html = await formRes.text();
    const $ = load(html);
    const atlToken = $('input[name=atl_token]').attr('value');
    const formToken = $('input[name=formToken]').attr('value');
    if (!atlToken) throw new Error('Could not extract XSRF token from create form');

    const params = new URLSearchParams();
    params.set('pid', String(pid));
    params.set('issuetype', typeId);
    params.set('atl_token', atlToken);
    if (formToken) params.set('formToken', formToken);
    params.set('summary', summary);
    params.set('description', description);
    // Priority is required on some projects; default to Medium (3) when unset.
    params.set('priority', priority || $('select[name=priority] option[selected]').attr('value') || '3');
    params.set('reporter', reporter || this.username);
    if (assignee) params.set('assignee', assignee);

    const res = await this.request('/secure/CreateIssueDetails.jspa', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'X-Atlassian-Token': 'no-check',
      },
      body: params.toString(),
    });

    if (res.status === 302) {
      const location = res.headers.get('location') || '';
      const key = location.match(/browse\/([A-Z0-9]+-\d+)/)?.[1];
      if (key) return key;
      throw new Error(`Issue created but could not parse key from redirect: ${location}`);
    }

    // Non-redirect means a validation error; surface it.
    const errHtml = await res.text();
    const err$ = load(errHtml);
    const errors = [];
    err$('.error, .errMsg, .field-error').each((_, el) => {
      const t = err$(el).text().trim();
      if (t) errors.push(t);
    });
    throw new Error(`Create failed (status ${res.status}): ${errors.join('; ') || 'unknown error'}`);
  }
}
