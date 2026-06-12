module.exports = [
  {
    "type": "heading",
    "defaultValue": "llm_thing"
  },
  {
    "type": "text",
    "defaultValue": "Configure the OpenAI-compatible endpoint used by the phone. MCP tools are called by the phone, so endpoints do not need native MCP support."
  },
  {
    "type": "section",
    "items": [
      {
        "type": "heading",
        "defaultValue": "Endpoint"
      },
      {
        "type": "input",
        "messageKey": "Endpoint",
        "label": "Endpoint URL",
        "defaultValue": "https://api.openai.com/v1/responses",
        "attributes": {
          "type": "url",
          "placeholder": "https://api.openai.com/v1/responses"
        }
      },
      {
        "type": "input",
        "messageKey": "ApiKey",
        "label": "API Key",
        "defaultValue": "",
        "attributes": {
          "type": "password",
          "placeholder": "sk-..."
        }
      },
      {
        "type": "input",
        "messageKey": "Model",
        "label": "Model",
        "defaultValue": "gpt-4.1-mini",
        "attributes": {
          "placeholder": "gpt-4.1-mini"
        }
      }
    ]
  },
  {
    "type": "section",
    "items": [
      {
        "type": "heading",
        "defaultValue": "Prompt"
      },
      {
        "type": "input",
        "messageKey": "SystemPrompt",
        "label": "System Prompt <button type=\"button\" aria-label=\"System prompt help\" title=\"System prompt help\" onclick=\"event.preventDefault(); event.stopPropagation(); alert('Use $DATETIME in the system prompt to insert the phone current date and time.'); return false;\" style=\"display:inline-block;width:1.35rem;height:1.35rem;margin-left:.35rem;border:1px solid #8d98a8;border-radius:50%;background:#eef2f7;color:#263241;font-weight:bold;line-height:1.1rem;text-align:center;padding:0;\">?</button>",
        "defaultValue": "You are a helpful assistant. Keep answers concise for a watch screen.",
        "description": "Use $DATETIME to insert the phone current date and time.",
        "attributes": {
          "placeholder": "System prompt, e.g. Today is $DATETIME."
        }
      },
      {
        "type": "toggle",
        "messageKey": "ShowThinking",
        "label": "Show Thinking",
        "description": "Only shown if the endpoint returns visible reasoning or <think> blocks.",
        "defaultValue": false
      },
      {
        "type": "toggle",
        "messageKey": "WebSearchEnabled",
        "label": "Web Search",
        "description": "Ask models with web access to search when useful.",
        "defaultValue": false
      },
      {
        "type": "input",
        "messageKey": "MaxToolCalls",
        "label": "Max Tool Calls",
        "description": "Maximum phone-side MCP tool calls per request. Use 0 to disable MCP tools.",
        "defaultValue": 4,
        "attributes": {
          "type": "number",
          "min": 0,
          "max": 10,
          "step": 1
        }
      }
    ]
  },
  {
    "type": "section",
    "items": [
      {
        "type": "heading",
        "defaultValue": "Watch Display"
      },
      {
        "type": "select",
        "messageKey": "FontSize",
        "label": "Font Size",
        "defaultValue": "18",
        "options": [
          {
            "label": "Small",
            "value": "14"
          },
          {
            "label": "Normal",
            "value": "18"
          },
          {
            "label": "Large",
            "value": "24"
          },
          {
            "label": "Huge",
            "value": "28"
          }
        ]
      }
    ]
  },
  {
    "type": "section",
    "items": [
      {
        "type": "mcp_servers",
        "messageKey": "McpServersJson",
        "defaultValue": "[]"
      }
    ]
  },
  {
    "type": "submit",
    "defaultValue": "Save Settings"
  }
];
