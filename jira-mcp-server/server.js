#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { JiraClient } from './jira-client.js';

const { JIRA_URL, JIRA_USER, JIRA_PASSWORD } = process.env;
if (!JIRA_URL || !JIRA_USER || !JIRA_PASSWORD) {
  console.error('Missing required env vars: JIRA_URL, JIRA_USER, JIRA_PASSWORD');
  process.exit(1);
}

const jira = new JiraClient(JIRA_URL, JIRA_USER, JIRA_PASSWORD);

const server = new Server(
  { name: 'jira', version: '1.0.0' },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'jira_search',
      description: 'Search Jira issues using JQL. Returns a list of matching issues with key, summary, status, type, assignee.',
      inputSchema: {
        type: 'object',
        properties: {
          jql: { type: 'string', description: 'JQL query string. Example: "assignee = currentUser() ORDER BY updated DESC"' },
          maxResults: { type: 'number', description: 'Max results to return (default 20)', default: 20 },
        },
        required: ['jql'],
      },
    },
    {
      name: 'jira_get_issue',
      description: 'Get detailed information about a Jira issue including summary, status, description, comments, and available transitions.',
      inputSchema: {
        type: 'object',
        properties: {
          issueKey: { type: 'string', description: 'Issue key like PROJECT-123' },
        },
        required: ['issueKey'],
      },
    },
    {
      name: 'jira_add_comment',
      description: 'Add a comment to a Jira issue.',
      inputSchema: {
        type: 'object',
        properties: {
          issueKey: { type: 'string', description: 'Issue key like PROJECT-123' },
          comment: { type: 'string', description: 'Comment text to add' },
        },
        required: ['issueKey', 'comment'],
      },
    },
    {
      name: 'jira_transition',
      description: 'Transition a Jira issue to a new status. Use jira_get_issue first to see available transitions and their IDs.',
      inputSchema: {
        type: 'object',
        properties: {
          issueKey: { type: 'string', description: 'Issue key like PROJECT-123' },
          actionId: { type: 'string', description: 'Transition action ID (from jira_get_issue transitions list)' },
        },
        required: ['issueKey', 'actionId'],
      },
    },
    {
      name: 'jira_assign',
      description: 'Assign a Jira issue to a user.',
      inputSchema: {
        type: 'object',
        properties: {
          issueKey: { type: 'string', description: 'Issue key like PROJECT-123' },
          assignee: { type: 'string', description: 'Username to assign to' },
        },
        required: ['issueKey', 'assignee'],
      },
    },
    {
      name: 'jira_create_issue',
      description: 'Create a new Jira issue in a project. Returns the new issue key.',
      inputSchema: {
        type: 'object',
        properties: {
          projectKey: { type: 'string', description: 'Project key like CV184XSDK' },
          issueType: { type: 'string', description: 'Issue type name (故障/任务/故事/改进/子任务 or Bug/Task/Story/Improvement/Sub-task) or numeric id. Default 故障.' },
          summary: { type: 'string', description: 'Issue summary/title' },
          description: { type: 'string', description: 'Issue description' },
          priority: { type: 'string', description: 'Priority id (optional)' },
          assignee: { type: 'string', description: 'Assignee username (optional)' },
          reporter: { type: 'string', description: 'Reporter username (optional, defaults to the logged-in user)' },
        },
        required: ['projectKey', 'summary'],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case 'jira_search': {
        const issues = await jira.search(args.jql, args.maxResults || 20);
        return { content: [{ type: 'text', text: JSON.stringify(issues, null, 2) }] };
      }
      case 'jira_get_issue': {
        const issue = await jira.getIssue(args.issueKey);
        const { _atlToken, ...publicData } = issue;
        return { content: [{ type: 'text', text: JSON.stringify(publicData, null, 2) }] };
      }
      case 'jira_add_comment': {
        const ok = await jira.addComment(args.issueKey, args.comment);
        return { content: [{ type: 'text', text: ok ? 'Comment added successfully.' : 'Failed to add comment.' }] };
      }
      case 'jira_transition': {
        const ok = await jira.transition(args.issueKey, args.actionId);
        return { content: [{ type: 'text', text: ok ? 'Transition successful.' : 'Transition failed.' }] };
      }
      case 'jira_assign': {
        const ok = await jira.assign(args.issueKey, args.assignee);
        return { content: [{ type: 'text', text: ok ? 'Issue assigned successfully.' : 'Failed to assign issue.' }] };
      }
      case 'jira_create_issue': {
        const key = await jira.createIssue(args);
        return { content: [{ type: 'text', text: `Issue created: ${key}` }] };
      }
      default:
        return { content: [{ type: 'text', text: `Unknown tool: ${name}` }], isError: true };
    }
  } catch (err) {
    return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
