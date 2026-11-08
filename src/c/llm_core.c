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

void llm_response_transfer_reset(LlmResponseTransfer *transfer) {
  if (!transfer) {
    return;
  }

  transfer->phase = LLM_RESPONSE_TRANSFER_RECEIVING;
  transfer->next_index = 0;
}

bool llm_response_transfer_start_request(LlmResponseTransfer *transfer, uint32_t request_id) {
  if (!transfer || transfer->request_id == request_id) {
    return false;
  }

  transfer->request_id = request_id;
  llm_response_transfer_reset(transfer);
  return true;
}

bool llm_response_transfer_is_active_for_request(const LlmResponseTransfer *transfer,
                                                 uint32_t request_id) {
  return transfer && transfer->request_id == request_id &&
      transfer->phase == LLM_RESPONSE_TRANSFER_RECEIVING;
}

LlmResponseChunkResult llm_response_transfer_accept_chunk(LlmResponseTransfer *transfer,
                                                           uint32_t chunk_index) {
  if (!transfer || transfer->phase != LLM_RESPONSE_TRANSFER_RECEIVING) {
    return LLM_RESPONSE_CHUNK_IGNORED;
  }
  if (chunk_index < transfer->next_index) {
    return LLM_RESPONSE_CHUNK_DUPLICATE;
  }
  if (chunk_index > transfer->next_index) {
    return LLM_RESPONSE_CHUNK_OUT_OF_ORDER;
  }

  transfer->next_index += 1;
  return LLM_RESPONSE_CHUNK_ACCEPTED;
}

bool llm_response_transfer_finish(LlmResponseTransfer *transfer) {
  if (!transfer || transfer->phase != LLM_RESPONSE_TRANSFER_RECEIVING) {
    return false;
  }

  transfer->phase = LLM_RESPONSE_TRANSFER_TERMINAL;
  return true;
}

void llm_approval_reset(LlmApprovalState *approval) {
  if (approval) {
    memset(approval, 0, sizeof(*approval));
  }
}

bool llm_approval_begin(LlmApprovalState *approval, uint32_t active_request_id,
                        uint32_t request_id, uint32_t approval_id) {
  uint32_t delta;
  if (!approval || !approval_id || !active_request_id || request_id != active_request_id) {
    return false;
  }
  if (approval_id > 0x7fffffffu) {
    return false;
  }
  if (approval->request_id != request_id) {
    approval->has_resolved_id = false;
  }
  if (approval->phase == LLM_APPROVAL_PENDING) {
    return false;
  }
  if (approval->has_resolved_id && approval->last_resolved_request_id == request_id) {
    delta = (approval_id - approval->last_resolved_id) & 0x7fffffffu;
    if (delta == 0 || delta >= 0x40000000u) return false;
  }

  approval->request_id = request_id;
  approval->approval_id = approval_id;
  approval->phase = LLM_APPROVAL_PENDING;
  approval->decision = false;
  return true;
}

bool llm_approval_is_current(const LlmApprovalState *approval, uint32_t request_id,
                             uint32_t approval_id) {
  return approval && approval->phase == LLM_APPROVAL_PENDING &&
      approval->request_id == request_id && approval->approval_id == approval_id;
}

bool llm_approval_choose(LlmApprovalState *approval, uint32_t request_id,
                         uint32_t approval_id, bool approve) {
  if (!llm_approval_is_current(approval, request_id, approval_id)) {
    return false;
  }
  approval->phase = LLM_APPROVAL_RESOLVED;
  approval->decision = approve;
  approval->last_resolved_id = approval_id;
  approval->last_resolved_request_id = request_id;
  approval->has_resolved_id = true;
  return true;
}

bool llm_approval_cancel(LlmApprovalState *approval, uint32_t request_id,
                         uint32_t approval_id) {
  return llm_approval_choose(approval, request_id, approval_id, false);
}

bool llm_approval_decode_integer(uint32_t raw_value, size_t width, bool is_signed,
                                 uint32_t *value) {
  uint32_t sign_bit;
  uint32_t mask;
  if (!value || (width != 1 && width != 2 && width != 4)) return false;
  if (width == 4) {
    mask = UINT32_MAX;
    sign_bit = 0x80000000u;
  } else {
    mask = (1u << (width * 8)) - 1u;
    sign_bit = 1u << ((width * 8) - 1);
  }
  raw_value &= mask;
  if (is_signed && (raw_value & sign_bit)) return false;
  *value = raw_value;
  return true;
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

LlmResponseAppendResult llm_response_append(char *buffer, size_t capacity, bool *truncated,
                                            char prompt_marker, const char *text) {
  const char *suffix = "\n\n[Truncated]";
  size_t suffix_len = strlen(suffix);
  size_t used;
  size_t incoming;
  size_t available;
  bool rewrote_prefix = false;

  if (!buffer || capacity == 0 || !truncated || !text) {
    return LLM_RESPONSE_APPEND_UNCHANGED;
  }

  used = strlen(buffer);
  incoming = strlen(text);
  while (used + incoming >= capacity &&
         llm_response_trim_oldest_turn(buffer, truncated, prompt_marker)) {
    rewrote_prefix = true;
    used = strlen(buffer);
  }

  if (used + incoming < capacity) {
    if (incoming == 0) {
      return rewrote_prefix ? LLM_RESPONSE_APPEND_REWRITTEN : LLM_RESPONSE_APPEND_UNCHANGED;
    }
    memcpy(buffer + used, text, incoming + 1);
    return rewrote_prefix ? LLM_RESPONSE_APPEND_REWRITTEN : LLM_RESPONSE_APPEND_ONLY;
  }

  if (*truncated || suffix_len + 1 >= capacity) {
    return rewrote_prefix ? LLM_RESPONSE_APPEND_REWRITTEN : LLM_RESPONSE_APPEND_UNCHANGED;
  }

  available = capacity - used - suffix_len - 1;
  if (available > 0) {
    memcpy(buffer + used, text, available);
    used += available;
  }
  memcpy(buffer + used, suffix, suffix_len + 1);
  *truncated = true;
  return LLM_RESPONSE_APPEND_REWRITTEN;
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

bool llm_get_scroll_line_height(bool progress_mode, LlmScrollLineHeightProvider provider,
                                void *context, int16_t *line_height) {
  if (progress_mode || !provider || !line_height) {
    return false;
  }

  *line_height = provider(context);
  return *line_height > 0;
}
