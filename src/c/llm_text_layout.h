#pragma once

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

#if defined(PBL_PLATFORM_APLITE)
#define LLM_TEXT_LAYOUT_CHECKPOINT_STRIDE 72
#define LLM_TEXT_LAYOUT_CHECKPOINT_COUNT 32
#define LLM_TEXT_LAYOUT_RUN_BUFFER_SIZE 64
#else
#define LLM_TEXT_LAYOUT_CHECKPOINT_STRIDE 8
#define LLM_TEXT_LAYOUT_CHECKPOINT_COUNT 256
#define LLM_TEXT_LAYOUT_RUN_BUFFER_SIZE 256
#endif
#define LLM_TEXT_LAYOUT_MAX_TEXT_LENGTH 8191
#define LLM_TEXT_LAYOUT_NO_PROMPT_OFFSET UINT16_MAX

#define LLM_TEXT_LAYOUT_FLAG_BOLD 0x01
#define LLM_TEXT_LAYOUT_FLAG_PROMPT 0x02
#define LLM_TEXT_LAYOUT_FLAG_SMALL 0x04

typedef struct {
  // Response offsets fit in 13 bits; pack three style bits into the remaining bits.
  uint16_t offset_and_flags;
} LlmTextLayoutCheckpoint;

typedef struct {
  LlmTextLayoutCheckpoint checkpoints[LLM_TEXT_LAYOUT_CHECKPOINT_COUNT];
  uint16_t checkpoint_count;
  uint16_t text_length;
  int16_t width;
  int16_t line_height;
  uint8_t font_key;
  int32_t measured_height;
  int16_t latest_prompt_y;
  uint16_t latest_prompt_offset;
  bool valid;
} LlmTextLayout;

typedef int16_t (*LlmTextLayoutMeasureText)(const char *text, size_t length,
                                           uint8_t flags, void *context);
typedef int16_t (*LlmTextLayoutMeasureSpace)(uint8_t flags, void *context);
typedef void (*LlmTextLayoutDrawText)(const char *text, size_t length, uint8_t flags,
                                     int16_t x, int16_t y, int16_t width,
                                     int16_t line_height, void *context);
typedef void (*LlmTextLayoutFillPrompt)(int16_t y, int16_t line_height, void *context);

typedef struct {
  LlmTextLayoutMeasureText measure_text;
  LlmTextLayoutMeasureSpace measure_space;
  LlmTextLayoutDrawText draw_text;
  LlmTextLayoutFillPrompt fill_prompt;
  void *context;
} LlmTextLayoutCallbacks;

void llm_text_layout_invalidate(LlmTextLayout *layout);

// append_only is true only when existing bytes are unchanged and new bytes were appended.
// Callers must pass false after replacement, clear, eviction, or truncation, even at same length.
int32_t llm_text_layout_update(LlmTextLayout *layout, const char *text, size_t length,
                               bool append_only, int16_t width, uint8_t font_key,
                               int16_t line_height, const LlmTextLayoutCallbacks *callbacks);

void llm_text_layout_draw(const LlmTextLayout *layout, const char *text, size_t length,
                          int32_t visible_top, int32_t visible_bottom,
                          const LlmTextLayoutCallbacks *callbacks);
