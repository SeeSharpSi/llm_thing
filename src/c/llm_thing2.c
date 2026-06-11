#include <pebble.h>

#define DICTATION_BUFFER_SIZE 384
#define RESPONSE_BUFFER_SIZE 6144

static Window *s_window;
static ScrollLayer *s_scroll_layer;
static TextLayer *s_text_layer;
#if defined(PBL_MICROPHONE)
static DictationSession *s_dictation_session;
#endif

static char s_response[RESPONSE_BUFFER_SIZE];
static int16_t s_text_width;
static int16_t s_min_text_height;
static uint32_t s_request_id;
static bool s_response_truncated;

static void prv_update_scroll_text(void) {
  if (!s_text_layer || !s_scroll_layer) {
    return;
  }

  text_layer_set_text(s_text_layer, s_response);
  text_layer_set_size(s_text_layer, GSize(s_text_width, s_min_text_height));

  GSize content_size = text_layer_get_content_size(s_text_layer);
  if (content_size.h < s_min_text_height) {
    content_size.h = s_min_text_height;
  }

  text_layer_set_size(s_text_layer, GSize(s_text_width, content_size.h));
  scroll_layer_set_content_size(s_scroll_layer, GSize(s_text_width, content_size.h));
}

static void prv_set_response(const char *text) {
  snprintf(s_response, sizeof(s_response), "%s", text);
  s_response_truncated = false;
  prv_update_scroll_text();
  scroll_layer_set_content_offset(s_scroll_layer, GPointZero, false);
}

static void prv_append_response(const char *text) {
  size_t used = strlen(s_response);
  size_t incoming = strlen(text);

  if (used + incoming < sizeof(s_response)) {
    memcpy(s_response + used, text, incoming + 1);
  } else if (!s_response_truncated) {
    const char *suffix = "\n\n[Truncated]";
    size_t suffix_len = strlen(suffix);
    size_t available = sizeof(s_response) - used - suffix_len - 1;

    if (available > 0) {
      memcpy(s_response + used, text, available);
      used += available;
    }

    memcpy(s_response + used, suffix, suffix_len + 1);
    s_response_truncated = true;
  }

  prv_update_scroll_text();
}

#if defined(PBL_MICROPHONE)
static void prv_send_request(const char *text) {
  DictionaryIterator *iter;
  AppMessageResult result = app_message_outbox_begin(&iter);

  if (result != APP_MSG_OK || !iter) {
    prv_set_response("Could not contact phone. Try again.");
    return;
  }

  s_request_id += 1;
  dict_write_uint32(iter, MESSAGE_KEY_RequestId, s_request_id);
  dict_write_cstring(iter, MESSAGE_KEY_RequestText, text);
  dict_write_end(iter);

  result = app_message_outbox_send();
  if (result != APP_MSG_OK) {
    prv_set_response("Could not send request to phone.");
    return;
  }

  prv_set_response("Waiting for response...");
}

static void prv_dictation_callback(DictationSession *session, DictationSessionStatus status,
                                   char *transcription, void *context) {
  switch (status) {
    case DictationSessionStatusSuccess:
      if (transcription && transcription[0] != '\0') {
        prv_send_request(transcription);
      } else {
        prv_set_response("No speech detected.");
      }
      break;
    case DictationSessionStatusFailureTranscriptionRejected:
      prv_set_response("Dictation cancelled.");
      break;
    case DictationSessionStatusFailureConnectivityError:
      prv_set_response("Dictation needs phone connection and internet.");
      break;
    case DictationSessionStatusFailureDisabled:
      prv_set_response("Voice dictation is disabled in Pebble settings.");
      break;
    default:
      prv_set_response("Dictation failed. Try again.");
      break;
  }
}

static bool prv_ensure_dictation_session(void) {
  if (s_dictation_session) {
    return true;
  }

  s_dictation_session = dictation_session_create(DICTATION_BUFFER_SIZE, prv_dictation_callback, NULL);
  if (!s_dictation_session) {
    prv_set_response("Voice dictation unavailable. Check phone connection.");
    return false;
  }

  dictation_session_enable_confirmation(s_dictation_session, true);
  dictation_session_enable_error_dialogs(s_dictation_session, true);
  return true;
}
#endif

static void prv_select_click_handler(ClickRecognizerRef recognizer, void *context) {
#if defined(PBL_MICROPHONE)
  if (!prv_ensure_dictation_session()) {
    return;
  }

  prv_set_response("Listening...");
  DictationSessionStatus status = dictation_session_start(s_dictation_session);
  if (status != DictationSessionStatusSuccess) {
    prv_set_response("Could not start dictation.");
  }
#else
  prv_set_response("Voice dictation unsupported on this watch.");
#endif
}

static void prv_scroll_click_config_provider(void *context) {
  window_single_click_subscribe(BUTTON_ID_SELECT, prv_select_click_handler);
}

static void prv_inbox_received_handler(DictionaryIterator *iter, void *context) {
  Tuple *request_id_t = dict_find(iter, MESSAGE_KEY_RequestId);
  if (request_id_t && request_id_t->value->uint32 != s_request_id) {
    return;
  }

  Tuple *reset_t = dict_find(iter, MESSAGE_KEY_ResponseReset);
  if (reset_t) {
    s_response[0] = '\0';
    s_response_truncated = false;
    prv_update_scroll_text();
  }

  Tuple *chunk_t = dict_find(iter, MESSAGE_KEY_ResponseChunk);
  if (chunk_t) {
    prv_append_response(chunk_t->value->cstring);
  }

  Tuple *error_t = dict_find(iter, MESSAGE_KEY_ResponseError);
  if (error_t) {
    prv_set_response(error_t->value->cstring);
  }

  Tuple *done_t = dict_find(iter, MESSAGE_KEY_ResponseDone);
  if (done_t) {
    if (s_response[0] == '\0') {
      prv_set_response("No response text.");
    } else {
      prv_update_scroll_text();
    }
  }
}

static void prv_inbox_dropped_handler(AppMessageResult reason, void *context) {
  prv_set_response("Response message dropped. Try again.");
}

static void prv_outbox_failed_handler(DictionaryIterator *iter, AppMessageResult reason, void *context) {
  prv_set_response("Phone connection failed. Try again.");
}

static void prv_window_load(Window *window) {
  Layer *window_layer = window_get_root_layer(window);
  GRect bounds = layer_get_bounds(window_layer);

  s_scroll_layer = scroll_layer_create(bounds);
  scroll_layer_set_click_config_onto_window(s_scroll_layer, window);
  scroll_layer_set_callbacks(s_scroll_layer, (ScrollLayerCallbacks) {
    .click_config_provider = prv_scroll_click_config_provider
  });
  scroll_layer_set_paging(s_scroll_layer, true);
  layer_add_child(window_layer, scroll_layer_get_layer(s_scroll_layer));

  s_text_width = bounds.size.w - 8;
  s_min_text_height = bounds.size.h;

  s_text_layer = text_layer_create(GRect(4, 0, s_text_width, s_min_text_height));
  text_layer_set_background_color(s_text_layer, GColorClear);
  text_layer_set_text_color(s_text_layer, GColorBlack);
  text_layer_set_font(s_text_layer, fonts_get_system_font(FONT_KEY_GOTHIC_18));
  text_layer_set_overflow_mode(s_text_layer, GTextOverflowModeWordWrap);
  text_layer_set_text_alignment(s_text_layer, GTextAlignmentLeft);
  scroll_layer_add_child(s_scroll_layer, text_layer_get_layer(s_text_layer));
  text_layer_enable_screen_text_flow_and_paging(s_text_layer, 4);

  prv_set_response("Press SELECT to dictate.\n\nUse UP/DOWN to scroll responses.");
}

static void prv_window_unload(Window *window) {
  text_layer_destroy(s_text_layer);
  scroll_layer_destroy(s_scroll_layer);
}

static void prv_init(void) {
  s_window = window_create();
  window_set_window_handlers(s_window, (WindowHandlers) {
    .load = prv_window_load,
    .unload = prv_window_unload,
  });

  app_message_register_inbox_received(prv_inbox_received_handler);
  app_message_register_inbox_dropped(prv_inbox_dropped_handler);
  app_message_register_outbox_failed(prv_outbox_failed_handler);
  app_message_open(app_message_inbox_size_maximum(), app_message_outbox_size_maximum());

#if defined(PBL_MICROPHONE)
  prv_ensure_dictation_session();
#endif

  window_stack_push(s_window, true);
}

static void prv_deinit(void) {
#if defined(PBL_MICROPHONE)
  if (s_dictation_session) {
    dictation_session_destroy(s_dictation_session);
  }
#endif

  app_message_deregister_callbacks();
  window_destroy(s_window);
}

int main(void) {
  prv_init();
  app_event_loop();
  prv_deinit();
}
