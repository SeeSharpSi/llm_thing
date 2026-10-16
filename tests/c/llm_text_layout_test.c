#include "llm_core.h"
#include "llm_text_layout.h"

#include <stdbool.h>
#include <stdint.h>
#include <stdio.h>
#include <string.h>

#define TEST_TEXT_CAPACITY 8192
#define TEST_DRAW_CAPACITY 512

static int s_failures;

#define EXPECT_TRUE(expression) do { \
  if (!(expression)) { \
    fprintf(stderr, "%s:%d expected true: %s\n", __FILE__, __LINE__, #expression); \
    s_failures += 1; \
  } \
} while (0)

#define EXPECT_EQ_INT(actual, expected) do { \
  long actual_value = (long)(actual); \
  long expected_value = (long)(expected); \
  if (actual_value != expected_value) { \
    fprintf(stderr, "%s:%d expected %ld, got %ld\n", \
        __FILE__, __LINE__, expected_value, actual_value); \
    s_failures += 1; \
  } \
} while (0)

typedef struct {
  uint16_t length;
  uint8_t flags;
  int16_t x;
  int16_t y;
  int16_t width;
} LayoutDrawEvent;

typedef struct {
  uint8_t font_key;
  uint32_t measure_calls;
  uint32_t space_calls;
  uint32_t draw_calls;
  uint32_t fill_calls;
  LayoutDrawEvent draws[TEST_DRAW_CAPACITY];
  int16_t fills[TEST_DRAW_CAPACITY];
} LayoutHarness;

static int prv_effective_size(uint8_t font_key, uint8_t flags) {
  if (!(flags & LLM_TEXT_LAYOUT_FLAG_SMALL)) {
    return font_key;
  }
  if (font_key == 28) {
    return 24;
  }
  if (font_key == 24) {
    return 18;
  }
  return 14;
}

static int16_t prv_measure_text(const char *text, size_t length, uint8_t flags, void *context) {
  LayoutHarness *harness = context;
  int size = prv_effective_size(harness->font_key, flags);
  int glyph_width = size / 4;
  size_t i = 0;
  int32_t width = 0;

  harness->measure_calls += 1;
  if (flags & (LLM_TEXT_LAYOUT_FLAG_BOLD | LLM_TEXT_LAYOUT_FLAG_PROMPT)) {
    glyph_width += 1;
  }
  if (glyph_width < 1) {
    glyph_width = 1;
  }

  while (i < length) {
    uint8_t byte = (uint8_t)text[i];
    if ((byte & 0xc0) != 0x80) {
      width += glyph_width;
    }
    i += 1;
  }

  if (width > INT16_MAX) {
    return INT16_MAX;
  }
  return (int16_t)width;
}

static int16_t prv_measure_space(uint8_t flags, void *context) {
  LayoutHarness *harness = context;
  int16_t width = (int16_t)(prv_effective_size(harness->font_key, flags) / 5);
  harness->space_calls += 1;
  return width > 0 ? width : 1;
}

static void prv_draw_text(const char *text, size_t length, uint8_t flags,
                          int16_t x, int16_t y, int16_t width,
                          int16_t line_height, void *context) {
  LayoutHarness *harness = context;
  uint32_t index = harness->draw_calls;
  (void)text;
  (void)line_height;

  if (index < TEST_DRAW_CAPACITY) {
    harness->draws[index].length = (uint16_t)length;
    harness->draws[index].flags = flags;
    harness->draws[index].x = x;
    harness->draws[index].y = y;
    harness->draws[index].width = width;
  }
  harness->draw_calls += 1;
}

static void prv_fill_prompt(int16_t y, int16_t line_height, void *context) {
  LayoutHarness *harness = context;
  uint32_t index = harness->fill_calls;
  (void)line_height;

  if (index < TEST_DRAW_CAPACITY) {
    harness->fills[index] = y;
  }
  harness->fill_calls += 1;
}

static LlmTextLayoutCallbacks prv_callbacks(LayoutHarness *harness, bool drawing) {
  LlmTextLayoutCallbacks callbacks = {
    .measure_text = prv_measure_text,
    .measure_space = prv_measure_space,
    .draw_text = drawing ? prv_draw_text : NULL,
    .fill_prompt = drawing ? prv_fill_prompt : NULL,
    .context = harness,
  };
  return callbacks;
}

static void prv_reset_counts(LayoutHarness *harness) {
  harness->measure_calls = 0;
  harness->space_calls = 0;
  harness->draw_calls = 0;
  harness->fill_calls = 0;
}

static void prv_append_bytes(char *buffer, size_t capacity, size_t *used,
                             const char *text, size_t length) {
  if (*used + length >= capacity) {
    fprintf(stderr, "test input overflow\n");
    s_failures += 1;
    return;
  }
  memcpy(buffer + *used, text, length);
  *used += length;
  buffer[*used] = '\0';
}

static bool prv_layouts_equal(const LlmTextLayout *actual, const LlmTextLayout *expected) {
  if (actual->measured_height != expected->measured_height ||
      actual->latest_prompt_y != expected->latest_prompt_y ||
      actual->latest_prompt_offset != expected->latest_prompt_offset ||
      actual->checkpoint_count != expected->checkpoint_count) {
    return false;
  }
  return memcmp(actual->checkpoints, expected->checkpoints,
      actual->checkpoint_count * sizeof(actual->checkpoints[0])) == 0;
}

static uint32_t prv_visible_draw_events(const LayoutHarness *source, int32_t top,
                                        int32_t bottom, int16_t line_height,
                                        LayoutDrawEvent *visible) {
  uint32_t count = 0;
  uint32_t i;
  uint32_t limit = source->draw_calls < TEST_DRAW_CAPACITY ?
      source->draw_calls : TEST_DRAW_CAPACITY;

  for (i = 0; i < limit; i += 1) {
    const LayoutDrawEvent *event = &source->draws[i];
    if ((int32_t)event->y + line_height >= top && event->y <= bottom) {
      visible[count++] = *event;
    }
  }
  return count;
}

static uint32_t prv_visible_fill_events(const LayoutHarness *source, int32_t top,
                                        int32_t bottom, int16_t line_height,
                                        int16_t *visible) {
  uint32_t count = 0;
  uint32_t i;
  uint32_t limit = source->fill_calls < TEST_DRAW_CAPACITY ?
      source->fill_calls : TEST_DRAW_CAPACITY;

  for (i = 0; i < limit; i += 1) {
    int16_t y = source->fills[i];
    if ((int32_t)y + line_height + 6 >= top && y <= bottom) {
      visible[count++] = y;
    }
  }
  return count;
}

static void prv_compare_chunked_layout(const char *text, const size_t *chunk_sizes,
                                       size_t chunk_size_count, uint8_t font_key,
                                       int16_t width) {
  LlmTextLayout incremental = {0};
  LlmTextLayout full = {0};
  char partial[TEST_TEXT_CAPACITY] = "";
  size_t length = strlen(text);
  size_t offset = 0;
  size_t chunk_index = 0;
  LayoutHarness incremental_harness = { .font_key = font_key };
  LayoutHarness full_harness = { .font_key = font_key };
  LlmTextLayoutCallbacks incremental_callbacks = prv_callbacks(&incremental_harness, false);
  LlmTextLayoutCallbacks full_callbacks = prv_callbacks(&full_harness, false);
  int16_t line_height = (int16_t)(font_key + 4);

  while (offset < length) {
    size_t amount = chunk_sizes[chunk_index % chunk_size_count];
    if (amount > length - offset) {
      amount = length - offset;
    }
    prv_append_bytes(partial, sizeof(partial), &offset, text + offset, amount);
    (void)llm_text_layout_update(&incremental, partial, offset, true, width,
        font_key, line_height, &incremental_callbacks);
    chunk_index += 1;
  }

  (void)llm_text_layout_update(&full, text, length, false, width, font_key,
      line_height, &full_callbacks);
  EXPECT_TRUE(prv_layouts_equal(&incremental, &full));
}

static void test_incremental_chunks_match_full_layout(void) {
  static const size_t byte_chunks[] = { 1, 2, 1, 3, 4, 2, 7 };
  static const size_t mixed_chunks[] = { 19, 1, 37, 2, 113, 5, 29 };
  char text[TEST_TEXT_CAPACITY] = "";
  char long_word[460];
  size_t used = 0;
  size_t i;
  const char *prefix = "\x03" "Prompt with café text and spaces that reach multiple lines.\x04\n";
  const char *styled = "\n\x01" "bold words and \x05" "smaller text with tabs\tbetween runs\x06"
      "\x02\nlast line\n";
  const char *checkpoint_prompt = "\x03" "prompt at checkpoint\x04";

  prv_append_bytes(text, sizeof(text), &used, prefix, strlen(prefix));
  memset(long_word, 'W', sizeof(long_word) - 1);
  long_word[sizeof(long_word) - 1] = '\0';
  prv_append_bytes(text, sizeof(text), &used, long_word, strlen(long_word));
  prv_append_bytes(text, sizeof(text), &used, styled, strlen(styled));

  for (i = 0; i < LLM_TEXT_LAYOUT_CHECKPOINT_STRIDE; i += 1) {
    prv_append_bytes(text, sizeof(text), &used, "line\n", 5);
  }
  prv_append_bytes(text, sizeof(text), &used, checkpoint_prompt, strlen(checkpoint_prompt));
  prv_append_bytes(text, sizeof(text), &used, "\xe2", 1);
  prv_append_bytes(text, sizeof(text), &used, "\x82\xac", 2);
  prv_append_bytes(text, sizeof(text), &used, "   \n", 4);

  prv_compare_chunked_layout(text, byte_chunks,
      sizeof(byte_chunks) / sizeof(byte_chunks[0]), 14, 55);
  prv_compare_chunked_layout(text, mixed_chunks,
      sizeof(mixed_chunks) / sizeof(mixed_chunks[0]), 18, 78);
  prv_compare_chunked_layout(text, mixed_chunks,
      sizeof(mixed_chunks) / sizeof(mixed_chunks[0]), 28, 101);
}

static void test_empty_and_trailing_newline_layout(void) {
  static const size_t chunks[] = { 1, 2, 1 };
  LlmTextLayout layout = {0};
  LayoutHarness harness = { .font_key = 18 };
  LlmTextLayoutCallbacks callbacks = prv_callbacks(&harness, false);

  EXPECT_EQ_INT(llm_text_layout_update(&layout, "", 0, true, 60, 18, 22, &callbacks), 22);
  EXPECT_EQ_INT(layout.latest_prompt_y, 0);
  prv_compare_chunked_layout("first line\n\n", chunks,
      sizeof(chunks) / sizeof(chunks[0]), 18, 60);
}

static void test_prompt_marker_at_checkpoint_boundary(void) {
  LlmTextLayout layout = {0};
  LlmTextLayout expected = {0};
  LayoutHarness harness = { .font_key = 18 };
  LayoutHarness expected_harness = { .font_key = 18 };
  LlmTextLayoutCallbacks callbacks = prv_callbacks(&harness, false);
  LlmTextLayoutCallbacks expected_callbacks = prv_callbacks(&expected_harness, false);
  char text[512] = "";
  size_t used = 0;
  size_t i;

  for (i = 0; i < LLM_TEXT_LAYOUT_CHECKPOINT_STRIDE; i += 1) {
    prv_append_bytes(text, sizeof(text), &used, "x\n", 2);
  }
  (void)llm_text_layout_update(&layout, text, used, false, 60, 18, 22, &callbacks);
  EXPECT_TRUE(layout.checkpoint_count > 1);
  EXPECT_EQ_INT(layout.checkpoints[1].offset_and_flags & 0x1fff, used);

  prv_append_bytes(text, sizeof(text), &used, "\x03", 1);
  (void)llm_text_layout_update(&layout, text, used, true, 60, 18, 22, &callbacks);
  EXPECT_EQ_INT(layout.latest_prompt_y, LLM_TEXT_LAYOUT_CHECKPOINT_STRIDE * 22);
  prv_append_bytes(text, sizeof(text), &used, "prompt", 6);
  (void)llm_text_layout_update(&layout, text, used, true, 60, 18, 22, &callbacks);
  (void)llm_text_layout_update(&expected, text, used, false, 60, 18, 22,
      &expected_callbacks);
  EXPECT_TRUE(prv_layouts_equal(&layout, &expected));
}

static void test_unchanged_update_and_incremental_tail_cost(void) {
  LlmTextLayout layout = {0};
  LayoutHarness harness = { .font_key = 18 };
  LlmTextLayoutCallbacks callbacks = prv_callbacks(&harness, false);
  char text[TEST_TEXT_CAPACITY] = "";
  size_t used = 0;
  uint32_t full_measure_calls;
  uint32_t full_space_calls;
  size_t i;

  for (i = 0; i < 400; i += 1) {
    prv_append_bytes(text, sizeof(text), &used, "stableword ", 11);
  }
  (void)llm_text_layout_update(&layout, text, used, false, 76, 18, 22, &callbacks);
  full_measure_calls = harness.measure_calls;
  full_space_calls = harness.space_calls;

  prv_reset_counts(&harness);
  (void)llm_text_layout_update(&layout, text, used, true, 76, 18, 22, &callbacks);
  EXPECT_EQ_INT(harness.measure_calls, 0);
  EXPECT_EQ_INT(harness.space_calls, 0);

  prv_append_bytes(text, sizeof(text), &used, "tail", 4);
  prv_reset_counts(&harness);
  (void)llm_text_layout_update(&layout, text, used, true, 76, 18, 22, &callbacks);
  EXPECT_TRUE(harness.measure_calls * 4 < full_measure_calls);
  EXPECT_TRUE(harness.space_calls * 4 < full_space_calls);
  EXPECT_TRUE(full_space_calls > 0);
}

static void test_replacement_and_metric_configuration_invalidation(void) {
  LlmTextLayout layout = {0};
  LlmTextLayout expected = {0};
  LayoutHarness harness = { .font_key = 18 };
  LayoutHarness expected_harness = { .font_key = 18 };
  LlmTextLayoutCallbacks callbacks = prv_callbacks(&harness, false);
  LlmTextLayoutCallbacks expected_callbacks = prv_callbacks(&expected_harness, false);
  char text[] = "same length response";
  size_t length = strlen(text);

  (void)llm_text_layout_update(&layout, text, length, false, 72, 18, 22, &callbacks);
  memcpy(text, "other length response", length);
  (void)llm_text_layout_update(&layout, text, length, false, 72, 18, 22, &callbacks);
  (void)llm_text_layout_update(&expected, text, length, false, 72, 18, 22, &expected_callbacks);
  EXPECT_TRUE(prv_layouts_equal(&layout, &expected));

  (void)llm_text_layout_update(&layout, text, length, true, 48, 24, 28, &callbacks);
  (void)llm_text_layout_update(&expected, text, length, false, 48, 24, 28, &expected_callbacks);
  EXPECT_TRUE(prv_layouts_equal(&layout, &expected));
}

static void test_append_eviction_and_truncation_force_relayout(void) {
  char evicted[48] = "\x03old\x04\n\n\x03";
  char evicted_shorter[48] = "\x03old\x04\n\n\x03";
  char truncated[32] = "short";
  bool was_truncated = false;
  LlmTextLayout layout = {0};
  LlmTextLayout expected = {0};
  LayoutHarness harness = { .font_key = 14 };
  LayoutHarness expected_harness = { .font_key = 14 };
  LlmTextLayoutCallbacks callbacks = prv_callbacks(&harness, false);
  LlmTextLayoutCallbacks expected_callbacks = prv_callbacks(&expected_harness, false);
  char long_input[48];
  char filler[40];
  size_t evicted_length;
  size_t shorter_length;

  memset(filler, 'k', sizeof(filler) - 1);
  filler[sizeof(filler) - 1] = '\0';
  evicted_length = strlen(evicted);
  shorter_length = strlen(evicted_shorter);
  prv_append_bytes(evicted, sizeof(evicted), &evicted_length, filler, 39);
  prv_append_bytes(evicted_shorter, sizeof(evicted_shorter), &shorter_length, filler, 39);
  memset(long_input, 'x', sizeof(long_input) - 1);
  long_input[sizeof(long_input) - 1] = '\0';
  (void)llm_text_layout_update(&layout, evicted, strlen(evicted), false, 48, 14, 18, &callbacks);
  EXPECT_EQ_INT(llm_response_append(evicted, sizeof(evicted), &was_truncated,
      '\x03', "1234567"), LLM_RESPONSE_APPEND_REWRITTEN);
  EXPECT_EQ_INT(strlen(evicted), evicted_length);
  (void)llm_text_layout_update(&layout, evicted, strlen(evicted), false, 48, 14, 18, &callbacks);
  (void)llm_text_layout_update(&expected, evicted, strlen(evicted), false, 48, 14, 18,
      &expected_callbacks);
  EXPECT_TRUE(prv_layouts_equal(&layout, &expected));

  EXPECT_EQ_INT(llm_response_append(evicted_shorter, sizeof(evicted_shorter), &was_truncated,
      '\x03', "!"), LLM_RESPONSE_APPEND_REWRITTEN);
  EXPECT_TRUE(strlen(evicted_shorter) < shorter_length);

  (void)llm_text_layout_update(&layout, truncated, strlen(truncated), false, 48, 14, 18, &callbacks);
  EXPECT_EQ_INT(llm_response_append(truncated, sizeof(truncated), &was_truncated,
      '\x03', long_input), LLM_RESPONSE_APPEND_REWRITTEN);
  EXPECT_TRUE(was_truncated);
  (void)llm_text_layout_update(&layout, truncated, strlen(truncated), false, 48, 14, 18, &callbacks);
  (void)llm_text_layout_update(&expected, truncated, strlen(truncated), false, 48, 14, 18,
      &expected_callbacks);
  EXPECT_TRUE(prv_layouts_equal(&layout, &expected));
}

static void test_viewport_draw_uses_same_checkpoints(void) {
  LlmTextLayout incremental = {0};
  LlmTextLayout full = {0};
  LayoutHarness incremental_harness = { .font_key = 18 };
  LayoutHarness full_harness = { .font_key = 18 };
  LlmTextLayoutCallbacks incremental_callbacks = prv_callbacks(&incremental_harness, false);
  LlmTextLayoutCallbacks full_callbacks = prv_callbacks(&full_harness, false);
  char text[TEST_TEXT_CAPACITY] = "";
  size_t used = 0;
  size_t i;
  int32_t saved_prompt_y;
  LayoutDrawEvent expected_draws[TEST_DRAW_CAPACITY];
  LayoutDrawEvent actual_draws[TEST_DRAW_CAPACITY];
  int16_t expected_fills[TEST_DRAW_CAPACITY];
  int16_t actual_fills[TEST_DRAW_CAPACITY];
  uint32_t expected_draw_count;
  uint32_t actual_draw_count;
  uint32_t expected_fill_count;
  uint32_t actual_fill_count;
  const char *initial_prompt = "\x03" "start prompt\x04\n";
  const char *style_run = "\x01" "bold\x02 \x05" "small\x06 ";
  const char *latest_prompt = "\x03" "latest prompt";

  prv_append_bytes(text, sizeof(text), &used, initial_prompt, strlen(initial_prompt));
  for (i = 0; i < 120; i += 1) {
    prv_append_bytes(text, sizeof(text), &used, "mixed bold small words\n", 23);
    if (i % 9 == 0) {
      prv_append_bytes(text, sizeof(text), &used, style_run, strlen(style_run));
    }
  }
  prv_append_bytes(text, sizeof(text), &used, latest_prompt, strlen(latest_prompt));
  (void)llm_text_layout_update(&incremental, text, used, false, 70, 18, 22,
      &incremental_callbacks);
  (void)llm_text_layout_update(&full, text, used, false, 70, 18, 22, &full_callbacks);
  saved_prompt_y = incremental.latest_prompt_y;

  incremental_harness = (LayoutHarness){ .font_key = 18 };
  full_harness = (LayoutHarness){ .font_key = 18 };
  incremental_callbacks = prv_callbacks(&incremental_harness, true);
  full_callbacks = prv_callbacks(&full_harness, true);
  llm_text_layout_draw(&full, text, used, 0, 32000, &full_callbacks);

  for (i = 1; i < incremental.checkpoint_count; i += 1) {
    int32_t boundary = (int32_t)i * LLM_TEXT_LAYOUT_CHECKPOINT_STRIDE * 22;
    int32_t top;
    int adjustment;

    for (adjustment = -1; adjustment <= 1; adjustment += 1) {
      top = boundary + adjustment;
      incremental_harness.draw_calls = 0;
      incremental_harness.fill_calls = 0;
      llm_text_layout_draw(&incremental, text, used, top, top + 150,
          &incremental_callbacks);

      expected_draw_count = prv_visible_draw_events(&full_harness, top, top + 150,
          22, expected_draws);
      actual_draw_count = prv_visible_draw_events(&incremental_harness, top, top + 150,
          22, actual_draws);
      expected_fill_count = prv_visible_fill_events(&full_harness, top, top + 150,
          22, expected_fills);
      actual_fill_count = prv_visible_fill_events(&incremental_harness, top, top + 150,
          22, actual_fills);

      EXPECT_EQ_INT(actual_draw_count, expected_draw_count);
      EXPECT_EQ_INT(actual_fill_count, expected_fill_count);
      EXPECT_TRUE(memcmp(actual_draws, expected_draws,
          actual_draw_count * sizeof(actual_draws[0])) == 0);
      EXPECT_TRUE(memcmp(actual_fills, expected_fills,
          actual_fill_count * sizeof(actual_fills[0])) == 0);
    }
  }
  EXPECT_EQ_INT(incremental.latest_prompt_y, saved_prompt_y);
}

int main(void) {
  test_incremental_chunks_match_full_layout();
  test_empty_and_trailing_newline_layout();
  test_prompt_marker_at_checkpoint_boundary();
  test_unchanged_update_and_incremental_tail_cost();
  test_replacement_and_metric_configuration_invalidation();
  test_append_eviction_and_truncation_force_relayout();
  test_viewport_draw_uses_same_checkpoints();

  if (s_failures != 0) {
    fprintf(stderr, "%d text layout test assertion(s) failed\n", s_failures);
    return 1;
  }

  printf("llm_text_layout: all tests passed\n");
  return 0;
}
