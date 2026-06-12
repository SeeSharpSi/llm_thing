#include <pebble.h>
#include <stdlib.h>

#define DICTATION_BUFFER_SIZE 384
#define RESPONSE_BUFFER_SIZE 6144
#define FONT_SIZE_DEFAULT 18
#define BUZZ_STRENGTH_DEFAULT 1
#define PERSIST_KEY_FONT_SIZE 1
#define PERSIST_KEY_BUZZ_STRENGTH 2
#define TEXT_BOTTOM_PADDING 16
#define TEXT_MEASURE_HEIGHT 32000
#define PROGRESS_TITLE_BUFFER_SIZE 96
#define PROGRESS_DETAIL_BUFFER_SIZE 192
#define PROGRESS_LOADING_HEIGHT 28
#define PROGRESS_LOADING_MARGIN 16
#define PROGRESS_LOADING_TIMER_MS 80
#define PROGRESS_LOADING_STEP 6
#define PROGRESS_TEXT_SIDE_PADDING 6
#define PROGRESS_TEXT_GAP 4
#define PROGRESS_TITLE_MIN_HEIGHT 32
#define PROGRESS_TITLE_MAX_HEIGHT 60
#define PROGRESS_DETAIL_MIN_HEIGHT 22
#define PROGRESS_DETAIL_MAX_HEIGHT 44

static Window *s_window;
static ScrollLayer *s_scroll_layer;
static TextLayer *s_text_layer;
static Layer *s_progress_layer;
static TextLayer *s_progress_title_layer;
static TextLayer *s_progress_detail_layer;
static Layer *s_progress_loading_layer;
static AppTimer *s_progress_loading_timer;
#if defined(PBL_MICROPHONE)
static DictationSession *s_dictation_session;
#endif

static char s_response[RESPONSE_BUFFER_SIZE];
static char s_progress_title[PROGRESS_TITLE_BUFFER_SIZE];
static char s_progress_detail[PROGRESS_DETAIL_BUFFER_SIZE];
static int16_t s_text_width;
static int16_t s_min_text_height;
static int16_t s_progress_width;
static int16_t s_progress_height;
static int s_font_size = FONT_SIZE_DEFAULT;
static int s_buzz_strength = BUZZ_STRENGTH_DEFAULT;
static uint32_t s_request_id;
static uint16_t s_progress_loading_frame;
static bool s_response_truncated;
static bool s_progress_mode;

static void prv_update_scroll_text(void);

static void prv_progress_loading_timer_callback(void *context);

static void prv_set_status(const char *text) {
  (void)text;
}

static int prv_normalize_font_size(int size) {
  switch (size) {
    case 14:
    case 18:
    case 24:
    case 28:
      return size;
    default:
      return FONT_SIZE_DEFAULT;
  }
}

static const char *prv_font_key_for_size(int size) {
  switch (prv_normalize_font_size(size)) {
    case 14:
      return FONT_KEY_GOTHIC_14;
    case 24:
      return FONT_KEY_GOTHIC_24;
    case 28:
      return FONT_KEY_GOTHIC_28;
    case 18:
    default:
      return FONT_KEY_GOTHIC_18;
  }
}

static int prv_normalize_buzz_strength(int strength) {
  if (strength >= 0 && strength <= 3) {
    return strength;
  }

  return BUZZ_STRENGTH_DEFAULT;
}

static int prv_int_from_tuple(Tuple *tuple, int fallback) {
  if (!tuple) {
    return fallback;
  }

  if (tuple->type == TUPLE_CSTRING) {
    return atoi(tuple->value->cstring);
  }
  if (tuple->type == TUPLE_INT) {
    return tuple->value->int32;
  }

  return tuple->value->uint32;
}

static void prv_apply_buzz_strength(int strength, bool should_persist) {
  s_buzz_strength = prv_normalize_buzz_strength(strength);

  if (should_persist) {
    persist_write_int(PERSIST_KEY_BUZZ_STRENGTH, s_buzz_strength);
  }
}

static void prv_buzz_response_done(void) {
  switch (s_buzz_strength) {
    case 0:
      return;
    case 1: {
      static const uint32_t segments[] = { 75 };
      VibePattern pattern = {
        .durations = segments,
        .num_segments = 1,
      };
      vibes_enqueue_custom_pattern(pattern);
      return;
    }
    case 2:
      vibes_short_pulse();
      return;
    case 3:
      vibes_double_pulse();
      return;
    default:
      return;
  }
}

static void prv_apply_font_size(int size, bool should_persist) {
  s_font_size = prv_normalize_font_size(size);

  if (should_persist) {
    persist_write_int(PERSIST_KEY_FONT_SIZE, s_font_size);
  }

  if (s_text_layer) {
    text_layer_set_font(s_text_layer, fonts_get_system_font(prv_font_key_for_size(s_font_size)));
    prv_update_scroll_text();
  }
}

static void prv_update_scroll_text(void) {
  if (!s_text_layer || !s_scroll_layer) {
    return;
  }

  text_layer_set_text(s_text_layer, s_response);
  text_layer_set_size(s_text_layer, GSize(s_text_width, TEXT_MEASURE_HEIGHT));

  GSize content_size = text_layer_get_content_size(s_text_layer);
  int32_t measured_height = content_size.h;
  int32_t text_height = measured_height + s_font_size + TEXT_BOTTOM_PADDING;
  int32_t scroll_height;
  int32_t page_remainder;

  if (text_height < s_min_text_height) {
    text_height = s_min_text_height;
  }

  scroll_height = text_height;
  if (measured_height > s_min_text_height) {
    // Match TextLayer paging: final offset should land on a page boundary,
    // with one blank page for bottom clearance across font sizes.
    scroll_height += s_min_text_height;
    page_remainder = scroll_height % s_min_text_height;
    if (page_remainder) {
      scroll_height += s_min_text_height - page_remainder;
    }
  }

  if (scroll_height > TEXT_MEASURE_HEIGHT) {
    scroll_height = TEXT_MEASURE_HEIGHT;
  }

  text_layer_set_size(s_text_layer, GSize(s_text_width, scroll_height));
  scroll_layer_set_content_size(s_scroll_layer, GSize(s_text_width, scroll_height));
}

static void prv_schedule_progress_loading_timer(void) {
  if (!s_progress_mode || s_progress_loading_timer) {
    return;
  }

  s_progress_loading_timer = app_timer_register(PROGRESS_LOADING_TIMER_MS, prv_progress_loading_timer_callback, NULL);
}

static void prv_stop_progress_loading(void) {
  if (s_progress_loading_timer) {
    app_timer_cancel(s_progress_loading_timer);
    s_progress_loading_timer = NULL;
  }

  s_progress_loading_frame = 0;
}

static void prv_start_progress_loading(void) {
  if (s_progress_loading_layer) {
    layer_mark_dirty(s_progress_loading_layer);
  }
  prv_schedule_progress_loading_timer();
}

static void prv_progress_loading_timer_callback(void *context) {
  (void)context;
  s_progress_loading_timer = NULL;

  if (!s_progress_mode) {
    return;
  }

  s_progress_loading_frame += 1;
  if (s_progress_loading_layer) {
    layer_mark_dirty(s_progress_loading_layer);
  }
  prv_schedule_progress_loading_timer();
}

static void prv_progress_loading_update_proc(Layer *layer, GContext *ctx) {
  GRect bounds = layer_get_bounds(layer);
  int16_t track_width = bounds.size.w - (PROGRESS_LOADING_MARGIN * 2);
  int16_t x0;
  int16_t y;
  int16_t segment_width;
  int16_t travel;
  int16_t x;
  int16_t left;
  int16_t right;

  if (track_width <= 0) {
    return;
  }

  x0 = (bounds.size.w - track_width) / 2;
  y = bounds.size.h / 2;
  segment_width = track_width / 4;
  if (segment_width < 12) {
    segment_width = 12;
  }
  travel = track_width + segment_width;
  x = x0 - segment_width + ((s_progress_loading_frame * PROGRESS_LOADING_STEP) % travel);
  left = x < x0 ? x0 : x;
  right = x + segment_width > x0 + track_width ? x0 + track_width : x + segment_width;

#if defined(PBL_COLOR)
  graphics_context_set_fill_color(ctx, GColorLightGray);
#else
  graphics_context_set_fill_color(ctx, GColorBlack);
#endif
  graphics_fill_rect(ctx, GRect(x0, y - 1, track_width, 2), 0, GCornerNone);

  if (right > left) {
    graphics_context_set_fill_color(ctx, GColorBlack);
    graphics_fill_rect(ctx, GRect(left, y - 2, right - left, 4), 1, GCornersAll);
  }
}

static void prv_set_progress_visible(bool visible) {
  if (s_scroll_layer) {
    layer_set_hidden(scroll_layer_get_layer(s_scroll_layer), visible);
  }
  if (s_progress_layer) {
    layer_set_hidden(s_progress_layer, !visible);
  }

  if (visible) {
    prv_start_progress_loading();
  } else {
    prv_stop_progress_loading();
  }
}

static void prv_show_response_view(void) {
  s_progress_mode = false;
  prv_set_progress_visible(false);
}

static int16_t prv_clamp_int16(int16_t value, int16_t min, int16_t max) {
  if (value < min) {
    return min;
  }
  if (value > max) {
    return max;
  }

  return value;
}

static void prv_update_progress_text(void) {
  int16_t title_height;
  int16_t detail_height = 0;
  int16_t group_height;
  int16_t group_y;
  int16_t max_y;

  if (s_progress_title_layer) {
    text_layer_set_size(s_progress_title_layer, GSize(s_progress_width, PROGRESS_TITLE_MAX_HEIGHT));
    text_layer_set_text(s_progress_title_layer, s_progress_title);
  }
  if (s_progress_detail_layer) {
    text_layer_set_size(s_progress_detail_layer, GSize(s_progress_width, PROGRESS_DETAIL_MAX_HEIGHT));
    text_layer_set_text(s_progress_detail_layer, s_progress_detail);
  }

  if (!s_progress_title_layer || !s_progress_detail_layer || s_progress_width <= 0 || s_progress_height <= 0) {
    return;
  }

  title_height = prv_clamp_int16(text_layer_get_content_size(s_progress_title_layer).h, PROGRESS_TITLE_MIN_HEIGHT, PROGRESS_TITLE_MAX_HEIGHT);
  if (s_progress_detail[0] != '\0') {
    detail_height = prv_clamp_int16(text_layer_get_content_size(s_progress_detail_layer).h, PROGRESS_DETAIL_MIN_HEIGHT, PROGRESS_DETAIL_MAX_HEIGHT);
  }

  group_height = title_height + (detail_height ? PROGRESS_TEXT_GAP + detail_height : 0);
  group_y = (s_progress_height - group_height) / 2;
  max_y = s_progress_height - PROGRESS_LOADING_HEIGHT - group_height;
  if (max_y < 0) {
    max_y = 0;
  }
  if (group_y > max_y) {
    group_y = max_y;
  }
  if (group_y < 0) {
    group_y = 0;
  }

  layer_set_frame(text_layer_get_layer(s_progress_title_layer), GRect(PROGRESS_TEXT_SIDE_PADDING, group_y, s_progress_width, title_height));
  layer_set_hidden(text_layer_get_layer(s_progress_detail_layer), detail_height == 0);
  if (detail_height) {
    layer_set_frame(text_layer_get_layer(s_progress_detail_layer), GRect(PROGRESS_TEXT_SIDE_PADDING, group_y + title_height + PROGRESS_TEXT_GAP, s_progress_width, detail_height));
  }
}

static void prv_set_progress_title(const char *text) {
  snprintf(s_progress_title, sizeof(s_progress_title), "%s", text && text[0] ? text : "thinking");
  prv_update_progress_text();
}

static void prv_set_progress_detail(const char *text) {
  snprintf(s_progress_detail, sizeof(s_progress_detail), "%s", text ? text : "");
  prv_update_progress_text();
}

static void prv_append_text_limited(const char *text) {
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
}

static void prv_progress_reset(void) {
  s_progress_mode = true;
  s_response[0] = '\0';
  s_response_truncated = false;
  snprintf(s_progress_title, sizeof(s_progress_title), "thinking");
  s_progress_detail[0] = '\0';
  prv_update_scroll_text();
  prv_update_progress_text();
  prv_set_progress_visible(true);
  scroll_layer_set_content_offset(s_scroll_layer, GPointZero, false);
}

static void prv_progress_append(const char *text) {
  if (!s_progress_mode) {
    prv_progress_reset();
  }

  prv_set_progress_title(text);
}

static void prv_set_response(const char *text) {
  prv_show_response_view();
  snprintf(s_response, sizeof(s_response), "%s", text);
  s_response_truncated = false;
  prv_update_scroll_text();
  scroll_layer_set_content_offset(s_scroll_layer, GPointZero, false);
}

static void prv_set_progress(const char *text) {
  if (!s_progress_mode) {
    prv_progress_reset();
  }

  prv_set_progress_title(text);
}

static void prv_append_response(const char *text) {
  prv_show_response_view();
  prv_append_text_limited(text);
  prv_update_scroll_text();
}

#if defined(PBL_MICROPHONE)
static void prv_send_request(const char *text) {
  DictionaryIterator *iter;
  AppMessageResult result = app_message_outbox_begin(&iter);
  APP_LOG(APP_LOG_LEVEL_DEBUG, "send request start next_id=%lu text_len=%u", (unsigned long)(s_request_id + 1), (unsigned int)strlen(text));

  if (result != APP_MSG_OK || !iter) {
    APP_LOG(APP_LOG_LEVEL_ERROR, "outbox begin failed result=%d", result);
    prv_set_status("Phone unavailable");
    prv_set_response("Could not contact phone. Try again.");
    return;
  }

  s_request_id += 1;
  dict_write_uint32(iter, MESSAGE_KEY_RequestId, s_request_id);
  dict_write_cstring(iter, MESSAGE_KEY_RequestText, text);
  dict_write_end(iter);

  result = app_message_outbox_send();
  if (result != APP_MSG_OK) {
    APP_LOG(APP_LOG_LEVEL_ERROR, "outbox send failed request_id=%lu result=%d", (unsigned long)s_request_id, result);
    prv_set_status("Send failed");
    prv_set_response("Could not send request to phone.");
    return;
  }

  APP_LOG(APP_LOG_LEVEL_DEBUG, "send request queued request_id=%lu", (unsigned long)s_request_id);
  prv_set_status("Waiting for phone");
  prv_progress_reset();
  prv_set_progress("thinking");
  prv_set_progress_detail("waiting for phone");
}

static void prv_dictation_callback(DictationSession *session, DictationSessionStatus status,
                                   char *transcription, void *context) {
  APP_LOG(APP_LOG_LEVEL_DEBUG, "dictation callback status=%d text_len=%u", status, (unsigned int)(transcription ? strlen(transcription) : 0));
  switch (status) {
    case DictationSessionStatusSuccess:
      if (transcription && transcription[0] != '\0') {
        prv_send_request(transcription);
      } else {
        prv_set_status("No speech");
        prv_set_response("No speech detected.");
      }
      break;
    case DictationSessionStatusFailureTranscriptionRejected:
      prv_set_status("Cancelled");
      prv_set_response("Dictation cancelled.");
      break;
    case DictationSessionStatusFailureConnectivityError:
      prv_set_status("Dictation offline");
      prv_set_response("Dictation needs phone connection and internet.");
      break;
    case DictationSessionStatusFailureDisabled:
      prv_set_status("Dictation disabled");
      prv_set_response("Voice dictation is disabled in Pebble settings.");
      break;
    default:
      prv_set_status("Dictation failed");
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
  APP_LOG(APP_LOG_LEVEL_DEBUG, "select pressed: start dictation");
  if (!prv_ensure_dictation_session()) {
    return;
  }

  prv_set_status("Listening");
  prv_set_response("Listening...");
  DictationSessionStatus status = dictation_session_start(s_dictation_session);
  if (status != DictationSessionStatusSuccess) {
    APP_LOG(APP_LOG_LEVEL_ERROR, "dictation start failed status=%d", status);
    prv_set_status("Dictation failed");
    prv_set_response("Could not start dictation.");
  }
#else
  APP_LOG(APP_LOG_LEVEL_WARNING, "select pressed: microphone unsupported");
  prv_set_status("Unsupported");
  prv_set_response("Voice dictation unsupported on this watch.");
#endif
}

static void prv_scroll_click_config_provider(void *context) {
  window_single_click_subscribe(BUTTON_ID_SELECT, prv_select_click_handler);
}

static void prv_inbox_received_handler(DictionaryIterator *iter, void *context) {
  Tuple *request_id_t = dict_find(iter, MESSAGE_KEY_RequestId);
  APP_LOG(APP_LOG_LEVEL_DEBUG, "inbox received request_id=%lu current=%lu", (unsigned long)(request_id_t ? request_id_t->value->uint32 : 0), (unsigned long)s_request_id);
  if (request_id_t && request_id_t->value->uint32 != s_request_id) {
    APP_LOG(APP_LOG_LEVEL_DEBUG, "ignored stale response request_id=%lu", (unsigned long)request_id_t->value->uint32);
    return;
  }

  Tuple *font_size_t = dict_find(iter, MESSAGE_KEY_FontSize);
  if (font_size_t) {
    APP_LOG(APP_LOG_LEVEL_DEBUG, "font size update");
    prv_apply_font_size(prv_int_from_tuple(font_size_t, s_font_size), true);
  }

  Tuple *buzz_strength_t = dict_find(iter, MESSAGE_KEY_BuzzStrength);
  if (buzz_strength_t) {
    APP_LOG(APP_LOG_LEVEL_DEBUG, "buzz strength update");
    prv_apply_buzz_strength(prv_int_from_tuple(buzz_strength_t, s_buzz_strength), true);
  }

  Tuple *reset_t = dict_find(iter, MESSAGE_KEY_ResponseReset);
  if (reset_t) {
    APP_LOG(APP_LOG_LEVEL_DEBUG, "response reset");
    prv_set_status("Receiving");
    prv_show_response_view();
    s_response[0] = '\0';
    s_response_truncated = false;
    prv_update_scroll_text();
    scroll_layer_set_content_offset(s_scroll_layer, GPointZero, false);
  }

  Tuple *progress_reset_t = dict_find(iter, MESSAGE_KEY_ProgressReset);
  if (progress_reset_t) {
    APP_LOG(APP_LOG_LEVEL_DEBUG, "progress reset");
    prv_progress_reset();
  }

  Tuple *progress_append_t = dict_find(iter, MESSAGE_KEY_ProgressAppend);
  if (progress_append_t) {
    APP_LOG(APP_LOG_LEVEL_DEBUG, "progress append len=%u", (unsigned int)strlen(progress_append_t->value->cstring));
    prv_progress_append(progress_append_t->value->cstring);
  }

  Tuple *progress_t = dict_find(iter, MESSAGE_KEY_ProgressText);
  if (progress_t) {
    APP_LOG(APP_LOG_LEVEL_DEBUG, "progress text len=%u", (unsigned int)strlen(progress_t->value->cstring));
    prv_set_progress(progress_t->value->cstring);
  }

  Tuple *progress_detail_t = dict_find(iter, MESSAGE_KEY_ProgressDetail);
  if (progress_detail_t) {
    APP_LOG(APP_LOG_LEVEL_DEBUG, "progress detail len=%u", (unsigned int)strlen(progress_detail_t->value->cstring));
    if (!s_progress_mode) {
      prv_progress_reset();
    }
    prv_set_progress_detail(progress_detail_t->value->cstring);
  }

  Tuple *chunk_t = dict_find(iter, MESSAGE_KEY_ResponseChunk);
  if (chunk_t) {
    APP_LOG(APP_LOG_LEVEL_DEBUG, "response chunk len=%u", (unsigned int)strlen(chunk_t->value->cstring));
    prv_append_response(chunk_t->value->cstring);
  }

  Tuple *error_t = dict_find(iter, MESSAGE_KEY_ResponseError);
  if (error_t) {
    APP_LOG(APP_LOG_LEVEL_ERROR, "response error: %s", error_t->value->cstring);
    prv_set_status("Error");
    prv_set_response(error_t->value->cstring);
  }

  Tuple *done_t = dict_find(iter, MESSAGE_KEY_ResponseDone);
  if (done_t) {
    APP_LOG(APP_LOG_LEVEL_DEBUG, "response done chars=%u", (unsigned int)strlen(s_response));
    prv_set_status("Done");
    if (s_response[0] == '\0') {
      prv_set_response("No response text.");
    } else {
      prv_update_scroll_text();
    }
    prv_buzz_response_done();
  }
}

static void prv_inbox_dropped_handler(AppMessageResult reason, void *context) {
  APP_LOG(APP_LOG_LEVEL_ERROR, "inbox dropped reason=%d", reason);
  prv_set_status("Message dropped");
  prv_set_response("Response message dropped. Try again.");
}

static void prv_outbox_failed_handler(DictionaryIterator *iter, AppMessageResult reason, void *context) {
  APP_LOG(APP_LOG_LEVEL_ERROR, "outbox failed reason=%d", reason);
  prv_set_status("Phone failed");
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
  s_progress_width = bounds.size.w - (PROGRESS_TEXT_SIDE_PADDING * 2);
  s_progress_height = bounds.size.h;

  s_text_layer = text_layer_create(GRect(4, 0, s_text_width, s_min_text_height));
  text_layer_set_background_color(s_text_layer, GColorClear);
  text_layer_set_text_color(s_text_layer, GColorBlack);
  text_layer_set_font(s_text_layer, fonts_get_system_font(prv_font_key_for_size(s_font_size)));
  text_layer_set_overflow_mode(s_text_layer, GTextOverflowModeWordWrap);
  text_layer_set_text_alignment(s_text_layer, GTextAlignmentLeft);
  scroll_layer_add_child(s_scroll_layer, text_layer_get_layer(s_text_layer));
  text_layer_enable_screen_text_flow_and_paging(s_text_layer, 4);

  s_progress_layer = layer_create(bounds);
  layer_set_hidden(s_progress_layer, true);
  layer_add_child(window_layer, s_progress_layer);

  s_progress_title_layer = text_layer_create(GRect(PROGRESS_TEXT_SIDE_PADDING, 0, s_progress_width, PROGRESS_TITLE_MAX_HEIGHT));
  text_layer_set_background_color(s_progress_title_layer, GColorClear);
  text_layer_set_text_color(s_progress_title_layer, GColorBlack);
  text_layer_set_font(s_progress_title_layer, fonts_get_system_font(FONT_KEY_GOTHIC_28_BOLD));
  text_layer_set_overflow_mode(s_progress_title_layer, GTextOverflowModeWordWrap);
  text_layer_set_text_alignment(s_progress_title_layer, GTextAlignmentCenter);
  layer_add_child(s_progress_layer, text_layer_get_layer(s_progress_title_layer));

  s_progress_detail_layer = text_layer_create(GRect(PROGRESS_TEXT_SIDE_PADDING, 0, s_progress_width, PROGRESS_DETAIL_MAX_HEIGHT));
  text_layer_set_background_color(s_progress_detail_layer, GColorClear);
  text_layer_set_text_color(s_progress_detail_layer, GColorBlack);
  text_layer_set_font(s_progress_detail_layer, fonts_get_system_font(FONT_KEY_GOTHIC_18));
  text_layer_set_overflow_mode(s_progress_detail_layer, GTextOverflowModeWordWrap);
  text_layer_set_text_alignment(s_progress_detail_layer, GTextAlignmentCenter);
  layer_add_child(s_progress_layer, text_layer_get_layer(s_progress_detail_layer));

  s_progress_loading_layer = layer_create(GRect(0, bounds.size.h - PROGRESS_LOADING_HEIGHT, bounds.size.w, PROGRESS_LOADING_HEIGHT));
  layer_set_update_proc(s_progress_loading_layer, prv_progress_loading_update_proc);
  layer_add_child(s_progress_layer, s_progress_loading_layer);

  prv_set_status("Ready");
  prv_set_response("Press SELECT to dictate.\n\nUse UP/DOWN to scroll responses.");
}

static void prv_window_unload(Window *window) {
  prv_stop_progress_loading();
  layer_destroy(s_progress_loading_layer);
  text_layer_destroy(s_progress_detail_layer);
  text_layer_destroy(s_progress_title_layer);
  layer_destroy(s_progress_layer);
  text_layer_destroy(s_text_layer);
  scroll_layer_destroy(s_scroll_layer);
}

static void prv_init(void) {
  APP_LOG(APP_LOG_LEVEL_DEBUG, "app init");
  if (persist_exists(PERSIST_KEY_FONT_SIZE)) {
    s_font_size = prv_normalize_font_size(persist_read_int(PERSIST_KEY_FONT_SIZE));
  }
  if (persist_exists(PERSIST_KEY_BUZZ_STRENGTH)) {
    s_buzz_strength = prv_normalize_buzz_strength(persist_read_int(PERSIST_KEY_BUZZ_STRENGTH));
  }

  s_window = window_create();
  window_set_background_color(s_window, GColorWhite);
  window_set_window_handlers(s_window, (WindowHandlers) {
    .load = prv_window_load,
    .unload = prv_window_unload,
  });

  app_message_register_inbox_received(prv_inbox_received_handler);
  app_message_register_inbox_dropped(prv_inbox_dropped_handler);
  app_message_register_outbox_failed(prv_outbox_failed_handler);
  app_message_open(app_message_inbox_size_maximum(), app_message_outbox_size_maximum());
  APP_LOG(APP_LOG_LEVEL_DEBUG, "appmessage opened inbox=%lu outbox=%lu", (unsigned long)app_message_inbox_size_maximum(), (unsigned long)app_message_outbox_size_maximum());

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
