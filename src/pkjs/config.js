module.exports = [
  {
    "type": "heading",
    "defaultValue": "llm_thing"
  },
  {
    "type": "text",
    "defaultValue": "Configure the OpenAI-compatible endpoint used by the phone. Built-in and MCP tools are called by the phone, so endpoints do not need native tool support."
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
        "label": "System Prompt <button type=\"button\" aria-label=\"System prompt help\" title=\"System prompt help\" onclick=\"event.preventDefault(); event.stopPropagation(); alert('Use $DATETIME to insert the phone current date and time. Watch display currently supports bold Markdown only; italics and strikethrough are not rendered.'); return false;\" style=\"appearance:none;-webkit-appearance:none;display:inline-flex;align-items:center;justify-content:center;box-sizing:border-box;vertical-align:middle;width:20px;min-width:20px;max-width:20px;height:20px;min-height:20px;max-height:20px;margin:0 0 2px 6px;border:1px solid #6b7788;border-radius:999px;background:linear-gradient(#ffffff,#e8edf4);color:#263241;font-size:12px;font-weight:700;line-height:20px;text-align:center;padding:0;box-shadow:0 1px 2px rgba(15,23,42,.18);\">?</button>",
        "defaultValue": "You are a helpful assistant. Keep answers concise for a watch screen. Use Markdown bold when useful, but do not use italics or strikethrough.",
        "description": "Use $DATETIME to insert the phone current date and time. Watch display supports bold Markdown only.",
        "attributes": {
          "placeholder": "System prompt, e.g. Today is $DATETIME."
        }
      },
      {
        "type": "toggle",
        "messageKey": "ShowThinking",
        "label": "Show Thinking",
        "description": "Responses API requests reasoning summaries. Chat completions show provider-visible reasoning fields or <think> blocks only.",
        "defaultValue": false
      },
      {
        "type": "toggle",
        "messageKey": "ShowInputContextSize",
        "label": "Show Input Context Size",
        "description": "Show returned input token count in the thinking screen top-left corner.",
        "defaultValue": false
      },
      {
        "type": "toggle",
        "messageKey": "ShowOutputContextSize",
        "label": "Show Output Context Size",
        "description": "Show returned output token count in the thinking screen top-right corner.",
        "defaultValue": false
      },
      {
        "type": "toggle",
        "messageKey": "PreserveChats",
        "label": "Preserve Chats",
        "description": "Save chats on the phone. When enabled, press DOWN on the app home screen to resume or delete saved chats.",
        "defaultValue": false
      },
      {
        "type": "button",
        "id": "DeleteAllPastChats",
        "defaultValue": "Delete All Past Chats",
        "description": "Deletes saved chats from the phone. Turning Preserve Chats off does not delete saved chats."
      },
      {
        "type": "input",
        "messageKey": "DeleteAllPastChats",
        "defaultValue": "0",
        "attributes": {
          "type": "hidden"
        }
      },
      {
        "type": "toggle",
        "messageKey": "WebSearchEnabled",
        "label": "Web Search",
        "description": "Ask models with web access to search when useful.",
        "defaultValue": false
      },
      {
        "type": "toggle",
        "messageKey": "GeolocationToolEnabled",
        "label": "Geolocation Tool",
        "description": "Allow the model to request the phone's current location.",
        "defaultValue": false
      },
      {
        "type": "toggle",
        "messageKey": "TimelineToolEnabled",
        "label": "Timeline Pins Tool",
        "description": "Allow the model to create, update, and delete this app's Pebble timeline pins.",
        "defaultValue": false
      },
      {
        "type": "toggle",
        "messageKey": "HealthToolEnabled",
        "label": "Health Summary Tool",
        "description": "Allow the model to request a summary of Pebble Health activity from the watch.",
        "defaultValue": false
      },
      {
        "type": "input",
        "messageKey": "MaxToolCalls",
        "label": "Max Tool Calls",
        "description": "Maximum phone-side tool calls per request. Use 0 to disable all tools.",
        "defaultValue": 4,
        "attributes": {
          "type": "number",
          "min": 0,
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
      },
      {
        "type": "select",
        "messageKey": "BuzzStrength",
        "label": "Response Buzz",
        "defaultValue": "1",
        "options": [
          {
            "label": "Off",
            "value": "0"
          },
          {
            "label": "Light",
            "value": "1"
          },
          {
            "label": "Medium",
            "value": "2"
          },
          {
            "label": "Strong",
            "value": "3"
          }
        ]
      },
      {
        "type": "input",
        "messageKey": "ScrollLines",
        "label": "Scroll Lines",
        "description": "Lines moved per UP/DOWN click.",
        "defaultValue": 3,
        "attributes": {
          "type": "number",
          "min": 1,
          "max": 10,
          "step": 1
        }
      },
      {
        "type": "toggle",
        "messageKey": "TouchScrollEnabled",
        "label": "Touch Scroll",
        "description": "Enable drag and momentum scrolling on touchscreen watches.",
        "defaultValue": true
      },
      {
        "type": "color",
        "messageKey": "TextColor",
        "label": "Text Color",
        "defaultValue": 0
      },
      {
        "type": "color",
        "messageKey": "BackgroundColor",
        "label": "Background Color",
        "defaultValue": 16777215
      },
      {
        "type": "color",
        "messageKey": "PromptBackgroundColor",
        "label": "Prompt Background Color",
        "defaultValue": 11184810
      },
      {
        "type": "color",
        "messageKey": "BoldTextColor",
        "label": "Bold Text Color",
        "defaultValue": 0
      },
      {
        "type": "toggle",
        "messageKey": "StartDictationQuickLaunch",
        "label": "Start in Dictation when Quick Launched",
        "description": "Open dictation automatically when the app is launched from Quick Launch.",
        "defaultValue": false
      },
      {
        "type": "button",
        "id": "ResetWatchDisplay",
        "defaultValue": "Reset Watch Display Defaults",
        "description": "Restore all Watch Display options to their defaults."
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
