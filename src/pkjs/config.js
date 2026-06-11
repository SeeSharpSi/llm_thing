module.exports = [
  {
    "type": "heading",
    "defaultValue": "llm_thing"
  },
  {
    "type": "text",
    "defaultValue": "Configure the OpenAI-compatible endpoint used by the phone. The API key and prompt stay on the phone."
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
        "label": "System Prompt",
        "defaultValue": "You are a helpful assistant. Keep answers concise for a watch screen.",
        "attributes": {
          "placeholder": "System prompt"
        }
      },
      {
        "type": "toggle",
        "messageKey": "ShowThinking",
        "label": "Show Thinking",
        "description": "Only shown if the endpoint returns visible reasoning or <think> blocks.",
        "defaultValue": false
      }
    ]
  },
  {
    "type": "section",
    "items": [
      {
        "type": "heading",
        "defaultValue": "MCP Servers"
      },
      {
        "type": "text",
        "defaultValue": "Optional remote MCP servers for the OpenAI Responses API. Only add servers you trust; tool calls may share prompt context with them."
      },
      {
        "type": "toggle",
        "messageKey": "McpServer1Enabled",
        "label": "Enable Server 1",
        "defaultValue": false
      },
      {
        "type": "input",
        "messageKey": "McpServer1Label",
        "label": "Server 1 Label",
        "defaultValue": "",
        "attributes": {
          "placeholder": "deepwiki"
        }
      },
      {
        "type": "input",
        "messageKey": "McpServer1Url",
        "label": "Server 1 URL",
        "defaultValue": "",
        "attributes": {
          "type": "url",
          "placeholder": "https://example.com/mcp"
        }
      },
      {
        "type": "input",
        "messageKey": "McpServer1Description",
        "label": "Server 1 Description",
        "defaultValue": "",
        "attributes": {
          "placeholder": "What this server helps with"
        }
      },
      {
        "type": "input",
        "messageKey": "McpServer1AllowedTools",
        "label": "Server 1 Allowed Tools",
        "description": "Optional comma-separated tool names.",
        "defaultValue": "",
        "attributes": {
          "placeholder": "ask_question,read_wiki_structure"
        }
      },
      {
        "type": "input",
        "messageKey": "McpServer1Authorization",
        "label": "Server 1 Auth Token",
        "defaultValue": "",
        "attributes": {
          "type": "password",
          "placeholder": "Optional OAuth token"
        }
      },
      {
        "type": "toggle",
        "messageKey": "McpServer2Enabled",
        "label": "Enable Server 2",
        "defaultValue": false
      },
      {
        "type": "input",
        "messageKey": "McpServer2Label",
        "label": "Server 2 Label",
        "defaultValue": "",
        "attributes": {
          "placeholder": "server2"
        }
      },
      {
        "type": "input",
        "messageKey": "McpServer2Url",
        "label": "Server 2 URL",
        "defaultValue": "",
        "attributes": {
          "type": "url",
          "placeholder": "https://example.com/mcp"
        }
      },
      {
        "type": "input",
        "messageKey": "McpServer2Description",
        "label": "Server 2 Description",
        "defaultValue": "",
        "attributes": {
          "placeholder": "What this server helps with"
        }
      },
      {
        "type": "input",
        "messageKey": "McpServer2AllowedTools",
        "label": "Server 2 Allowed Tools",
        "description": "Optional comma-separated tool names.",
        "defaultValue": "",
        "attributes": {
          "placeholder": "tool_one,tool_two"
        }
      },
      {
        "type": "input",
        "messageKey": "McpServer2Authorization",
        "label": "Server 2 Auth Token",
        "defaultValue": "",
        "attributes": {
          "type": "password",
          "placeholder": "Optional OAuth token"
        }
      },
      {
        "type": "toggle",
        "messageKey": "McpServer3Enabled",
        "label": "Enable Server 3",
        "defaultValue": false
      },
      {
        "type": "input",
        "messageKey": "McpServer3Label",
        "label": "Server 3 Label",
        "defaultValue": "",
        "attributes": {
          "placeholder": "server3"
        }
      },
      {
        "type": "input",
        "messageKey": "McpServer3Url",
        "label": "Server 3 URL",
        "defaultValue": "",
        "attributes": {
          "type": "url",
          "placeholder": "https://example.com/mcp"
        }
      },
      {
        "type": "input",
        "messageKey": "McpServer3Description",
        "label": "Server 3 Description",
        "defaultValue": "",
        "attributes": {
          "placeholder": "What this server helps with"
        }
      },
      {
        "type": "input",
        "messageKey": "McpServer3AllowedTools",
        "label": "Server 3 Allowed Tools",
        "description": "Optional comma-separated tool names.",
        "defaultValue": "",
        "attributes": {
          "placeholder": "tool_one,tool_two"
        }
      },
      {
        "type": "input",
        "messageKey": "McpServer3Authorization",
        "label": "Server 3 Auth Token",
        "defaultValue": "",
        "attributes": {
          "type": "password",
          "placeholder": "Optional OAuth token"
        }
      }
    ]
  },
  {
    "type": "submit",
    "defaultValue": "Save Settings"
  }
];
