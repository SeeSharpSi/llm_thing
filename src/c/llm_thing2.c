#include <pebble.h>
#include <stdlib.h>

#define DICTATION_BUFFER_SIZE 384
#define RESPONSE_BUFFER_SIZE 8192
#define FONT_SIZE_DEFAULT 18
#define BUZZ_STRENGTH_DEFAULT 1
#define SCROLL_LINES_DEFAULT 3
#define PERSIST_KEY_FONT_SIZE 1
#define PERSIST_KEY_BUZZ_STRENGTH 2
#define PERSIST_KEY_START_DICTATION_QUICK_LAUNCH 3
#define PERSIST_KEY_SCROLL_LINES 4
#define PERSIST_KEY_TOUCH_SCROLL_ENABLED 5
#define PERSIST_KEY_SHOW_INPUT_CONTEXT_SIZE 6
#define PERSIST_KEY_SHOW_OUTPUT_CONTEXT_SIZE 7
#define PERSIST_KEY_TEXT_COLOR 10
#define PERSIST_KEY_BACKGROUND_COLOR 11
#define PERSIST_KEY_PROMPT_BACKGROUND_COLOR 12
#define PERSIST_KEY_BOLD_TEXT_COLOR 13
#define TEXT_COLOR_DEFAULT 0x000000
#define BACKGROUND_COLOR_DEFAULT 0xFFFFFF
#define PROMPT_BACKGROUND_COLOR_DEFAULT 0xAAAAAA
#define BOLD_TEXT_COLOR_DEFAULT 0x000000
#define QUICK_LAUNCH_DICTATION_DELAY_MS 250
#define SCROLL_REPEAT_INTERVAL_MS 100
#define TOUCH_DRAG_THRESHOLD 8
#define TOUCH_MOMENTUM_TIMER_MS 30
#define TOUCH_MOMENTUM_MIN_VELOCITY 1
#define TOUCH_MOMENTUM_MAX_VELOCITY 40
#define TOUCH_MOMENTUM_DECAY_NUMERATOR 85
#define TOUCH_MOMENTUM_DECAY_DENOMINATOR 100
#define TEXT_BOTTOM_PADDING 16
#define TEXT_SIDE_PADDING 4
#define PROMPT_BACKGROUND_BOTTOM_PADDING 6
#define TEXT_MEASURE_HEIGHT 32000
#define TEXT_MEASURE_WIDTH 32000
#define TEXT_RUN_BUFFER_SIZE 256
#define TEXT_LAYOUT_CHECKPOINT_STRIDE 8
#define TEXT_LAYOUT_CHECKPOINT_COUNT 256
#define TEXT_LAYOUT_FLAG_BOLD 0x01
#define TEXT_LAYOUT_FLAG_PROMPT 0x02
// Phone-side Markdown parsing sends these non-NUL markers inside ResponseChunk.
#define TEXT_BOLD_ON '\x01'
#define TEXT_BOLD_OFF '\x02'
#define TEXT_PROMPT_ON '\x03'
#define TEXT_PROMPT_OFF '\x04'
#define PROGRESS_TITLE_BUFFER_SIZE 96
#define PROGRESS_DETAIL_BUFFER_SIZE 192
#define PROGRESS_HISTORY_BUFFER_SIZE 256
#define HEALTH_SUMMARY_JSON_SIZE 384
#define HEALTH_SUMMARY_UNAVAILABLE_SIZE 160
#define HEALTH_SUMMARY_ACTIVITIES_SIZE 64
#define PROGRESS_LOADING_HEIGHT 28
#define PROGRESS_LOADING_MARGIN 16
#define PROGRESS_LOADING_TIMER_MS 80
#define PROGRESS_LOADING_STEP 6
#define PROGRESS_CONTEXT_BUFFER_SIZE 32
#define PROGRESS_CONTEXT_HEIGHT 18
#define PROGRESS_CONTEXT_SIDE_PADDING 2
#define PROGRESS_TEXT_SIDE_PADDING 6
#define PROGRESS_TEXT_GAP 4
#define PROGRESS_TITLE_MIN_HEIGHT 32
#define PROGRESS_TITLE_MAX_HEIGHT 60
#define PROGRESS_DETAIL_MIN_HEIGHT 22
#define PROGRESS_DETAIL_MAX_HEIGHT 72
#define PROGRESS_HISTORY_MAX_HEIGHT 240
#define HOME_CARD_MARGIN 8
#define HOME_CARD_RADIUS 8
#define HOME_BUTTON_WIDTH 82
#define HOME_BUTTON_HEIGHT 24
#define APP_MESSAGE_INBOX_SIZE 1024
#define APP_MESSAGE_OUTBOX_SIZE 512

typedef struct {
  uint16_t offset;
  uint8_t flags;
} TextLayoutCheckpoint;

static Window *s_window;
static ScrollLayer *s_scroll_layer;
static Layer *s_text_layer;
static Layer *s_progress_layer;
static TextLayer *s_progress_history_layer;
static TextLayer *s_progress_title_layer;
static TextLayer *s_progress_detail_layer;
static TextLayer *s_progress_input_context_layer;
static TextLayer *s_progress_output_context_layer;
static Layer *s_progress_loading_layer;
static AppTimer *s_progress_loading_timer;
static AppTimer *s_quick_launch_dictation_timer;
#if defined(PBL_MICROPHONE)
static DictationSession *s_dictation_session;
#endif

static char s_response[RESPONSE_BUFFER_SIZE];
static char s_text_run[TEXT_RUN_BUFFER_SIZE];
static char s_progress_title[PROGRESS_TITLE_BUFFER_SIZE];
static char s_progress_detail[PROGRESS_DETAIL_BUFFER_SIZE];
static char s_progress_history[PROGRESS_HISTORY_BUFFER_SIZE];
static char s_progress_input_context[PROGRESS_CONTEXT_BUFFER_SIZE];
static char s_progress_output_context[PROGRESS_CONTEXT_BUFFER_SIZE];
#if defined(PBL_HEALTH)
static char s_health_summary_json[HEALTH_SUMMARY_JSON_SIZE];
static char s_health_summary_unavailable[HEALTH_SUMMARY_UNAVAILABLE_SIZE];
static char s_health_summary_activities[HEALTH_SUMMARY_ACTIVITIES_SIZE];
#endif
static TextLayoutCheckpoint s_text_layout_checkpoints[TEXT_LAYOUT_CHECKPOINT_COUNT];
static int16_t s_text_width;
static int16_t s_text_layer_width;
static int16_t s_min_text_height;
static int16_t s_progress_width;
static int16_t s_progress_height;
static int32_t s_scroll_content_height;
static int32_t s_scroll_text_height;
static int32_t s_latest_prompt_y;
static uint16_t s_text_layout_checkpoint_count;
static int s_font_size = FONT_SIZE_DEFAULT;
static int s_buzz_strength = BUZZ_STRENGTH_DEFAULT;
static int s_scroll_lines = SCROLL_LINES_DEFAULT;
static GColor s_text_color;
static GColor s_background_color;
static GColor s_prompt_background_color;
static GColor s_bold_text_color;
static uint32_t s_request_id;
static uint16_t s_progress_loading_frame;
static bool s_start_dictation_quick_launch;
static bool s_launched_from_quick_launch;
static bool s_quick_launch_dictation_started;
static bool s_response_truncated;
static bool s_progress_mode;
static bool s_show_input_context_size;
static bool s_show_output_context_size;
static bool s_chat_started;
static bool s_chat_reset_pending = true;
static bool s_home_screen_visible;

#if defined(PBL_TOUCH)
static AppTimer *s_touch_momentum_timer;
static bool s_touch_active;
static bool s_touch_scroll_enabled = true;
static bool s_touch_threshold_met;
static int16_t s_touch_start_y;
static int32_t s_touch_start_offset_y;
static int32_t s_touch_velocity_y;
#endif

static void prv_update_scroll_text(void);
static void prv_text_layer_update_proc(Layer *layer, GContext *ctx);
static void prv_set_response(const char *text);

static void prv_progress_loading_timer_callback(void *context);
#if defined(PBL_TOUCH)
static void prv_touch_momentum_timer_callback(void *context);
static void prv_stop_touch_momentum(void);
#endif

static void prv_set_status(const char *text) {
  (void)text;
}

#if defined(PBL_MICROPHONE)
static bool prv_ui_loaded(void) {
  return s_scroll_layer && s_text_layer;
}
#endif

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

static const char *prv_bold_font_key_for_size(int size) {
  switch (prv_normalize_font_size(size)) {
    case 14:
      return FONT_KEY_GOTHIC_14_BOLD;
    case 24:
      return FONT_KEY_GOTHIC_24_BOLD;
    case 28:
      return FONT_KEY_GOTHIC_28_BOLD;
    case 18:
    default:
      return FONT_KEY_GOTHIC_18_BOLD;
  }
}

static int prv_normalize_buzz_strength(int strength) {
  if (strength >= 0 && strength <= 3) {
    return strength;
  }

  return BUZZ_STRENGTH_DEFAULT;
}

static int prv_normalize_scroll_lines(int lines) {
  if (lines >= 1 && lines <= 10) {
    return lines;
  }

  return SCROLL_LINES_DEFAULT;
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

static uint32_t prv_uint32_from_tuple(Tuple *tuple, uint32_t fallback) {
  if (!tuple) {
    return fallback;
  }

  if (tuple->type == TUPLE_CSTRING) {
    return (uint32_t)atol(tuple->value->cstring);
  }
  if (tuple->type == TUPLE_INT) {
    return (uint32_t)tuple->value->int32;
  }

  return tuple->value->uint32;
}

static void prv_update_progress_context_layers(void) {
  if (s_progress_input_context_layer) {
    text_layer_set_text(s_progress_input_context_layer, s_progress_input_context);
    layer_set_hidden(text_layer_get_layer(s_progress_input_context_layer),
        !s_progress_mode || !s_show_input_context_size || s_progress_input_context[0] == '\0');
  }
  if (s_progress_output_context_layer) {
    text_layer_set_text(s_progress_output_context_layer, s_progress_output_context);
    layer_set_hidden(text_layer_get_layer(s_progress_output_context_layer),
        !s_progress_mode || !s_show_output_context_size || s_progress_output_context[0] == '\0');
  }
}

static void prv_apply_show_input_context_size(int enabled, bool should_persist) {
  s_show_input_context_size = enabled != 0;

  if (should_persist) {
    persist_write_int(PERSIST_KEY_SHOW_INPUT_CONTEXT_SIZE, s_show_input_context_size ? 1 : 0);
  }

  prv_update_progress_context_layers();
}

static void prv_apply_show_output_context_size(int enabled, bool should_persist) {
  s_show_output_context_size = enabled != 0;

  if (should_persist) {
    persist_write_int(PERSIST_KEY_SHOW_OUTPUT_CONTEXT_SIZE, s_show_output_context_size ? 1 : 0);
  }

  prv_update_progress_context_layers();
}

static void prv_apply_buzz_strength(int strength, bool should_persist) {
  s_buzz_strength = prv_normalize_buzz_strength(strength);

  if (should_persist) {
    persist_write_int(PERSIST_KEY_BUZZ_STRENGTH, s_buzz_strength);
  }
}

static void prv_apply_scroll_lines(int lines, bool should_persist) {
  s_scroll_lines = prv_normalize_scroll_lines(lines);

  if (should_persist) {
    persist_write_int(PERSIST_KEY_SCROLL_LINES, s_scroll_lines);
  }
}

static void prv_apply_start_dictation_quick_launch(int enabled, bool should_persist) {
  s_start_dictation_quick_launch = enabled != 0;

  if (!s_start_dictation_quick_launch && s_quick_launch_dictation_timer) {
    app_timer_cancel(s_quick_launch_dictation_timer);
    s_quick_launch_dictation_timer = NULL;
  }

  if (should_persist) {
    persist_write_int(PERSIST_KEY_START_DICTATION_QUICK_LAUNCH, s_start_dictation_quick_launch ? 1 : 0);
  }
}

#if defined(PBL_TOUCH)
static void prv_apply_touch_scroll_enabled(int enabled, bool should_persist) {
  s_touch_scroll_enabled = enabled != 0;

  if (!s_touch_scroll_enabled) {
    prv_stop_touch_momentum();
    s_touch_active = false;
    s_touch_threshold_met = false;
  }

  if (should_persist) {
    persist_write_int(PERSIST_KEY_TOUCH_SCROLL_ENABLED, s_touch_scroll_enabled ? 1 : 0);
  }
}
#endif

static GColor prv_color_from_hex(uint32_t hex) {
#if defined(PBL_COLOR)
  return GColorFromHEX(hex);
#else
  return hex == 0x000000 ? GColorBlack : GColorWhite;
#endif
}

static void prv_apply_text_color(uint32_t hex, bool should_persist) {
  s_text_color = prv_color_from_hex(hex);

  if (should_persist) {
    persist_write_int(PERSIST_KEY_TEXT_COLOR, hex);
  }

  if (s_progress_title_layer) {
    text_layer_set_text_color(s_progress_title_layer, s_text_color);
  }
  if (s_progress_detail_layer) {
    text_layer_set_text_color(s_progress_detail_layer, s_text_color);
  }
  if (s_progress_history_layer) {
    text_layer_set_text_color(s_progress_history_layer, s_text_color);
  }
  if (s_progress_input_context_layer) {
    text_layer_set_text_color(s_progress_input_context_layer, s_text_color);
  }
  if (s_progress_output_context_layer) {
    text_layer_set_text_color(s_progress_output_context_layer, s_text_color);
  }
  if (s_text_layer) {
    layer_mark_dirty(s_text_layer);
  }
}

static void prv_apply_background_color(uint32_t hex, bool should_persist) {
  s_background_color = prv_color_from_hex(hex);

  if (should_persist) {
    persist_write_int(PERSIST_KEY_BACKGROUND_COLOR, hex);
  }

  if (s_window) {
    window_set_background_color(s_window, s_background_color);
  }
  if (s_text_layer) {
    layer_mark_dirty(s_text_layer);
  }
}

static void prv_apply_prompt_background_color(uint32_t hex, bool should_persist) {
  s_prompt_background_color = prv_color_from_hex(hex);

  if (should_persist) {
    persist_write_int(PERSIST_KEY_PROMPT_BACKGROUND_COLOR, hex);
  }

  if (s_text_layer) {
    layer_mark_dirty(s_text_layer);
  }
}

static void prv_apply_bold_text_color(uint32_t hex, bool should_persist) {
  s_bold_text_color = prv_color_from_hex(hex);

  if (should_persist) {
    persist_write_int(PERSIST_KEY_BOLD_TEXT_COLOR, hex);
  }

  if (s_text_layer) {
    layer_mark_dirty(s_text_layer);
  }
  if (s_progress_loading_layer) {
    layer_mark_dirty(s_progress_loading_layer);
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
    prv_update_scroll_text();
  }
}

static GFont prv_response_font(bool bold) {
  return fonts_get_system_font(bold ? prv_bold_font_key_for_size(s_font_size) : prv_font_key_for_size(s_font_size));
}

static void prv_copy_text_run(const char *text, size_t length) {
  if (length >= sizeof(s_text_run)) {
    length = sizeof(s_text_run) - 1;
  }

  memcpy(s_text_run, text, length);
  s_text_run[length] = '\0';
}

static int16_t prv_measure_text_width(const char *text, GFont font) {
  GSize size = graphics_text_layout_get_content_size(text, font,
      GRect(0, 0, TEXT_MEASURE_WIDTH, TEXT_MEASURE_HEIGHT),
      GTextOverflowModeTrailingEllipsis, GTextAlignmentLeft);

  if (size.w <= 0 && text[0] != '\0') {
    return 1;
  }

  return size.w;
}

static int16_t prv_line_height(void) {
  GFont normal_font = prv_response_font(false);
  GFont bold_font = prv_response_font(true);
  GSize normal_size = graphics_text_layout_get_content_size("Ag", normal_font,
      GRect(0, 0, TEXT_MEASURE_WIDTH, TEXT_MEASURE_HEIGHT),
      GTextOverflowModeTrailingEllipsis, GTextAlignmentLeft);
  GSize bold_size = graphics_text_layout_get_content_size("Ag", bold_font,
      GRect(0, 0, TEXT_MEASURE_WIDTH, TEXT_MEASURE_HEIGHT),
      GTextOverflowModeTrailingEllipsis, GTextAlignmentLeft);
  int16_t height = normal_size.h > bold_size.h ? normal_size.h : bold_size.h;

  if (height <= 0) {
    height = s_font_size + 4;
  }

  return height;
}

static int16_t prv_space_width(GFont font) {
  int16_t x_width = prv_measure_text_width("x", font);
  int16_t spaced_width = prv_measure_text_width("x x", font);
  int16_t width = spaced_width - (x_width * 2);

  if (width <= 0) {
    width = s_font_size / 3;
  }
  if (width <= 0) {
    width = 1;
  }

  return width;
}

static size_t prv_safe_chunk_length(const char *text, size_t length) {
  size_t chunk_length = length < sizeof(s_text_run) - 1 ? length : sizeof(s_text_run) - 1;

  if (chunk_length < length) {
    while (chunk_length > 1 && (((uint8_t)text[chunk_length] & 0xc0) == 0x80)) {
      chunk_length -= 1;
    }
  }
  if (chunk_length == 0) {
    chunk_length = 1;
  }

  return chunk_length;
}

static size_t prv_fit_chunk_length(const char *text, size_t length, GFont font) {
  size_t chunk_length = prv_safe_chunk_length(text, length);

  while (chunk_length > 1) {
    prv_copy_text_run(text, chunk_length);
    if (prv_measure_text_width(s_text_run, font) <= s_text_width) {
      break;
    }
    chunk_length = prv_safe_chunk_length(text, chunk_length / 2);
  }

  return chunk_length;
}

static uint8_t prv_text_layout_flags(bool bold, bool prompt) {
  uint8_t flags = 0;

  if (bold) {
    flags |= TEXT_LAYOUT_FLAG_BOLD;
  }
  if (prompt) {
    flags |= TEXT_LAYOUT_FLAG_PROMPT;
  }

  return flags;
}

static void prv_record_text_layout_checkpoint(const char *line_start, bool bold, bool prompt,
                                              int16_t y, int16_t line_height) {
  int32_t line_index;
  uint16_t checkpoint_index;

  if (!line_start || line_height <= 0 || y < 0) {
    return;
  }

  line_index = y / line_height;
  if (line_index % TEXT_LAYOUT_CHECKPOINT_STRIDE != 0) {
    return;
  }

  checkpoint_index = (uint16_t)(line_index / TEXT_LAYOUT_CHECKPOINT_STRIDE);
  if (checkpoint_index >= TEXT_LAYOUT_CHECKPOINT_COUNT) {
    return;
  }

  s_text_layout_checkpoints[checkpoint_index].offset = (uint16_t)(line_start - s_response);
  s_text_layout_checkpoints[checkpoint_index].flags = prv_text_layout_flags(bold, prompt);
  if (s_text_layout_checkpoint_count <= checkpoint_index) {
    s_text_layout_checkpoint_count = checkpoint_index + 1;
  }
}

static bool prv_line_visible(int16_t y, int16_t height, int32_t visible_top, int32_t visible_bottom) {
  return (int32_t)y + height >= visible_top && y <= visible_bottom;
}

static void prv_fill_prompt_line(GContext *ctx, bool should_draw, bool prompt,
                                 int16_t y, int16_t line_height, int16_t *filled_y,
                                 int32_t visible_top, int32_t visible_bottom) {
  if (!prompt || *filled_y == y) {
    return;
  }

  *filled_y = y;
  if (!should_draw || !ctx || !prv_line_visible(y, line_height + PROMPT_BACKGROUND_BOTTOM_PADDING, visible_top, visible_bottom)) {
    return;
  }

  graphics_context_set_fill_color(ctx, s_prompt_background_color);
  graphics_fill_rect(ctx, GRect(0, y, s_text_layer_width, line_height + PROMPT_BACKGROUND_BOTTOM_PADDING), 0, GCornerNone);
}

static void prv_layout_word(const char *text, size_t length, bool bold, bool prompt, GContext *ctx,
                            bool should_draw, int16_t *x, int16_t *y, int16_t line_height,
                            int16_t *prompt_filled_y, bool record_checkpoints,
                            int32_t visible_top, int32_t visible_bottom) {
  GFont font = prv_response_font(bold || prompt);

  while (length > 0) {
    size_t chunk_length = prv_fit_chunk_length(text, length, font);
    int16_t width;
    int16_t draw_width;

    prv_copy_text_run(text, chunk_length);
    width = prv_measure_text_width(s_text_run, font);
    if (width <= 0) {
      width = 1;
    }

    if (*x > 0 && *x + width > s_text_width) {
      *x = 0;
      *y += line_height;
      if (record_checkpoints) {
        prv_record_text_layout_checkpoint(text, bold, prompt, *y, line_height);
      }
    }

    prv_fill_prompt_line(ctx, should_draw, prompt, *y, line_height, prompt_filled_y, visible_top, visible_bottom);

    draw_width = width;
    if (draw_width > s_text_width - *x) {
      draw_width = s_text_width - *x;
    }

    if (should_draw && ctx && draw_width > 0 && prv_line_visible(*y, line_height, visible_top, visible_bottom)) {
      graphics_context_set_text_color(ctx, bold ? s_bold_text_color : s_text_color);
      graphics_draw_text(ctx, s_text_run, font, GRect(*x + TEXT_SIDE_PADDING, *y, draw_width + 2, line_height),
          GTextOverflowModeTrailingEllipsis, GTextAlignmentLeft, NULL);
    }

    *x += width;
    if (*x > s_text_width) {
      *x = s_text_width;
    }

    text += chunk_length;
    length -= chunk_length;
  }
}

static void prv_layout_spaces(const char *text, size_t length, bool bold, bool prompt, GContext *ctx,
                              bool should_draw, int16_t *x, int16_t *y, int16_t line_height,
                              int16_t *prompt_filled_y, bool record_checkpoints,
                              int32_t visible_top, int32_t visible_bottom) {
  GFont font = prv_response_font(bold || prompt);
  int16_t space_width = prv_space_width(font);
  int32_t width = 0;
  size_t i;

  if (*x == 0) {
    return;
  }

  prv_fill_prompt_line(ctx, should_draw, prompt, *y, line_height, prompt_filled_y, visible_top, visible_bottom);

  for (i = 0; i < length; i += 1) {
    width += text[i] == '\t' ? space_width * 2 : space_width;
  }

  if ((int32_t)*x + width > s_text_width) {
    *x = 0;
    *y += line_height;
    if (record_checkpoints) {
      prv_record_text_layout_checkpoint(text + length, bold, prompt, *y, line_height);
    }
    prv_fill_prompt_line(ctx, should_draw, prompt, *y, line_height, prompt_filled_y, visible_top, visible_bottom);
    return;
  }

  *x += (int16_t)width;
}

static int16_t prv_layout_response_text(GContext *ctx, bool should_draw, int32_t *latest_prompt_y,
                                        uint16_t start_offset, int16_t start_y,
                                        bool start_bold, bool start_prompt,
                                        bool record_checkpoints,
                                        int32_t visible_top, int32_t visible_bottom) {
  const char *cursor = s_response + start_offset;
  int16_t x = 0;
  int16_t y = start_y;
  int16_t line_height = prv_line_height();
  int16_t prompt_filled_y = -1;
  bool bold = start_bold;
  bool prompt = start_prompt;

  if (latest_prompt_y) {
    *latest_prompt_y = 0;
  }

  if (record_checkpoints) {
    s_text_layout_checkpoint_count = 0;
    prv_record_text_layout_checkpoint(cursor, bold, prompt, y, line_height);
  }

  if (should_draw && ctx) {
    graphics_context_set_text_color(ctx, s_text_color);
  }

  while (*cursor != '\0' && y < TEXT_MEASURE_HEIGHT - line_height) {
    if (should_draw && y > visible_bottom) {
      break;
    }

    if (*cursor == TEXT_BOLD_ON) {
      bold = true;
      cursor += 1;
    } else if (*cursor == TEXT_BOLD_OFF) {
      bold = false;
      cursor += 1;
    } else if (*cursor == TEXT_PROMPT_ON) {
      prompt = true;
      if (latest_prompt_y) {
        *latest_prompt_y = y;
      }
      cursor += 1;
    } else if (*cursor == TEXT_PROMPT_OFF) {
      prompt = false;
      cursor += 1;
    } else if (*cursor == '\n') {
      prv_fill_prompt_line(ctx, should_draw, prompt, y, line_height, &prompt_filled_y, visible_top, visible_bottom);
      x = 0;
      y += line_height;
      cursor += 1;
      if (record_checkpoints) {
        prv_record_text_layout_checkpoint(cursor, bold, prompt, y, line_height);
      }
    } else if (*cursor == ' ' || *cursor == '\t') {
      const char *start = cursor;
      while (*cursor == ' ' || *cursor == '\t') {
        cursor += 1;
      }
      prv_layout_spaces(start, cursor - start, bold, prompt, ctx, should_draw, &x, &y, line_height, &prompt_filled_y,
          record_checkpoints, visible_top, visible_bottom);
    } else {
      const char *start = cursor;
      while (*cursor != '\0' && *cursor != TEXT_BOLD_ON && *cursor != TEXT_BOLD_OFF &&
             *cursor != TEXT_PROMPT_ON && *cursor != TEXT_PROMPT_OFF &&
             *cursor != '\n' && *cursor != ' ' && *cursor != '\t') {
        cursor += 1;
      }
      prv_layout_word(start, cursor - start, bold, prompt, ctx, should_draw, &x, &y, line_height, &prompt_filled_y,
          record_checkpoints, visible_top, visible_bottom);
    }
  }

  return y + line_height;
}

static void prv_update_scroll_text(void) {
  if (!s_text_layer || !s_scroll_layer) {
    return;
  }

  int32_t latest_prompt_y = 0;
  int32_t measured_height = prv_layout_response_text(NULL, false, &latest_prompt_y,
      0, 0, false, false, true, 0, TEXT_MEASURE_HEIGHT);
  int32_t text_height = measured_height + s_font_size + TEXT_BOTTOM_PADDING;
  int32_t scroll_height;

  s_latest_prompt_y = latest_prompt_y;

  if (text_height < s_min_text_height) {
    text_height = s_min_text_height;
  }
  if (s_latest_prompt_y > 0 && text_height < s_latest_prompt_y + s_min_text_height) {
    text_height = s_latest_prompt_y + s_min_text_height;
  }
  s_scroll_text_height = text_height;

  scroll_height = text_height;

  if (scroll_height > TEXT_MEASURE_HEIGHT) {
    scroll_height = TEXT_MEASURE_HEIGHT;
  }

  s_scroll_content_height = scroll_height;
  layer_set_frame(s_text_layer, GRect(0, 0, s_text_layer_width, scroll_height));
  layer_mark_dirty(s_text_layer);
  scroll_layer_set_content_size(s_scroll_layer, GSize(s_text_layer_width, scroll_height));
}

static int32_t prv_min_scroll_offset_y(void) {
  int32_t min_y = s_min_text_height - s_scroll_text_height;

  if (min_y < -TEXT_MEASURE_HEIGHT) {
    min_y = -TEXT_MEASURE_HEIGHT;
  }
  if (min_y > 0) {
    min_y = 0;
  }

  return min_y;
}

static int32_t prv_clamp_scroll_offset_y(int32_t offset_y) {
  int32_t min_y = prv_min_scroll_offset_y();

  if (offset_y < min_y) {
    offset_y = min_y;
  }
  if (offset_y > 0) {
    offset_y = 0;
  }

  return offset_y;
}

static void prv_scroll_to_latest_prompt(bool animated) {
  int32_t offset_y;

  if (!s_scroll_layer) {
    return;
  }

#if defined(PBL_TOUCH)
  prv_stop_touch_momentum();
#endif

  offset_y = prv_clamp_scroll_offset_y(-s_latest_prompt_y);

  scroll_layer_set_content_offset(s_scroll_layer, GPoint(0, (int16_t)offset_y), animated);
}

static void prv_scroll_by_lines(int lines, bool animated) {
  int32_t line_height;
  int32_t next_y;
  GPoint offset;

  if (!s_scroll_layer || s_scroll_text_height <= s_min_text_height) {
    return;
  }

#if defined(PBL_TOUCH)
  prv_stop_touch_momentum();
#endif

  line_height = prv_line_height();
  offset = scroll_layer_get_content_offset(s_scroll_layer);
  next_y = prv_clamp_scroll_offset_y(offset.y - ((int32_t)lines * line_height));

  scroll_layer_set_content_offset(s_scroll_layer, GPoint(0, (int16_t)next_y), animated);
}

#if defined(PBL_TOUCH)
static int32_t prv_abs32(int32_t value) {
  return value < 0 ? -value : value;
}

static void prv_stop_touch_momentum(void) {
  if (s_touch_momentum_timer) {
    app_timer_cancel(s_touch_momentum_timer);
    s_touch_momentum_timer = NULL;
  }

  s_touch_velocity_y = 0;
}

static void prv_schedule_touch_momentum(void) {
  if (!s_touch_momentum_timer) {
    s_touch_momentum_timer = app_timer_register(TOUCH_MOMENTUM_TIMER_MS,
        prv_touch_momentum_timer_callback, NULL);
  }
}

static void prv_start_touch_momentum(void) {
  if (!s_scroll_layer || s_progress_mode || s_home_screen_visible ||
      s_scroll_text_height <= s_min_text_height ||
      prv_abs32(s_touch_velocity_y) <= TOUCH_MOMENTUM_MIN_VELOCITY) {
    s_touch_velocity_y = 0;
    return;
  }

  prv_schedule_touch_momentum();
}

static void prv_touch_momentum_timer_callback(void *context) {
  (void)context;
  s_touch_momentum_timer = NULL;

  if (!s_scroll_layer || s_touch_active || s_progress_mode || s_home_screen_visible ||
      s_scroll_text_height <= s_min_text_height ||
      prv_abs32(s_touch_velocity_y) <= TOUCH_MOMENTUM_MIN_VELOCITY) {
    s_touch_velocity_y = 0;
    return;
  }

  GPoint offset = scroll_layer_get_content_offset(s_scroll_layer);
  int32_t next_y = prv_clamp_scroll_offset_y(offset.y + s_touch_velocity_y);

  if (next_y == offset.y) {
    s_touch_velocity_y = 0;
    return;
  }

  scroll_layer_set_content_offset(s_scroll_layer, GPoint(0, (int16_t)next_y), false);

  s_touch_velocity_y = (s_touch_velocity_y * TOUCH_MOMENTUM_DECAY_NUMERATOR) /
      TOUCH_MOMENTUM_DECAY_DENOMINATOR;
  if (prv_abs32(s_touch_velocity_y) > TOUCH_MOMENTUM_MIN_VELOCITY) {
    prv_schedule_touch_momentum();
  } else {
    s_touch_velocity_y = 0;
  }
}

static void prv_touch_handler(const TouchEvent *event, void *context) {
  (void)context;

  if (!s_scroll_layer || !s_touch_scroll_enabled || s_progress_mode || s_home_screen_visible) {
    return;
  }

  if (s_scroll_text_height <= s_min_text_height) {
    return;
  }

  switch (event->type) {
    case TouchEvent_Touchdown:
      prv_stop_touch_momentum();
      s_touch_active = false;
      s_touch_threshold_met = false;
      s_touch_start_y = event->y;
      s_touch_start_offset_y = scroll_layer_get_content_offset(s_scroll_layer).y;
      break;
    case TouchEvent_PositionUpdate: {
      int32_t delta = (int32_t)event->y - (int32_t)s_touch_start_y;

      if (!s_touch_threshold_met) {
        if (delta < -TOUCH_DRAG_THRESHOLD || delta > TOUCH_DRAG_THRESHOLD) {
          s_touch_threshold_met = true;
          s_touch_active = true;
        } else {
          break;
        }
      }

      GPoint offset = scroll_layer_get_content_offset(s_scroll_layer);
      int32_t next_y = prv_clamp_scroll_offset_y(s_touch_start_offset_y + delta);
      s_touch_velocity_y = next_y - offset.y;
      if (s_touch_velocity_y > TOUCH_MOMENTUM_MAX_VELOCITY) {
        s_touch_velocity_y = TOUCH_MOMENTUM_MAX_VELOCITY;
      } else if (s_touch_velocity_y < -TOUCH_MOMENTUM_MAX_VELOCITY) {
        s_touch_velocity_y = -TOUCH_MOMENTUM_MAX_VELOCITY;
      }

      scroll_layer_set_content_offset(s_scroll_layer, GPoint(0, (int16_t)next_y), false);
      break;
    }
    case TouchEvent_Liftoff:
      if (s_touch_threshold_met) {
        prv_start_touch_momentum();
      } else {
        s_touch_velocity_y = 0;
      }
      s_touch_active = false;
      s_touch_threshold_met = false;
      break;
  }
}
#endif

static void prv_draw_home_button(GContext *ctx, const char *text, GRect frame) {
  graphics_context_set_fill_color(ctx, s_text_color);
  graphics_fill_rect(ctx, frame, HOME_BUTTON_HEIGHT / 2, GCornersAll);
  graphics_context_set_text_color(ctx, s_background_color);
  graphics_draw_text(ctx, text, fonts_get_system_font(FONT_KEY_GOTHIC_18_BOLD), frame,
      GTextOverflowModeTrailingEllipsis, GTextAlignmentCenter, NULL);
}

static void prv_draw_home_centered_text(GContext *ctx, const char *text, GFont font, GRect frame) {
  graphics_context_set_text_color(ctx, s_text_color);
  graphics_draw_text(ctx, text, font, frame,
      GTextOverflowModeTrailingEllipsis, GTextAlignmentCenter, NULL);
}

static void prv_draw_home_screen(GContext *ctx, GRect bounds) {
  int16_t margin = HOME_CARD_MARGIN;
  int16_t card_width;
  int16_t card_height;
  GRect card;
  int16_t center_x;
  int16_t y;

#if defined(PBL_ROUND)
  margin = 18;
#endif

  card_width = bounds.size.w - (margin * 2);
  card_height = bounds.size.h - (margin * 2);
  card = GRect(margin, margin, card_width, card_height);
  center_x = card.origin.x + (card.size.w / 2);
  y = card.origin.y + 10;

  graphics_context_set_fill_color(ctx, s_background_color);
  graphics_fill_rect(ctx, card, HOME_CARD_RADIUS, GCornersAll);

  prv_draw_home_centered_text(ctx, "llm_thing", fonts_get_system_font(FONT_KEY_GOTHIC_28_BOLD),
      GRect(card.origin.x + 8, y, card.size.w - 16, 28));
  y += 34;

  graphics_context_set_fill_color(ctx, s_bold_text_color);
  graphics_fill_rect(ctx, GRect(card.origin.x + 26, y, card.size.w - 52, 3), 1, GCornersAll);
  y += 21;

  prv_draw_home_button(ctx, "SELECT", GRect(center_x - (HOME_BUTTON_WIDTH / 2), y,
      HOME_BUTTON_WIDTH, HOME_BUTTON_HEIGHT));
  y += HOME_BUTTON_HEIGHT + 2;
  prv_draw_home_centered_text(ctx, "Dictate a prompt", fonts_get_system_font(FONT_KEY_GOTHIC_18),
      GRect(card.origin.x + 8, y, card.size.w - 16, 20));
  y += 40;

  prv_draw_home_button(ctx, "UP/DOWN", GRect(center_x - (HOME_BUTTON_WIDTH / 2), y,
      HOME_BUTTON_WIDTH, HOME_BUTTON_HEIGHT));
  y += HOME_BUTTON_HEIGHT + 2;
  prv_draw_home_centered_text(ctx, "Scroll responses", fonts_get_system_font(FONT_KEY_GOTHIC_18),
      GRect(card.origin.x + 8, y, card.size.w - 16, 20));
}

static void prv_draw_response_text(GContext *ctx) {
  int16_t line_height = prv_line_height();
  int32_t visible_top = 0;
  int32_t visible_bottom;
  uint16_t start_offset = 0;
  int16_t start_y = 0;
  bool bold = false;
  bool prompt = false;

  if (s_scroll_layer) {
    visible_top = -scroll_layer_get_content_offset(s_scroll_layer).y;
    if (visible_top < 0) {
      visible_top = 0;
    }
  }

  visible_bottom = visible_top + s_min_text_height + line_height;

  if (line_height > 0 && s_text_layout_checkpoint_count > 0) {
    uint16_t checkpoint_index = (uint16_t)((visible_top / line_height) / TEXT_LAYOUT_CHECKPOINT_STRIDE);

    if (checkpoint_index < s_text_layout_checkpoint_count) {
      TextLayoutCheckpoint *checkpoint = &s_text_layout_checkpoints[checkpoint_index];
      start_offset = checkpoint->offset;
      start_y = (int16_t)(checkpoint_index * TEXT_LAYOUT_CHECKPOINT_STRIDE * line_height);
      bold = (checkpoint->flags & TEXT_LAYOUT_FLAG_BOLD) != 0;
      prompt = (checkpoint->flags & TEXT_LAYOUT_FLAG_PROMPT) != 0;
    }
  }

  prv_layout_response_text(ctx, true, NULL, start_offset, start_y, bold, prompt, false,
      visible_top - line_height, visible_bottom);
}

static void prv_text_layer_update_proc(Layer *layer, GContext *ctx) {
  GRect bounds = layer_get_bounds(layer);

  graphics_context_set_fill_color(ctx, s_background_color);
  graphics_fill_rect(ctx, bounds, 0, GCornerNone);

  if (s_home_screen_visible) {
    prv_draw_home_screen(ctx, bounds);
    return;
  }

  prv_draw_response_text(ctx);
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

  graphics_context_set_fill_color(ctx, s_prompt_background_color);
  graphics_fill_rect(ctx, GRect(x0, y - 1, track_width, 2), 0, GCornerNone);

  if (right > left) {
    graphics_context_set_fill_color(ctx, s_bold_text_color);
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
  prv_update_progress_context_layers();

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
  int16_t history_height = 0;
  int16_t title_height;
  int16_t detail_height = 0;
  int16_t title_y;
  int16_t detail_available;
  int16_t max_y;

  if (s_progress_history_layer) {
    text_layer_set_size(s_progress_history_layer, GSize(s_progress_width, PROGRESS_HISTORY_MAX_HEIGHT));
    text_layer_set_text(s_progress_history_layer, s_progress_history);
  }
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
  if (s_progress_history_layer && s_progress_history[0] != '\0') {
    history_height = prv_clamp_int16(text_layer_get_content_size(s_progress_history_layer).h, PROGRESS_DETAIL_MIN_HEIGHT, PROGRESS_HISTORY_MAX_HEIGHT);
  }

  title_y = (s_progress_height - title_height) / 2;
  max_y = s_progress_height - PROGRESS_LOADING_HEIGHT - title_height;
  if (max_y < 0) {
    max_y = 0;
  }
  if (title_y > max_y) {
    title_y = max_y;
  }
  if (title_y < 0) {
    title_y = 0;
  }

  if (detail_height) {
    detail_available = s_progress_height - PROGRESS_LOADING_HEIGHT - (title_y + title_height + PROGRESS_TEXT_GAP);
    if (detail_available < PROGRESS_DETAIL_MIN_HEIGHT) {
      detail_height = 0;
    } else if (detail_height > detail_available) {
      detail_height = detail_available;
    }
  }

  if (s_progress_history_layer) {
    layer_set_hidden(text_layer_get_layer(s_progress_history_layer), history_height == 0);
    if (history_height) {
      layer_set_frame(text_layer_get_layer(s_progress_history_layer), GRect(PROGRESS_TEXT_SIDE_PADDING, title_y - PROGRESS_TEXT_GAP - history_height, s_progress_width, history_height));
    }
  }
  layer_set_frame(text_layer_get_layer(s_progress_title_layer), GRect(PROGRESS_TEXT_SIDE_PADDING, title_y, s_progress_width, title_height));
  layer_set_hidden(text_layer_get_layer(s_progress_detail_layer), detail_height == 0);
  if (detail_height) {
    layer_set_frame(text_layer_get_layer(s_progress_detail_layer), GRect(PROGRESS_TEXT_SIDE_PADDING, title_y + title_height + PROGRESS_TEXT_GAP, s_progress_width, detail_height));
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

static void prv_set_progress_history(const char *text) {
  snprintf(s_progress_history, sizeof(s_progress_history), "%s", text ? text : "");
  prv_update_progress_text();
}

static void prv_set_progress_input_context(const char *text) {
  snprintf(s_progress_input_context, sizeof(s_progress_input_context), "%s", text ? text : "");
  prv_update_progress_context_layers();
}

static void prv_set_progress_output_context(const char *text) {
  snprintf(s_progress_output_context, sizeof(s_progress_output_context), "%s", text ? text : "");
  prv_update_progress_context_layers();
}

static bool prv_trim_oldest_turn(void) {
  char *next_turn;

  if (s_response[0] == '\0') {
    return false;
  }

  next_turn = strchr(s_response + 1, TEXT_PROMPT_ON);

  if (next_turn) {
    memmove(s_response, next_turn, strlen(next_turn) + 1);
    s_response_truncated = false;
    return true;
  }

  s_response[0] = '\0';
  s_response_truncated = false;
  return true;
}

static void prv_append_text_limited(const char *text) {
  size_t used = strlen(s_response);
  size_t incoming = strlen(text);

  while (used + incoming >= sizeof(s_response) && prv_trim_oldest_turn()) {
    used = strlen(s_response);
  }

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

#if defined(PBL_MICROPHONE)
static void prv_append_prompt(const char *text) {
  prv_show_response_view();
  s_home_screen_visible = false;
  s_response_truncated = false;

  if (!s_chat_started) {
    s_response[0] = '\0';
    s_chat_started = true;
  } else if (s_response[0] != '\0') {
    prv_append_text_limited("\n\n");
  }

  prv_append_text_limited("\x03");
  prv_append_text_limited(text);
  prv_append_text_limited("\x04\n\n");
  prv_update_scroll_text();
  prv_scroll_to_latest_prompt(false);
}

static void prv_preserve_chat_or_set_response(const char *text) {
  if (s_chat_started) {
    prv_show_response_view();
    prv_update_scroll_text();
    prv_scroll_to_latest_prompt(false);
    return;
  }

  prv_set_response(text);
}
#endif

static void prv_append_notice(const char *text) {
  if (!s_chat_started) {
    prv_set_response(text);
    return;
  }

  prv_show_response_view();
  if (s_response[0] != '\0') {
    prv_append_text_limited("\n\n");
  }
  prv_append_text_limited(text);
  prv_update_scroll_text();
  prv_scroll_to_latest_prompt(false);
}

static void prv_send_health_summary_response(uint32_t request_id, uint32_t health_request_id,
                                             const char *json, const char *error) {
  DictionaryIterator *iter;
  AppMessageResult result = app_message_outbox_begin(&iter);

  if (result != APP_MSG_OK || !iter) {
    APP_LOG(APP_LOG_LEVEL_ERROR, "health response outbox begin failed result=%d", result);
    return;
  }

  dict_write_uint32(iter, MESSAGE_KEY_RequestId, request_id);
  dict_write_uint32(iter, MESSAGE_KEY_HealthSummaryRequest, health_request_id);
  if (error && error[0] != '\0') {
    dict_write_cstring(iter, MESSAGE_KEY_HealthSummaryError, error);
  } else {
    dict_write_cstring(iter, MESSAGE_KEY_HealthSummaryJson, json ? json : "{}");
  }
  dict_write_end(iter);

  result = app_message_outbox_send();
  if (result != APP_MSG_OK) {
    APP_LOG(APP_LOG_LEVEL_ERROR, "health response outbox send failed result=%d", result);
  }
}

#if defined(PBL_HEALTH)
static void prv_append_text(char *buffer, size_t size, const char *text) {
  size_t used = strlen(buffer);

  if (used >= size - 1) {
    return;
  }

  snprintf(buffer + used, size - used, "%s", text ? text : "");
}

static void prv_append_csv_value(char *buffer, size_t size, const char *value) {
  if (!value || value[0] == '\0') {
    return;
  }

  if (buffer[0] != '\0') {
    prv_append_text(buffer, size, ",");
  }
  prv_append_text(buffer, size, value);
}

static void prv_append_json_comma(char *json, size_t size, bool *needs_comma) {
  if (*needs_comma) {
    prv_append_text(json, size, ",");
  }
  *needs_comma = true;
}

static void prv_append_json_int_field(char *json, size_t size, bool *needs_comma,
                                      const char *name, int32_t value) {
  size_t used;

  prv_append_json_comma(json, size, needs_comma);
  used = strlen(json);
  if (used >= size - 1) {
    return;
  }
  snprintf(json + used, size - used, "\"%s\":%ld", name, (long)value);
}

static void prv_append_json_string_field(char *json, size_t size, bool *needs_comma,
                                         const char *name, const char *value) {
  size_t used;

  prv_append_json_comma(json, size, needs_comma);
  used = strlen(json);
  if (used >= size - 1) {
    return;
  }
  snprintf(json + used, size - used, "\"%s\":\"%s\"", name, value ? value : "");
}

static void prv_health_append_sum_metric(char *json, size_t json_size, bool *needs_comma,
                                         const char *name, HealthMetric metric,
                                         time_t start, time_t end, char *unavailable,
                                         size_t unavailable_size) {
  HealthServiceAccessibilityMask accessible = health_service_metric_accessible(metric, start, end);

  if (accessible & HealthServiceAccessibilityMaskAvailable) {
    prv_append_json_int_field(json, json_size, needs_comma, name, health_service_sum(metric, start, end));
  } else {
    prv_append_csv_value(unavailable, unavailable_size, name);
  }
}

static void prv_health_append_heart_rate(char *json, size_t json_size, bool *needs_comma,
                                         char *unavailable, size_t unavailable_size) {
  time_t now = time(NULL);
  HealthServiceAccessibilityMask accessible = health_service_metric_aggregate_averaged_accessible(
      HealthMetricHeartRateBPM, now, now, HealthAggregationAvg, HealthServiceTimeScopeOnce);

  if (accessible & HealthServiceAccessibilityMaskAvailable) {
    HealthValue value = health_service_peek_current_value(HealthMetricHeartRateBPM);
    if (value > 0) {
      prv_append_json_int_field(json, json_size, needs_comma, "heartRateBPM", value);
      return;
    }
  }

  prv_append_csv_value(unavailable, unavailable_size, "heartRateBPM");
}

static void prv_health_append_current_activities(char *activities, size_t size) {
  HealthActivityMask mask = health_service_peek_current_activities();

  activities[0] = '\0';
  if (mask & HealthActivitySleep) {
    prv_append_csv_value(activities, size, "sleep");
  }
  if (mask & HealthActivityRestfulSleep) {
    prv_append_csv_value(activities, size, "restful_sleep");
  }
  if (mask & HealthActivityWalk) {
    prv_append_csv_value(activities, size, "walk");
  }
  if (mask & HealthActivityRun) {
    prv_append_csv_value(activities, size, "run");
  }
  if (mask & HealthActivityOpenWorkout) {
    prv_append_csv_value(activities, size, "open_workout");
  }
}
#endif

static void prv_handle_health_summary_request(uint32_t request_id, Tuple *health_request_t,
                                              Tuple *start_t, Tuple *end_t, Tuple *include_heart_rate_t) {
  uint32_t health_request_id = prv_uint32_from_tuple(health_request_t, 0);
  time_t start = (time_t)prv_uint32_from_tuple(start_t, 0);
  time_t end = (time_t)prv_uint32_from_tuple(end_t, 0);

  if (health_request_id == 0) {
    return;
  }
  if (start <= 0 || end <= start) {
    prv_send_health_summary_response(request_id, health_request_id, NULL, "Invalid health time range");
    return;
  }

#if defined(PBL_HEALTH)
  bool needs_comma = false;
  bool include_heart_rate = prv_int_from_tuple(include_heart_rate_t, 0) != 0;
  s_health_summary_json[0] = '\0';
  s_health_summary_unavailable[0] = '\0';
  s_health_summary_activities[0] = '\0';

  prv_append_text(s_health_summary_json, sizeof(s_health_summary_json), "{");
  prv_append_json_int_field(s_health_summary_json, sizeof(s_health_summary_json), &needs_comma,
      "startUnix", start);
  prv_append_json_int_field(s_health_summary_json, sizeof(s_health_summary_json), &needs_comma,
      "endUnix", end);
  prv_health_append_sum_metric(s_health_summary_json, sizeof(s_health_summary_json), &needs_comma,
      "stepCount", HealthMetricStepCount, start, end, s_health_summary_unavailable,
      sizeof(s_health_summary_unavailable));
  prv_health_append_sum_metric(s_health_summary_json, sizeof(s_health_summary_json), &needs_comma,
      "activeSeconds", HealthMetricActiveSeconds, start, end, s_health_summary_unavailable,
      sizeof(s_health_summary_unavailable));
  prv_health_append_sum_metric(s_health_summary_json, sizeof(s_health_summary_json), &needs_comma,
      "walkedDistanceMeters", HealthMetricWalkedDistanceMeters, start, end,
      s_health_summary_unavailable, sizeof(s_health_summary_unavailable));
  prv_health_append_sum_metric(s_health_summary_json, sizeof(s_health_summary_json), &needs_comma,
      "sleepSeconds", HealthMetricSleepSeconds, start, end, s_health_summary_unavailable,
      sizeof(s_health_summary_unavailable));
  prv_health_append_sum_metric(s_health_summary_json, sizeof(s_health_summary_json), &needs_comma,
      "sleepRestfulSeconds", HealthMetricSleepRestfulSeconds, start, end,
      s_health_summary_unavailable, sizeof(s_health_summary_unavailable));
  prv_health_append_sum_metric(s_health_summary_json, sizeof(s_health_summary_json), &needs_comma,
      "restingKCalories", HealthMetricRestingKCalories, start, end, s_health_summary_unavailable,
      sizeof(s_health_summary_unavailable));
  prv_health_append_sum_metric(s_health_summary_json, sizeof(s_health_summary_json), &needs_comma,
      "activeKCalories", HealthMetricActiveKCalories, start, end, s_health_summary_unavailable,
      sizeof(s_health_summary_unavailable));

  if (include_heart_rate) {
    prv_health_append_heart_rate(s_health_summary_json, sizeof(s_health_summary_json), &needs_comma,
        s_health_summary_unavailable, sizeof(s_health_summary_unavailable));
  }

  prv_health_append_current_activities(s_health_summary_activities, sizeof(s_health_summary_activities));
  prv_append_json_string_field(s_health_summary_json, sizeof(s_health_summary_json), &needs_comma,
      "currentActivities", s_health_summary_activities);
  if (s_health_summary_unavailable[0] != '\0') {
    prv_append_json_string_field(s_health_summary_json, sizeof(s_health_summary_json), &needs_comma,
        "unavailable", s_health_summary_unavailable);
  }
  prv_append_text(s_health_summary_json, sizeof(s_health_summary_json), "}");

  APP_LOG(APP_LOG_LEVEL_DEBUG, "health summary response token=%lu chars=%u",
      (unsigned long)health_request_id, (unsigned int)strlen(s_health_summary_json));
  prv_send_health_summary_response(request_id, health_request_id, s_health_summary_json, NULL);
#else
  prv_send_health_summary_response(request_id, health_request_id, NULL, "Pebble Health unavailable on this watch");
#endif
}

static void prv_progress_reset(void) {
#if defined(PBL_TOUCH)
  prv_stop_touch_momentum();
#endif

  s_progress_mode = true;
  snprintf(s_progress_title, sizeof(s_progress_title), "thinking");
  s_progress_detail[0] = '\0';
  s_progress_history[0] = '\0';
  s_progress_input_context[0] = '\0';
  s_progress_output_context[0] = '\0';
  prv_update_scroll_text();
  prv_update_progress_text();
  prv_update_progress_context_layers();
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
#if defined(PBL_TOUCH)
  prv_stop_touch_momentum();
#endif

  prv_show_response_view();
  s_home_screen_visible = false;
  snprintf(s_response, sizeof(s_response), "%s", text);
  s_response_truncated = false;
  prv_update_scroll_text();
  scroll_layer_set_content_offset(s_scroll_layer, GPointZero, false);
}

static void prv_show_home_screen(void) {
#if defined(PBL_TOUCH)
  prv_stop_touch_momentum();
#endif

  prv_show_response_view();
  s_home_screen_visible = true;
  s_response[0] = '\0';
  s_response_truncated = false;
  prv_update_scroll_text();

  if (s_scroll_layer) {
    scroll_layer_set_content_offset(s_scroll_layer, GPointZero, false);
  }
}

static void prv_set_progress(const char *text) {
  if (!s_progress_mode) {
    prv_progress_reset();
  }

  prv_set_progress_title(text);
}

static void prv_append_response(const char *text) {
  prv_show_response_view();
  s_home_screen_visible = false;
  prv_append_text_limited(text);
  prv_update_scroll_text();
  prv_scroll_to_latest_prompt(false);
}

#if defined(PBL_MICROPHONE)
static void prv_send_request(const char *text) {
  DictionaryIterator *iter;
  AppMessageResult result = app_message_outbox_begin(&iter);
  APP_LOG(APP_LOG_LEVEL_DEBUG, "send request start next_id=%lu text_len=%u", (unsigned long)(s_request_id + 1), (unsigned int)strlen(text));

  if (result != APP_MSG_OK || !iter) {
    APP_LOG(APP_LOG_LEVEL_ERROR, "outbox begin failed result=%d", result);
    prv_set_status("Phone unavailable");
    prv_append_notice("Could not contact phone. Try again.");
    return;
  }

  s_request_id += 1;
  dict_write_uint32(iter, MESSAGE_KEY_RequestId, s_request_id);
  if (s_chat_reset_pending) {
    dict_write_uint8(iter, MESSAGE_KEY_ChatReset, 1);
  }
  dict_write_cstring(iter, MESSAGE_KEY_RequestText, text);
  dict_write_end(iter);

  result = app_message_outbox_send();
  if (result != APP_MSG_OK) {
    APP_LOG(APP_LOG_LEVEL_ERROR, "outbox send failed request_id=%lu result=%d", (unsigned long)s_request_id, result);
    prv_set_status("Send failed");
    prv_append_notice("Could not send request to phone.");
    return;
  }

  APP_LOG(APP_LOG_LEVEL_DEBUG, "send request queued request_id=%lu", (unsigned long)s_request_id);
  s_chat_reset_pending = false;
  prv_append_prompt(text);
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
        prv_preserve_chat_or_set_response("No speech detected.");
      }
      break;
    case DictationSessionStatusFailureTranscriptionRejected:
      prv_set_status("Cancelled");
      prv_preserve_chat_or_set_response("Dictation cancelled.");
      break;
    case DictationSessionStatusFailureConnectivityError:
      prv_set_status("Dictation offline");
      prv_preserve_chat_or_set_response("Dictation needs phone connection and internet.");
      break;
    case DictationSessionStatusFailureDisabled:
      prv_set_status("Dictation disabled");
      prv_preserve_chat_or_set_response("Voice dictation is disabled in Pebble settings.");
      break;
    default:
      prv_set_status("Dictation failed");
      prv_preserve_chat_or_set_response("Dictation failed. Try again.");
      break;
  }
}

static bool prv_ensure_dictation_session(void) {
  if (s_dictation_session) {
    return true;
  }

  s_dictation_session = dictation_session_create(DICTATION_BUFFER_SIZE, prv_dictation_callback, NULL);
  if (!s_dictation_session) {
    APP_LOG(APP_LOG_LEVEL_ERROR, "dictation session create failed");
    if (prv_ui_loaded()) {
      prv_preserve_chat_or_set_response("Voice dictation unavailable. Check phone connection.");
    }
    return false;
  }

  dictation_session_enable_confirmation(s_dictation_session, true);
  dictation_session_enable_error_dialogs(s_dictation_session, true);
  return true;
}
#endif

static void prv_start_dictation(void) {
  if (s_launched_from_quick_launch) {
    s_quick_launch_dictation_started = true;
    if (s_quick_launch_dictation_timer) {
      app_timer_cancel(s_quick_launch_dictation_timer);
      s_quick_launch_dictation_timer = NULL;
    }
  }

#if defined(PBL_MICROPHONE)
  APP_LOG(APP_LOG_LEVEL_DEBUG, "start dictation");
  if (!prv_ensure_dictation_session()) {
    return;
  }

  prv_set_status("Listening");
  DictationSessionStatus status = dictation_session_start(s_dictation_session);
  if (status != DictationSessionStatusSuccess) {
    APP_LOG(APP_LOG_LEVEL_ERROR, "dictation start failed status=%d", status);
    prv_set_status("Dictation failed");
    prv_preserve_chat_or_set_response("Could not start dictation.");
  }
#else
  APP_LOG(APP_LOG_LEVEL_WARNING, "select pressed: microphone unsupported");
  prv_set_status("Unsupported");
  prv_set_response("Voice dictation unsupported on this watch.");
#endif
}

static void prv_quick_launch_dictation_timer_callback(void *context) {
  (void)context;
  s_quick_launch_dictation_timer = NULL;

  if (s_start_dictation_quick_launch && !s_quick_launch_dictation_started) {
    APP_LOG(APP_LOG_LEVEL_DEBUG, "quick launch dictation start");
    prv_start_dictation();
  }
}

static void prv_maybe_schedule_quick_launch_dictation(void) {
  if (!s_launched_from_quick_launch || !s_start_dictation_quick_launch ||
      s_quick_launch_dictation_started || s_quick_launch_dictation_timer) {
    return;
  }

  APP_LOG(APP_LOG_LEVEL_DEBUG, "quick launch dictation scheduled");
  s_quick_launch_dictation_timer = app_timer_register(QUICK_LAUNCH_DICTATION_DELAY_MS,
      prv_quick_launch_dictation_timer_callback, NULL);
}

static void prv_select_click_handler(ClickRecognizerRef recognizer, void *context) {
  (void)recognizer;
  (void)context;
  APP_LOG(APP_LOG_LEVEL_DEBUG, "select pressed: start dictation");
  prv_start_dictation();
}

static void prv_up_click_handler(ClickRecognizerRef recognizer, void *context) {
  (void)recognizer;
  (void)context;
  prv_scroll_by_lines(-s_scroll_lines, true);
}

static void prv_down_click_handler(ClickRecognizerRef recognizer, void *context) {
  (void)recognizer;
  (void)context;
  prv_scroll_by_lines(s_scroll_lines, true);
}

static void prv_scroll_click_config_provider(void *context) {
  window_single_repeating_click_subscribe(BUTTON_ID_UP, SCROLL_REPEAT_INTERVAL_MS, prv_up_click_handler);
  window_single_repeating_click_subscribe(BUTTON_ID_DOWN, SCROLL_REPEAT_INTERVAL_MS, prv_down_click_handler);
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

  Tuple *scroll_lines_t = dict_find(iter, MESSAGE_KEY_ScrollLines);
  if (scroll_lines_t) {
    APP_LOG(APP_LOG_LEVEL_DEBUG, "scroll lines update");
    prv_apply_scroll_lines(prv_int_from_tuple(scroll_lines_t, s_scroll_lines), true);
  }

#if defined(PBL_TOUCH)
  Tuple *touch_scroll_enabled_t = dict_find(iter, MESSAGE_KEY_TouchScrollEnabled);
  if (touch_scroll_enabled_t) {
    APP_LOG(APP_LOG_LEVEL_DEBUG, "touch scroll setting update");
    prv_apply_touch_scroll_enabled(prv_int_from_tuple(touch_scroll_enabled_t,
        s_touch_scroll_enabled ? 1 : 0), true);
  }
#endif

  Tuple *show_input_context_size_t = dict_find(iter, MESSAGE_KEY_ShowInputContextSize);
  if (show_input_context_size_t) {
    APP_LOG(APP_LOG_LEVEL_DEBUG, "show input context size update");
    prv_apply_show_input_context_size(prv_int_from_tuple(show_input_context_size_t,
        s_show_input_context_size ? 1 : 0), true);
  }

  Tuple *show_output_context_size_t = dict_find(iter, MESSAGE_KEY_ShowOutputContextSize);
  if (show_output_context_size_t) {
    APP_LOG(APP_LOG_LEVEL_DEBUG, "show output context size update");
    prv_apply_show_output_context_size(prv_int_from_tuple(show_output_context_size_t,
        s_show_output_context_size ? 1 : 0), true);
  }

  Tuple *start_dictation_quick_launch_t = dict_find(iter, MESSAGE_KEY_StartDictationQuickLaunch);
  if (start_dictation_quick_launch_t) {
    APP_LOG(APP_LOG_LEVEL_DEBUG, "quick launch dictation setting update");
    prv_apply_start_dictation_quick_launch(prv_int_from_tuple(start_dictation_quick_launch_t,
        s_start_dictation_quick_launch ? 1 : 0), true);
    prv_maybe_schedule_quick_launch_dictation();
  }

  Tuple *text_color_t = dict_find(iter, MESSAGE_KEY_TextColor);
  if (text_color_t) {
    APP_LOG(APP_LOG_LEVEL_DEBUG, "text color update");
    prv_apply_text_color(prv_int_from_tuple(text_color_t, TEXT_COLOR_DEFAULT), true);
  }

  Tuple *background_color_t = dict_find(iter, MESSAGE_KEY_BackgroundColor);
  if (background_color_t) {
    APP_LOG(APP_LOG_LEVEL_DEBUG, "background color update");
    prv_apply_background_color(prv_int_from_tuple(background_color_t, BACKGROUND_COLOR_DEFAULT), true);
  }

  Tuple *prompt_background_color_t = dict_find(iter, MESSAGE_KEY_PromptBackgroundColor);
  if (prompt_background_color_t) {
    APP_LOG(APP_LOG_LEVEL_DEBUG, "prompt background color update");
    prv_apply_prompt_background_color(prv_int_from_tuple(prompt_background_color_t, PROMPT_BACKGROUND_COLOR_DEFAULT), true);
  }

  Tuple *bold_text_color_t = dict_find(iter, MESSAGE_KEY_BoldTextColor);
  if (bold_text_color_t) {
    APP_LOG(APP_LOG_LEVEL_DEBUG, "bold text color update");
    prv_apply_bold_text_color(prv_int_from_tuple(bold_text_color_t, BOLD_TEXT_COLOR_DEFAULT), true);
  }

  Tuple *health_summary_t = dict_find(iter, MESSAGE_KEY_HealthSummaryRequest);
  if (health_summary_t) {
    APP_LOG(APP_LOG_LEVEL_DEBUG, "health summary request token=%lu", (unsigned long)prv_uint32_from_tuple(health_summary_t, 0));
    prv_handle_health_summary_request(request_id_t ? request_id_t->value->uint32 : s_request_id,
        health_summary_t,
        dict_find(iter, MESSAGE_KEY_HealthStartUnix),
        dict_find(iter, MESSAGE_KEY_HealthEndUnix),
        dict_find(iter, MESSAGE_KEY_HealthIncludeHeartRate));
    return;
  }

  Tuple *reset_t = dict_find(iter, MESSAGE_KEY_ResponseReset);
  if (reset_t) {
    APP_LOG(APP_LOG_LEVEL_DEBUG, "response reset");
    prv_set_status("Receiving");
    prv_show_response_view();
    s_response_truncated = false;
    prv_update_scroll_text();
    prv_scroll_to_latest_prompt(false);
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

  Tuple *progress_history_t = dict_find(iter, MESSAGE_KEY_ProgressHistory);
  if (progress_history_t) {
    APP_LOG(APP_LOG_LEVEL_DEBUG, "progress history len=%u", (unsigned int)strlen(progress_history_t->value->cstring));
    if (!s_progress_mode) {
      prv_progress_reset();
    }
    prv_set_progress_history(progress_history_t->value->cstring);
  }

  Tuple *progress_input_context_t = dict_find(iter, MESSAGE_KEY_ProgressInputContextSize);
  if (progress_input_context_t) {
    APP_LOG(APP_LOG_LEVEL_DEBUG, "progress input context len=%u", (unsigned int)strlen(progress_input_context_t->value->cstring));
    if (!s_progress_mode) {
      prv_progress_reset();
    }
    prv_set_progress_input_context(progress_input_context_t->value->cstring);
  }

  Tuple *progress_output_context_t = dict_find(iter, MESSAGE_KEY_ProgressOutputContextSize);
  if (progress_output_context_t) {
    APP_LOG(APP_LOG_LEVEL_DEBUG, "progress output context len=%u", (unsigned int)strlen(progress_output_context_t->value->cstring));
    if (!s_progress_mode) {
      prv_progress_reset();
    }
    prv_set_progress_output_context(progress_output_context_t->value->cstring);
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
    prv_append_response(error_t->value->cstring);
  }

  Tuple *done_t = dict_find(iter, MESSAGE_KEY_ResponseDone);
  if (done_t) {
    APP_LOG(APP_LOG_LEVEL_DEBUG, "response done chars=%u", (unsigned int)strlen(s_response));
    prv_set_status("Done");
    if (s_response[0] == '\0') {
      prv_set_response("No response text.");
    } else {
      prv_update_scroll_text();
      prv_scroll_to_latest_prompt(false);
    }
    prv_buzz_response_done();
  }
}

static void prv_inbox_dropped_handler(AppMessageResult reason, void *context) {
  APP_LOG(APP_LOG_LEVEL_ERROR, "inbox dropped reason=%d", reason);
  prv_set_status("Message dropped");
  prv_append_notice("Response message dropped. Try again.");
}

static void prv_outbox_failed_handler(DictionaryIterator *iter, AppMessageResult reason, void *context) {
  APP_LOG(APP_LOG_LEVEL_ERROR, "outbox failed reason=%d", reason);
  if (iter && dict_find(iter, MESSAGE_KEY_HealthSummaryRequest)) {
    return;
  }
  if (iter && dict_find(iter, MESSAGE_KEY_ChatReset)) {
    s_chat_reset_pending = true;
  }
  prv_set_status("Phone failed");
  prv_append_notice("Phone connection failed. Try again.");
}

static void prv_window_load(Window *window) {
  Layer *window_layer = window_get_root_layer(window);
  GRect bounds = layer_get_bounds(window_layer);

  s_scroll_layer = scroll_layer_create(bounds);
  scroll_layer_set_click_config_onto_window(s_scroll_layer, window);
  scroll_layer_set_callbacks(s_scroll_layer, (ScrollLayerCallbacks) {
    .click_config_provider = prv_scroll_click_config_provider
  });
  scroll_layer_set_paging(s_scroll_layer, false);
  layer_add_child(window_layer, scroll_layer_get_layer(s_scroll_layer));

  s_text_layer_width = bounds.size.w;
  s_text_width = bounds.size.w - (TEXT_SIDE_PADDING * 2);
  s_min_text_height = bounds.size.h;
  s_progress_width = bounds.size.w - (PROGRESS_TEXT_SIDE_PADDING * 2);
  s_progress_height = bounds.size.h;

  s_text_layer = layer_create(GRect(0, 0, s_text_layer_width, s_min_text_height));
  layer_set_update_proc(s_text_layer, prv_text_layer_update_proc);
  scroll_layer_add_child(s_scroll_layer, s_text_layer);

  s_progress_layer = layer_create(bounds);
  layer_set_hidden(s_progress_layer, true);
  layer_add_child(window_layer, s_progress_layer);

  s_progress_history_layer = text_layer_create(GRect(PROGRESS_TEXT_SIDE_PADDING, 0, s_progress_width, PROGRESS_HISTORY_MAX_HEIGHT));
  text_layer_set_background_color(s_progress_history_layer, GColorClear);
  text_layer_set_text_color(s_progress_history_layer, s_text_color);
  text_layer_set_font(s_progress_history_layer, fonts_get_system_font(FONT_KEY_GOTHIC_18));
  text_layer_set_overflow_mode(s_progress_history_layer, GTextOverflowModeWordWrap);
  text_layer_set_text_alignment(s_progress_history_layer, GTextAlignmentCenter);
  layer_add_child(s_progress_layer, text_layer_get_layer(s_progress_history_layer));

  s_progress_title_layer = text_layer_create(GRect(PROGRESS_TEXT_SIDE_PADDING, 0, s_progress_width, PROGRESS_TITLE_MAX_HEIGHT));
  text_layer_set_background_color(s_progress_title_layer, GColorClear);
  text_layer_set_text_color(s_progress_title_layer, s_text_color);
  text_layer_set_font(s_progress_title_layer, fonts_get_system_font(FONT_KEY_GOTHIC_28_BOLD));
  text_layer_set_overflow_mode(s_progress_title_layer, GTextOverflowModeWordWrap);
  text_layer_set_text_alignment(s_progress_title_layer, GTextAlignmentCenter);
  layer_add_child(s_progress_layer, text_layer_get_layer(s_progress_title_layer));

  s_progress_detail_layer = text_layer_create(GRect(PROGRESS_TEXT_SIDE_PADDING, 0, s_progress_width, PROGRESS_DETAIL_MAX_HEIGHT));
  text_layer_set_background_color(s_progress_detail_layer, GColorClear);
  text_layer_set_text_color(s_progress_detail_layer, s_text_color);
  text_layer_set_font(s_progress_detail_layer, fonts_get_system_font(FONT_KEY_GOTHIC_18_BOLD));
  text_layer_set_overflow_mode(s_progress_detail_layer, GTextOverflowModeWordWrap);
  text_layer_set_text_alignment(s_progress_detail_layer, GTextAlignmentCenter);
  layer_add_child(s_progress_layer, text_layer_get_layer(s_progress_detail_layer));

  s_progress_loading_layer = layer_create(GRect(0, bounds.size.h - PROGRESS_LOADING_HEIGHT, bounds.size.w, PROGRESS_LOADING_HEIGHT));
  layer_set_update_proc(s_progress_loading_layer, prv_progress_loading_update_proc);
  layer_add_child(s_progress_layer, s_progress_loading_layer);

  s_progress_input_context_layer = text_layer_create(GRect(PROGRESS_CONTEXT_SIDE_PADDING, 0,
      (bounds.size.w / 2) - PROGRESS_CONTEXT_SIDE_PADDING, PROGRESS_CONTEXT_HEIGHT));
  text_layer_set_background_color(s_progress_input_context_layer, GColorClear);
  text_layer_set_text_color(s_progress_input_context_layer, s_text_color);
  text_layer_set_font(s_progress_input_context_layer, fonts_get_system_font(FONT_KEY_GOTHIC_14_BOLD));
  text_layer_set_overflow_mode(s_progress_input_context_layer, GTextOverflowModeTrailingEllipsis);
  text_layer_set_text_alignment(s_progress_input_context_layer, GTextAlignmentLeft);
  layer_set_hidden(text_layer_get_layer(s_progress_input_context_layer), true);
  layer_add_child(s_progress_layer, text_layer_get_layer(s_progress_input_context_layer));

  s_progress_output_context_layer = text_layer_create(GRect(bounds.size.w / 2, 0,
      (bounds.size.w / 2) - PROGRESS_CONTEXT_SIDE_PADDING, PROGRESS_CONTEXT_HEIGHT));
  text_layer_set_background_color(s_progress_output_context_layer, GColorClear);
  text_layer_set_text_color(s_progress_output_context_layer, s_text_color);
  text_layer_set_font(s_progress_output_context_layer, fonts_get_system_font(FONT_KEY_GOTHIC_14_BOLD));
  text_layer_set_overflow_mode(s_progress_output_context_layer, GTextOverflowModeTrailingEllipsis);
  text_layer_set_text_alignment(s_progress_output_context_layer, GTextAlignmentRight);
  layer_set_hidden(text_layer_get_layer(s_progress_output_context_layer), true);
  layer_add_child(s_progress_layer, text_layer_get_layer(s_progress_output_context_layer));

  prv_set_status("Ready");
  prv_show_home_screen();

#if defined(PBL_TOUCH)
  if (touch_service_is_enabled()) {
    touch_service_subscribe(prv_touch_handler, NULL);
  }
#endif
}

static void prv_window_unload(Window *window) {
#if defined(PBL_TOUCH)
  prv_stop_touch_momentum();
  touch_service_unsubscribe();
#endif

  prv_stop_progress_loading();
  text_layer_destroy(s_progress_output_context_layer);
  text_layer_destroy(s_progress_input_context_layer);
  layer_destroy(s_progress_loading_layer);
  text_layer_destroy(s_progress_detail_layer);
  text_layer_destroy(s_progress_title_layer);
  text_layer_destroy(s_progress_history_layer);
  layer_destroy(s_progress_layer);
  layer_destroy(s_text_layer);
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
  if (persist_exists(PERSIST_KEY_SCROLL_LINES)) {
    s_scroll_lines = prv_normalize_scroll_lines(persist_read_int(PERSIST_KEY_SCROLL_LINES));
  }
  if (persist_exists(PERSIST_KEY_START_DICTATION_QUICK_LAUNCH)) {
    s_start_dictation_quick_launch = persist_read_int(PERSIST_KEY_START_DICTATION_QUICK_LAUNCH) != 0;
  }
#if defined(PBL_TOUCH)
  if (persist_exists(PERSIST_KEY_TOUCH_SCROLL_ENABLED)) {
    s_touch_scroll_enabled = persist_read_int(PERSIST_KEY_TOUCH_SCROLL_ENABLED) != 0;
  }
#endif
  if (persist_exists(PERSIST_KEY_SHOW_INPUT_CONTEXT_SIZE)) {
    s_show_input_context_size = persist_read_int(PERSIST_KEY_SHOW_INPUT_CONTEXT_SIZE) != 0;
  }
  if (persist_exists(PERSIST_KEY_SHOW_OUTPUT_CONTEXT_SIZE)) {
    s_show_output_context_size = persist_read_int(PERSIST_KEY_SHOW_OUTPUT_CONTEXT_SIZE) != 0;
  }

  prv_apply_text_color(persist_exists(PERSIST_KEY_TEXT_COLOR) ? persist_read_int(PERSIST_KEY_TEXT_COLOR) : TEXT_COLOR_DEFAULT, false);
  prv_apply_background_color(persist_exists(PERSIST_KEY_BACKGROUND_COLOR) ? persist_read_int(PERSIST_KEY_BACKGROUND_COLOR) : BACKGROUND_COLOR_DEFAULT, false);
  prv_apply_prompt_background_color(persist_exists(PERSIST_KEY_PROMPT_BACKGROUND_COLOR) ? persist_read_int(PERSIST_KEY_PROMPT_BACKGROUND_COLOR) : PROMPT_BACKGROUND_COLOR_DEFAULT, false);
  prv_apply_bold_text_color(persist_exists(PERSIST_KEY_BOLD_TEXT_COLOR) ? persist_read_int(PERSIST_KEY_BOLD_TEXT_COLOR) : BOLD_TEXT_COLOR_DEFAULT, false);

  AppLaunchReason reason = launch_reason();
  s_launched_from_quick_launch = reason == APP_LAUNCH_QUICK_LAUNCH;
  APP_LOG(APP_LOG_LEVEL_DEBUG, "launch reason=%d quick_dictation=%d", reason, s_start_dictation_quick_launch ? 1 : 0);

  s_window = window_create();
  window_set_background_color(s_window, s_background_color);
  window_set_window_handlers(s_window, (WindowHandlers) {
    .load = prv_window_load,
    .unload = prv_window_unload,
  });

  app_message_register_inbox_received(prv_inbox_received_handler);
  app_message_register_inbox_dropped(prv_inbox_dropped_handler);
  app_message_register_outbox_failed(prv_outbox_failed_handler);
  app_message_open(APP_MESSAGE_INBOX_SIZE, APP_MESSAGE_OUTBOX_SIZE);
  APP_LOG(APP_LOG_LEVEL_DEBUG, "appmessage opened inbox=%lu outbox=%lu", (unsigned long)APP_MESSAGE_INBOX_SIZE, (unsigned long)APP_MESSAGE_OUTBOX_SIZE);

  window_stack_push(s_window, true);
  prv_maybe_schedule_quick_launch_dictation();
}

static void prv_deinit(void) {
  if (s_quick_launch_dictation_timer) {
    app_timer_cancel(s_quick_launch_dictation_timer);
    s_quick_launch_dictation_timer = NULL;
  }

#if defined(PBL_MICROPHONE)
  if (s_dictation_session) {
    dictation_session_destroy(s_dictation_session);
    s_dictation_session = NULL;
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
