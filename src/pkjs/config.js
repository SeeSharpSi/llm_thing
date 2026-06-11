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
    "type": "submit",
    "defaultValue": "Save Settings"
  }
];
