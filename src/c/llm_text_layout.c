#include "llm_text_layout.h"

#include "llm_core.h"

#include <limits.h>
#include <string.h>

#define TEXT_BOLD_ON '\x01'
#define TEXT_BOLD_OFF '\x02'
#define TEXT_PROMPT_ON '\x03'
#define TEXT_PROMPT_OFF '\x04'
#define TEXT_SMALL_ON '\x05'
#define TEXT_SMALL_OFF '\x06'
#define TEXT_MEASURE_HEIGHT 32000
#define TEXT_RUN_BUFFER_SIZE LLM_TEXT_LAYOUT_RUN_BUFFER_SIZE
#define TEXT_PROMPT_BACKGROUND_BOTTOM_PADDING 6

static bool prv_is_style_marker(char value) {
  return value == TEXT_BOLD_ON || value == TEXT_BOLD_OFF ||
      value == TEXT_PROMPT_ON || value == TEXT_PROMPT_OFF ||
      value == TEXT_SMALL_ON || value == TEXT_SMALL_OFF;
}

static bool prv_is_space(char value) {
  return value == ' ' || value == '\t';
}

static bool prv_is_layout_separator(char value) {
  return value == '\n' || prv_is_space(value) || prv_is_style_marker(value);
}

static uint8_t prv_flags(bool bold, bool prompt, bool small) {
  uint8_t flags = 0;
  if (bold) {
    flags |= LLM_TEXT_LAYOUT_FLAG_BOLD;
  }
  if (prompt) {
    flags |= LLM_TEXT_LAYOUT_FLAG_PROMPT;
  }
  if (small) {
    flags |= LLM_TEXT_LAYOUT_FLAG_SMALL;
  }
  return flags;
}

static uint16_t prv_checkpoint_offset(const LlmTextLayoutCheckpoint *checkpoint) {
  return checkpoint->offset_and_flags & 0x1fff;
}

static uint8_t prv_checkpoint_flags(const LlmTextLayoutCheckpoint *checkpoint) {
  return (uint8_t)(checkpoint->offset_and_flags >> 13);
}

static void prv_record_checkpoint(LlmTextLayout *layout, const char *text,
                                  const char *line_start, uint8_t flags, int32_t y) {
  int32_t line_index;
  uint16_t checkpoint_index;
  size_t offset;

  if (!layout || !text || !line_start || layout->line_height <= 0 || y < 0) {
    return;
  }

  offset = (size_t)(line_start - text);
  if (offset > LLM_TEXT_LAYOUT_MAX_TEXT_LENGTH) {
    return;
  }

  line_index = y / layout->line_height;
  if (line_index % LLM_TEXT_LAYOUT_CHECKPOINT_STRIDE != 0) {
    return;
  }

  checkpoint_index = (uint16_t)(line_index / LLM_TEXT_LAYOUT_CHECKPOINT_STRIDE);
  if (checkpoint_index >= LLM_TEXT_LAYOUT_CHECKPOINT_COUNT) {
    return;
  }

  layout->checkpoints[checkpoint_index].offset_and_flags =
      (uint16_t)offset | (uint16_t)((uint16_t)(flags & 0x07) << 13);
  if (layout->checkpoint_count <= checkpoint_index) {
    layout->checkpoint_count = checkpoint_index + 1;
  }
}

static bool prv_line_visible(int32_t y, int16_t height,
                             int32_t visible_top, int32_t visible_bottom) {
  return y + height >= visible_top && y <= visible_bottom;
}

static void prv_fill_prompt_line(bool prompt, int32_t y, int16_t line_height,
                                 int16_t *filled_y, int32_t visible_top,
                                 int32_t visible_bottom,
                                 const LlmTextLayoutCallbacks *callbacks) {
  if (!prompt || *filled_y == y) {
    return;
  }

  *filled_y = (int16_t)y;
  if (!callbacks || !callbacks->fill_prompt ||
      !prv_line_visible(y, line_height + TEXT_PROMPT_BACKGROUND_BOTTOM_PADDING,
          visible_top, visible_bottom)) {
    return;
  }

  callbacks->fill_prompt((int16_t)y, line_height, callbacks->context);
}

static int16_t prv_measure(const LlmTextLayoutCallbacks *callbacks,
                           const char *text, size_t length, uint8_t flags) {
  if (!callbacks || !callbacks->measure_text) {
    return 1;
  }
  return callbacks->measure_text(text, length, flags, callbacks->context);
}

static int16_t prv_fit_chunk_length(const LlmTextLayoutCallbacks *callbacks,
                                    const char *text, size_t length,
                                    uint8_t flags, int16_t width_limit) {
  size_t chunk_length = llm_safe_utf8_prefix_length(text, length, TEXT_RUN_BUFFER_SIZE - 1);

  while (chunk_length > 1) {
    if (prv_measure(callbacks, text, chunk_length, flags) <= width_limit) {
      break;
    }
    chunk_length = llm_safe_utf8_prefix_length(text, chunk_length / 2, TEXT_RUN_BUFFER_SIZE - 1);
  }

  return (int16_t)chunk_length;
}

static void prv_layout_word(LlmTextLayout *layout, const char *base, const char *text,
                            size_t length, uint8_t flags,
                            const LlmTextLayoutCallbacks *callbacks, bool should_draw,
                            int32_t *x, int32_t *y, int16_t *prompt_filled_y,
                            bool record_checkpoints, int32_t visible_top,
                            int32_t visible_bottom) {
  while (length > 0) {
    size_t chunk_length = (size_t)prv_fit_chunk_length(callbacks, text, length, flags, layout->width);
    int16_t width = prv_measure(callbacks, text, chunk_length, flags);
    int16_t draw_width;

    if (width <= 0) {
      width = 1;
    }

    if (*x > 0 && *x + width > layout->width) {
      *x = 0;
      *y += layout->line_height;
      if (record_checkpoints) {
        prv_record_checkpoint(layout, base, text, flags, *y);
      }
    }

    prv_fill_prompt_line((flags & LLM_TEXT_LAYOUT_FLAG_PROMPT) != 0, *y,
        layout->line_height, prompt_filled_y, visible_top, visible_bottom,
        should_draw ? callbacks : NULL);

    draw_width = width;
    if (draw_width > layout->width - *x) {
      draw_width = (int16_t)(layout->width - *x);
    }

    if (should_draw && callbacks && callbacks->draw_text && draw_width > 0 &&
        prv_line_visible(*y, layout->line_height, visible_top, visible_bottom)) {
      callbacks->draw_text(text, chunk_length, flags, (int16_t)*x, (int16_t)*y,
          draw_width, layout->line_height, callbacks->context);
    }

    *x += width;
    if (*x > layout->width) {
      *x = layout->width;
    }

    text += chunk_length;
    length -= chunk_length;
  }
}

static void prv_layout_spaces(LlmTextLayout *layout, const char *base,
                              const char *text, size_t length, uint8_t flags,
                              const LlmTextLayoutCallbacks *callbacks, bool should_draw,
                              int32_t *x, int32_t *y, int16_t *prompt_filled_y,
                              bool record_checkpoints, int32_t visible_top,
                              int32_t visible_bottom) {
  int16_t space_width = callbacks && callbacks->measure_space ?
      callbacks->measure_space(flags, callbacks->context) : 1;
  int32_t width = 0;
  size_t i;

  if (*x == 0) {
    return;
  }

  prv_fill_prompt_line((flags & LLM_TEXT_LAYOUT_FLAG_PROMPT) != 0, *y,
      layout->line_height, prompt_filled_y, visible_top, visible_bottom,
      should_draw ? callbacks : NULL);

  if (space_width <= 0) {
    space_width = 1;
  }
  for (i = 0; i < length; i += 1) {
    width += text[i] == '\t' ? (int32_t)space_width * 2 : space_width;
  }

  if (*x + width > layout->width) {
    *x = 0;
    *y += layout->line_height;
    if (record_checkpoints) {
      prv_record_checkpoint(layout, base, text + length, flags, *y);
    }
    prv_fill_prompt_line((flags & LLM_TEXT_LAYOUT_FLAG_PROMPT) != 0, *y,
        layout->line_height, prompt_filled_y, visible_top, visible_bottom,
        should_draw ? callbacks : NULL);
    return;
  }

  *x += width;
}

static int32_t prv_run_layout(LlmTextLayout *layout, const char *text, size_t length,
                              size_t start_offset, int32_t start_y, uint8_t start_flags,
                              int16_t start_latest_prompt_y, uint16_t start_latest_prompt_offset,
                              const LlmTextLayoutCallbacks *callbacks, bool should_draw,
                              bool record_checkpoints, int32_t visible_top,
                              int32_t visible_bottom) {
  size_t cursor = start_offset;
  int32_t x = 0;
  int32_t y = start_y;
  int16_t prompt_filled_y = -1;
  bool bold = (start_flags & LLM_TEXT_LAYOUT_FLAG_BOLD) != 0;
  bool prompt = (start_flags & LLM_TEXT_LAYOUT_FLAG_PROMPT) != 0;
  bool small = (start_flags & LLM_TEXT_LAYOUT_FLAG_SMALL) != 0;

  if (record_checkpoints) {
    layout->latest_prompt_y = start_latest_prompt_y;
    layout->latest_prompt_offset = start_latest_prompt_offset;
    prv_record_checkpoint(layout, text, text + start_offset, start_flags, y);
  }

  while (cursor < length && y < TEXT_MEASURE_HEIGHT - layout->line_height) {
    char current = text[cursor];
    uint8_t flags;

    if (should_draw && y > visible_bottom) {
      break;
    }

    if (current == TEXT_BOLD_ON) {
      bold = true;
      cursor += 1;
    } else if (current == TEXT_BOLD_OFF) {
      bold = false;
      cursor += 1;
    } else if (current == TEXT_PROMPT_ON) {
      prompt = true;
      if (record_checkpoints) {
        layout->latest_prompt_y = (int16_t)y;
        layout->latest_prompt_offset = (uint16_t)cursor;
      }
      cursor += 1;
    } else if (current == TEXT_PROMPT_OFF) {
      prompt = false;
      cursor += 1;
    } else if (current == TEXT_SMALL_ON) {
      small = true;
      cursor += 1;
    } else if (current == TEXT_SMALL_OFF) {
      small = false;
      cursor += 1;
    } else if (current == '\n') {
      flags = prv_flags(bold, prompt, small);
      prv_fill_prompt_line(prompt, y, layout->line_height, &prompt_filled_y,
          visible_top, visible_bottom, should_draw ? callbacks : NULL);
      x = 0;
      y += layout->line_height;
      cursor += 1;
      if (record_checkpoints) {
        prv_record_checkpoint(layout, text, text + cursor, flags, y);
      }
    } else if (prv_is_space(current)) {
      size_t start = cursor;
      flags = prv_flags(bold, prompt, small);
      while (cursor < length && prv_is_space(text[cursor])) {
        cursor += 1;
      }
      prv_layout_spaces(layout, text, text + start, cursor - start, flags,
          callbacks, should_draw, &x, &y, &prompt_filled_y, record_checkpoints,
          visible_top, visible_bottom);
    } else {
      size_t start = cursor;
      flags = prv_flags(bold, prompt, small);
      while (cursor < length && !prv_is_layout_separator(text[cursor])) {
        cursor += 1;
      }
      prv_layout_word(layout, text, text + start, cursor - start, flags,
          callbacks, should_draw, &x, &y, &prompt_filled_y, record_checkpoints,
          visible_top, visible_bottom);
    }
  }

  return y + layout->line_height;
}

static size_t prv_affected_tail_start(const char *text, size_t old_length) {
  size_t start = old_length;

  if (old_length == 0) {
    return 0;
  }

  if (text[old_length - 1] == '\n' || prv_is_style_marker(text[old_length - 1])) {
    return old_length;
  }

  if (prv_is_space(text[old_length - 1])) {
    while (start > 0 && prv_is_space(text[start - 1])) {
      start -= 1;
    }
    return start;
  }

  while (start > 0 && !prv_is_layout_separator(text[start - 1])) {
    start -= 1;
  }
  return start;
}

static uint16_t prv_checkpoint_before_offset(const LlmTextLayout *layout, size_t offset) {
  uint16_t i = layout->checkpoint_count;

  while (i > 0) {
    i -= 1;
    if (prv_checkpoint_offset(&layout->checkpoints[i]) <= offset) {
      return i;
    }
  }
  return 0;
}

void llm_text_layout_invalidate(LlmTextLayout *layout) {
  if (!layout) {
    return;
  }
  layout->valid = false;
}

int32_t llm_text_layout_update(LlmTextLayout *layout, const char *text, size_t length,
                               bool append_only, int16_t width, uint8_t font_key,
                               int16_t line_height, const LlmTextLayoutCallbacks *callbacks) {
  bool full_layout;
  size_t start_offset = 0;
  int32_t start_y = 0;
  int16_t start_latest_prompt_y = 0;
  uint16_t start_latest_prompt_offset = LLM_TEXT_LAYOUT_NO_PROMPT_OFFSET;
  uint8_t start_flags = 0;

  if (!layout || !text || !callbacks || line_height <= 0 || width <= 0 ||
      length > LLM_TEXT_LAYOUT_MAX_TEXT_LENGTH) {
    if (layout) {
      llm_text_layout_invalidate(layout);
    }
    return 0;
  }

  full_layout = !layout->valid || !append_only || length < layout->text_length ||
      width != layout->width || font_key != layout->font_key ||
      line_height != layout->line_height;
  if (!full_layout && length == layout->text_length) {
    return layout->measured_height;
  }

  if (full_layout) {
    layout->checkpoint_count = 0;
    layout->width = width;
    layout->font_key = font_key;
    layout->line_height = line_height;
  } else {
    size_t affected_offset = prv_affected_tail_start(text, layout->text_length);
    uint16_t checkpoint_index = prv_checkpoint_before_offset(layout, affected_offset);
    LlmTextLayoutCheckpoint *checkpoint = &layout->checkpoints[checkpoint_index];

    start_offset = prv_checkpoint_offset(checkpoint);
    start_y = (int32_t)checkpoint_index * LLM_TEXT_LAYOUT_CHECKPOINT_STRIDE * line_height;
    start_flags = prv_checkpoint_flags(checkpoint);
    if (layout->latest_prompt_offset < start_offset) {
      start_latest_prompt_y = layout->latest_prompt_y;
      start_latest_prompt_offset = layout->latest_prompt_offset;
    }
    layout->checkpoint_count = checkpoint_index + 1;
  }

  layout->measured_height = prv_run_layout(layout, text, length, start_offset, start_y,
      start_flags, start_latest_prompt_y, start_latest_prompt_offset, callbacks, false,
      true, 0, TEXT_MEASURE_HEIGHT);
  layout->text_length = (uint16_t)length;
  layout->valid = true;
  return layout->measured_height;
}

void llm_text_layout_draw(const LlmTextLayout *layout, const char *text, size_t length,
                          int32_t visible_top, int32_t visible_bottom,
                          const LlmTextLayoutCallbacks *callbacks) {
  uint16_t checkpoint_index = 0;
  size_t start_offset = 0;
  int32_t start_y = 0;
  int16_t latest_prompt_y = 0;
  uint8_t start_flags = 0;
  int32_t draw_visible_top;

  if (!layout || !layout->valid || !text || !callbacks || layout->line_height <= 0) {
    return;
  }

  if (visible_top > 0) {
    int32_t earliest_drawable_y = visible_top - layout->line_height -
        TEXT_PROMPT_BACKGROUND_BOTTOM_PADDING;
    if (earliest_drawable_y > 0) {
      checkpoint_index = (uint16_t)((earliest_drawable_y / layout->line_height) /
          LLM_TEXT_LAYOUT_CHECKPOINT_STRIDE);
    }
  }
  if (checkpoint_index < layout->checkpoint_count) {
    const LlmTextLayoutCheckpoint *checkpoint = &layout->checkpoints[checkpoint_index];
    start_offset = prv_checkpoint_offset(checkpoint);
    start_y = (int32_t)checkpoint_index * LLM_TEXT_LAYOUT_CHECKPOINT_STRIDE * layout->line_height;
    start_flags = prv_checkpoint_flags(checkpoint);
  }

  draw_visible_top = visible_top - layout->line_height;
  (void)prv_run_layout((LlmTextLayout *)layout, text, length, start_offset, start_y,
      start_flags, latest_prompt_y, LLM_TEXT_LAYOUT_NO_PROMPT_OFFSET, callbacks, true,
      false, draw_visible_top, visible_bottom);
}
