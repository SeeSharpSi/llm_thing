#pragma once

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

#define LLM_FONT_SIZE_DEFAULT 18
#define LLM_BUZZ_STRENGTH_DEFAULT 1
#define LLM_SCROLL_LINES_DEFAULT 3
#define LLM_APPROVAL_DETAIL_MAX_BYTES 600
#define LLM_APPROVAL_TIMEOUT_MS 60000u

typedef enum {
  LLM_RESPONSE_TRANSFER_IDLE = 0,
  LLM_RESPONSE_TRANSFER_RECEIVING,
  LLM_RESPONSE_TRANSFER_TERMINAL
} LlmResponseTransferPhase;

typedef struct {
  LlmResponseTransferPhase phase;
  uint32_t next_index;
  uint32_t request_id;
} LlmResponseTransfer;

typedef enum {
  LLM_APPROVAL_IDLE = 0,
  LLM_APPROVAL_PENDING,
  LLM_APPROVAL_RESOLVED
} LlmApprovalPhase;

typedef struct {
  LlmApprovalPhase phase;
  uint32_t request_id;
  uint32_t approval_id;
  uint32_t last_resolved_request_id;
  uint32_t last_resolved_id;
  bool has_resolved_id;
  bool decision;
} LlmApprovalState;

typedef enum {
  LLM_RESPONSE_CHUNK_ACCEPTED,
  LLM_RESPONSE_CHUNK_DUPLICATE,
  LLM_RESPONSE_CHUNK_OUT_OF_ORDER,
  LLM_RESPONSE_CHUNK_IGNORED
} LlmResponseChunkResult;

typedef enum {
  LLM_RESPONSE_APPEND_UNCHANGED,
  LLM_RESPONSE_APPEND_ONLY,
  LLM_RESPONSE_APPEND_REWRITTEN
} LlmResponseAppendResult;

typedef int16_t (*LlmScrollLineHeightProvider)(void *context);

int llm_normalize_font_size(int size);
int llm_smaller_font_size(int size);
int llm_normalize_buzz_strength(int strength);
int llm_normalize_scroll_lines(int lines);
void llm_response_transfer_reset(LlmResponseTransfer *transfer);
bool llm_response_transfer_start_request(LlmResponseTransfer *transfer, uint32_t request_id);
bool llm_response_transfer_is_active_for_request(const LlmResponseTransfer *transfer,
                                                uint32_t request_id);
LlmResponseChunkResult llm_response_transfer_accept_chunk(LlmResponseTransfer *transfer,
                                                           uint32_t chunk_index);
bool llm_response_transfer_finish(LlmResponseTransfer *transfer);
void llm_approval_reset(LlmApprovalState *approval);
bool llm_approval_begin(LlmApprovalState *approval, uint32_t active_request_id,
                        uint32_t request_id, uint32_t approval_id);
bool llm_approval_is_current(const LlmApprovalState *approval, uint32_t request_id,
                             uint32_t approval_id);
bool llm_approval_choose(LlmApprovalState *approval, uint32_t request_id,
                         uint32_t approval_id, bool approve);
bool llm_approval_cancel(LlmApprovalState *approval, uint32_t request_id,
                         uint32_t approval_id);
bool llm_approval_decode_integer(uint32_t raw_value, size_t width, bool is_signed,
                                 uint32_t *value);
size_t llm_safe_utf8_prefix_length(const char *text, size_t length, size_t max_length);
bool llm_response_trim_oldest_turn(char *buffer, bool *truncated, char prompt_marker);
LlmResponseAppendResult llm_response_append(char *buffer, size_t capacity, bool *truncated,
                                            char prompt_marker, const char *text);
int32_t llm_min_scroll_offset_y(int32_t viewport_height, int32_t content_height,
                                int32_t measure_height);
int32_t llm_clamp_scroll_offset_y(int32_t offset_y, int32_t viewport_height,
                                  int32_t content_height, int32_t measure_height);
// Avoids calling provider while progress view owns overlaid response-layout storage.
bool llm_get_scroll_line_height(bool progress_mode, LlmScrollLineHeightProvider provider,
                                void *context, int16_t *line_height);
