#pragma once

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

#define LLM_FONT_SIZE_DEFAULT 18
#define LLM_BUZZ_STRENGTH_DEFAULT 1
#define LLM_SCROLL_LINES_DEFAULT 3

int llm_normalize_font_size(int size);
int llm_smaller_font_size(int size);
int llm_normalize_buzz_strength(int strength);
int llm_normalize_scroll_lines(int lines);
size_t llm_safe_utf8_prefix_length(const char *text, size_t length, size_t max_length);
bool llm_response_trim_oldest_turn(char *buffer, bool *truncated, char prompt_marker);
void llm_response_append(char *buffer, size_t capacity, bool *truncated,
                         char prompt_marker, const char *text);
int32_t llm_min_scroll_offset_y(int32_t viewport_height, int32_t content_height,
                                int32_t measure_height);
int32_t llm_clamp_scroll_offset_y(int32_t offset_y, int32_t viewport_height,
                                  int32_t content_height, int32_t measure_height);
