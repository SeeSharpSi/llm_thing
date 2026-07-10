#include "llm_core.h"

#include <stdint.h>
#include <string.h>

int llm_normalize_font_size(int size) {
  switch (size) {
    case 14:
    case 18:
    case 24:
    case 28:
      return size;
    default:
      return LLM_FONT_SIZE_DEFAULT;
  }
}

int llm_smaller_font_size(int size) {
  switch (llm_normalize_font_size(size)) {
    case 28:
      return 24;
    case 24:
      return 18;
    case 18:
    case 14:
    default:
      return 14;
  }
}

int llm_normalize_buzz_strength(int strength) {
  if (strength >= 0 && strength <= 3) {
    return strength;
  }
  return LLM_BUZZ_STRENGTH_DEFAULT;
}

int llm_normalize_scroll_lines(int lines) {
  if (lines >= 1 && lines <= 10) {
    return lines;
  }
  return LLM_SCROLL_LINES_DEFAULT;
}

size_t llm_safe_utf8_prefix_length(const char *text, size_t length, size_t max_length) {
  size_t prefix_length = length < max_length ? length : max_length;

  if (prefix_length < length) {
    while (prefix_length > 1 && (((uint8_t)text[prefix_length] & 0xc0) == 0x80)) {
      prefix_length -= 1;
    }
  }
  if (prefix_length == 0) {
    prefix_length = 1;
  }

  return prefix_length;
}

bool llm_response_trim_oldest_turn(char *buffer, bool *truncated, char prompt_marker) {
  char *next_turn;

  if (!buffer || buffer[0] == '\0') {
    return false;
  }

  next_turn = strchr(buffer + 1, prompt_marker);
  if (next_turn) {
    memmove(buffer, next_turn, strlen(next_turn) + 1);
  } else {
    buffer[0] = '\0';
  }
  if (truncated) {
    *truncated = false;
  }
  return true;
}

void llm_response_append(char *buffer, size_t capacity, bool *truncated,
                         char prompt_marker, const char *text) {
  const char *suffix = "\n\n[Truncated]";
  size_t suffix_len = strlen(suffix);
  size_t used;
  size_t incoming;
  size_t available;

  if (!buffer || capacity == 0 || !truncated || !text) {
    return;
  }

  used = strlen(buffer);
  incoming = strlen(text);
  while (used + incoming >= capacity &&
         llm_response_trim_oldest_turn(buffer, truncated, prompt_marker)) {
    used = strlen(buffer);
  }

  if (used + incoming < capacity) {
    memcpy(buffer + used, text, incoming + 1);
    return;
  }

  if (*truncated || suffix_len + 1 >= capacity) {
    return;
  }

  available = capacity - used - suffix_len - 1;
  if (available > 0) {
    memcpy(buffer + used, text, available);
    used += available;
  }
  memcpy(buffer + used, suffix, suffix_len + 1);
  *truncated = true;
}

int32_t llm_min_scroll_offset_y(int32_t viewport_height, int32_t content_height,
                                int32_t measure_height) {
  int32_t min_y = viewport_height - content_height;

  if (min_y < -measure_height) {
    min_y = -measure_height;
  }
  if (min_y > 0) {
    min_y = 0;
  }
  return min_y;
}

int32_t llm_clamp_scroll_offset_y(int32_t offset_y, int32_t viewport_height,
                                  int32_t content_height, int32_t measure_height) {
  int32_t min_y = llm_min_scroll_offset_y(viewport_height, content_height, measure_height);

  if (offset_y < min_y) {
    offset_y = min_y;
  }
  if (offset_y > 0) {
    offset_y = 0;
  }
  return offset_y;
}
