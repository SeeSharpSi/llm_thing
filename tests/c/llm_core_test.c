#include "llm_core.h"

#include <stdbool.h>
#include <stdio.h>
#include <string.h>

static int s_failures;
static int s_line_height_calls;

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

#define EXPECT_STREQ(actual, expected) do { \
  if (strcmp((actual), (expected)) != 0) { \
    fprintf(stderr, "%s:%d expected \"%s\", got \"%s\"\n", \
        __FILE__, __LINE__, (expected), (actual)); \
    s_failures += 1; \
  } \
} while (0)

static void test_setting_normalizers(void) {
  EXPECT_EQ_INT(llm_normalize_font_size(14), 14);
  EXPECT_EQ_INT(llm_normalize_font_size(18), 18);
  EXPECT_EQ_INT(llm_normalize_font_size(24), 24);
  EXPECT_EQ_INT(llm_normalize_font_size(28), 28);
  EXPECT_EQ_INT(llm_normalize_font_size(20), 18);
  EXPECT_EQ_INT(llm_smaller_font_size(28), 24);
  EXPECT_EQ_INT(llm_smaller_font_size(24), 18);
  EXPECT_EQ_INT(llm_smaller_font_size(18), 14);
  EXPECT_EQ_INT(llm_smaller_font_size(14), 14);
  EXPECT_EQ_INT(llm_normalize_buzz_strength(-1), 1);
  EXPECT_EQ_INT(llm_normalize_buzz_strength(0), 0);
  EXPECT_EQ_INT(llm_normalize_buzz_strength(3), 3);
  EXPECT_EQ_INT(llm_normalize_buzz_strength(4), 1);
  EXPECT_EQ_INT(llm_normalize_scroll_lines(0), 3);
  EXPECT_EQ_INT(llm_normalize_scroll_lines(1), 1);
  EXPECT_EQ_INT(llm_normalize_scroll_lines(10), 10);
  EXPECT_EQ_INT(llm_normalize_scroll_lines(11), 3);
}

static void test_utf8_prefixes(void) {
  const char text[] = "A\xe2\x82\xac" "B";

  EXPECT_EQ_INT(llm_safe_utf8_prefix_length(text, 5, 5), 5);
  EXPECT_EQ_INT(llm_safe_utf8_prefix_length(text, 5, 4), 4);
  EXPECT_EQ_INT(llm_safe_utf8_prefix_length(text, 5, 3), 1);
  EXPECT_EQ_INT(llm_safe_utf8_prefix_length(text, 5, 2), 1);
  EXPECT_EQ_INT(llm_safe_utf8_prefix_length(text, 5, 1), 1);
  EXPECT_EQ_INT(llm_safe_utf8_prefix_length(text, 0, 4), 1);
}

static void test_response_append(void) {
  char buffer[64] = "";
  bool truncated = false;

  llm_response_append(buffer, sizeof(buffer), &truncated, '\x03', "hello");
  llm_response_append(buffer, sizeof(buffer), &truncated, '\x03', " world");
  EXPECT_STREQ(buffer, "hello world");
  EXPECT_TRUE(!truncated);
  EXPECT_EQ_INT(buffer[sizeof(buffer) - 1], 0);
}

static void test_response_turn_eviction(void) {
  char buffer[32] = "\x03old\x04\n\n\x03new\x04";
  bool truncated = true;

  llm_response_append(buffer, sizeof(buffer), &truncated, '\x03', "-01234567890123456789");

  EXPECT_TRUE(strstr(buffer, "old") == NULL);
  EXPECT_TRUE(strstr(buffer, "new") != NULL);
  EXPECT_TRUE(strstr(buffer, "0123456789") != NULL);
  EXPECT_TRUE(!truncated);
}

static void test_response_truncation(void) {
  char buffer[32] = "";
  bool truncated = false;
  const char *long_text = "abcdefghijklmnopqrstuvwxyz0123456789";

  llm_response_append(buffer, sizeof(buffer), &truncated, '\x03', long_text);

  EXPECT_EQ_INT(strlen(buffer), sizeof(buffer) - 1);
  EXPECT_TRUE(truncated);
  EXPECT_TRUE(strstr(buffer, "\n\n[Truncated]") != NULL);
  EXPECT_EQ_INT(buffer[sizeof(buffer) - 1], 0);
}

static void test_response_trim(void) {
  char buffer[32] = "\x03first\x04\n\n\x03second\x04";
  bool truncated = true;

  EXPECT_TRUE(llm_response_trim_oldest_turn(buffer, &truncated, '\x03'));
  EXPECT_STREQ(buffer, "\x03second\x04");
  EXPECT_TRUE(!truncated);
  EXPECT_TRUE(llm_response_trim_oldest_turn(buffer, &truncated, '\x03'));
  EXPECT_STREQ(buffer, "");
  EXPECT_TRUE(!llm_response_trim_oldest_turn(buffer, &truncated, '\x03'));
}

static void test_response_transfer_chunks(void) {
  LlmResponseTransfer transfer = {0};

  EXPECT_EQ_INT(llm_response_transfer_accept_chunk(&transfer, 0),
      LLM_RESPONSE_CHUNK_IGNORED);
  llm_response_transfer_reset(&transfer);
  EXPECT_EQ_INT(llm_response_transfer_accept_chunk(&transfer, 0),
      LLM_RESPONSE_CHUNK_ACCEPTED);
  EXPECT_EQ_INT(transfer.next_index, 1);
  EXPECT_EQ_INT(llm_response_transfer_accept_chunk(&transfer, 0),
      LLM_RESPONSE_CHUNK_DUPLICATE);
  EXPECT_EQ_INT(llm_response_transfer_accept_chunk(&transfer, 2),
      LLM_RESPONSE_CHUNK_OUT_OF_ORDER);
  EXPECT_EQ_INT(transfer.next_index, 1);
  EXPECT_EQ_INT(llm_response_transfer_accept_chunk(&transfer, 1),
      LLM_RESPONSE_CHUNK_ACCEPTED);
  EXPECT_EQ_INT(transfer.next_index, 2);
  EXPECT_TRUE(llm_response_transfer_finish(&transfer));
  EXPECT_EQ_INT(transfer.phase, LLM_RESPONSE_TRANSFER_TERMINAL);
  EXPECT_EQ_INT(llm_response_transfer_accept_chunk(&transfer, 2),
      LLM_RESPONSE_CHUNK_IGNORED);
  EXPECT_TRUE(!llm_response_transfer_finish(&transfer));
}

static void test_response_transfer_reset_and_finish(void) {
  LlmResponseTransfer transfer = {0};

  llm_response_transfer_reset(&transfer);
  EXPECT_EQ_INT(llm_response_transfer_accept_chunk(&transfer, 0),
      LLM_RESPONSE_CHUNK_ACCEPTED);
  EXPECT_TRUE(llm_response_transfer_finish(&transfer));

  llm_response_transfer_reset(&transfer);
  EXPECT_EQ_INT(transfer.phase, LLM_RESPONSE_TRANSFER_RECEIVING);
  EXPECT_EQ_INT(transfer.next_index, 0);
  EXPECT_TRUE(llm_response_transfer_finish(&transfer));
  EXPECT_TRUE(!llm_response_transfer_finish(&transfer));
  EXPECT_EQ_INT(llm_response_transfer_accept_chunk(&transfer, 0),
      LLM_RESPONSE_CHUNK_IGNORED);

  llm_response_transfer_reset(&transfer);
  EXPECT_EQ_INT(transfer.next_index, 0);
  EXPECT_EQ_INT(llm_response_transfer_accept_chunk(&transfer, 0),
      LLM_RESPONSE_CHUNK_ACCEPTED);
}

static void test_request_response_lifecycle_guards(void) {
  LlmResponseTransfer transfer = {0};
  uint32_t progress_updates = 0;

  EXPECT_TRUE(llm_response_transfer_start_request(&transfer, 100));
  EXPECT_TRUE(llm_response_transfer_is_active_for_request(&transfer, 100));
  if (llm_response_transfer_is_active_for_request(&transfer, 100)) {
    llm_response_transfer_reset(&transfer);
  }
  EXPECT_EQ_INT(llm_response_transfer_accept_chunk(&transfer, 0),
      LLM_RESPONSE_CHUNK_ACCEPTED);
  EXPECT_TRUE(llm_response_transfer_finish(&transfer));

  // Late reset, chunk 0, done, and progress are all rejected after terminal.
  EXPECT_TRUE(!llm_response_transfer_is_active_for_request(&transfer, 100));
  if (llm_response_transfer_is_active_for_request(&transfer, 100)) {
    llm_response_transfer_reset(&transfer);
  }
  EXPECT_EQ_INT(llm_response_transfer_accept_chunk(&transfer, 0),
      LLM_RESPONSE_CHUNK_IGNORED);
  EXPECT_TRUE(!llm_response_transfer_is_active_for_request(&transfer, 100));
  EXPECT_TRUE(!llm_response_transfer_finish(&transfer));
  if (llm_response_transfer_is_active_for_request(&transfer, 100)) {
    progress_updates += 1;
  }
  EXPECT_EQ_INT(progress_updates, 0);
  EXPECT_TRUE(!llm_response_transfer_start_request(&transfer, 100));

  // ResponseError has same terminal behavior as ResponseDone.
  EXPECT_TRUE(llm_response_transfer_start_request(&transfer, 101));
  EXPECT_TRUE(llm_response_transfer_is_active_for_request(&transfer, 101));
  EXPECT_TRUE(llm_response_transfer_finish(&transfer));
  EXPECT_TRUE(!llm_response_transfer_is_active_for_request(&transfer, 101));
  if (llm_response_transfer_is_active_for_request(&transfer, 101)) {
    llm_response_transfer_reset(&transfer);
    progress_updates += 1;
  }
  EXPECT_EQ_INT(llm_response_transfer_accept_chunk(&transfer, 0),
      LLM_RESPONSE_CHUNK_IGNORED);
  EXPECT_TRUE(!llm_response_transfer_finish(&transfer));
  EXPECT_EQ_INT(progress_updates, 0);

  // Cancellation also closes transfer before request ID advances.
  EXPECT_TRUE(llm_response_transfer_start_request(&transfer, 102));
  EXPECT_TRUE(llm_response_transfer_finish(&transfer));
  EXPECT_TRUE(!llm_response_transfer_is_active_for_request(&transfer, 102));
  if (llm_response_transfer_is_active_for_request(&transfer, 102)) {
    llm_response_transfer_reset(&transfer);
    progress_updates += 1;
  }
  EXPECT_EQ_INT(llm_response_transfer_accept_chunk(&transfer, 0),
      LLM_RESPONSE_CHUNK_IGNORED);
  EXPECT_TRUE(!llm_response_transfer_finish(&transfer));
  EXPECT_EQ_INT(progress_updates, 0);

  // New RequestId starts fresh receive state and accepts its reset/chunk/done.
  EXPECT_TRUE(llm_response_transfer_start_request(&transfer, 103));
  EXPECT_EQ_INT(transfer.next_index, 0);
  EXPECT_TRUE(llm_response_transfer_is_active_for_request(&transfer, 103));
  if (llm_response_transfer_is_active_for_request(&transfer, 103)) {
    llm_response_transfer_reset(&transfer);
  }
  EXPECT_EQ_INT(transfer.next_index, 0);
  EXPECT_EQ_INT(llm_response_transfer_accept_chunk(&transfer, 0),
      LLM_RESPONSE_CHUNK_ACCEPTED);
  EXPECT_TRUE(llm_response_transfer_finish(&transfer));
}

static void test_approval_lifecycle_guards(void) {
  LlmApprovalState approval = {0};
  uint32_t decoded = 0;

  EXPECT_TRUE(llm_approval_begin(&approval, 10, 10, 1));
  EXPECT_TRUE(llm_approval_is_current(&approval, 10, 1));
  EXPECT_TRUE(!llm_approval_begin(&approval, 10, 10, 1));
  EXPECT_TRUE(!llm_approval_begin(&approval, 10, 10, 2));
  EXPECT_TRUE(llm_approval_is_current(&approval, 10, 1));
  EXPECT_TRUE(!llm_approval_choose(&approval, 9, 1, true));
  EXPECT_TRUE(!llm_approval_choose(&approval, 10, 2, true));
  EXPECT_TRUE(llm_approval_choose(&approval, 10, 1, true));
  EXPECT_TRUE(approval.decision);
  EXPECT_TRUE(!llm_approval_is_current(&approval, 10, 1));
  EXPECT_TRUE(!llm_approval_begin(&approval, 10, 10, 1));
  EXPECT_TRUE(llm_approval_begin(&approval, 10, 10, 2));
  EXPECT_TRUE(llm_approval_choose(&approval, 10, 2, true));
  EXPECT_TRUE(!llm_approval_begin(&approval, 10, 10, 1));

  EXPECT_TRUE(llm_approval_begin(&approval, 10, 10, 3));
  EXPECT_TRUE(!llm_approval_begin(&approval, 10, 10, 1));
  EXPECT_TRUE(!llm_approval_cancel(&approval, 9, 3));
  EXPECT_TRUE(llm_approval_cancel(&approval, 10, 3));
  EXPECT_TRUE(!approval.decision);
  EXPECT_TRUE(!llm_approval_choose(&approval, 10, 3, true));
  EXPECT_TRUE(!llm_approval_begin(&approval, 10, 10, 3));

  EXPECT_TRUE(!llm_approval_begin(&approval, 11, 10, 3));
  EXPECT_TRUE(llm_approval_begin(&approval, 11, 11, 3));
  EXPECT_TRUE(!llm_approval_begin(&approval, 12, 12, 3));
  EXPECT_TRUE(llm_approval_choose(&approval, 11, 3, false));
  EXPECT_TRUE(llm_approval_begin(&approval, 12, 12, 3));
  EXPECT_TRUE(!llm_approval_begin(&approval, 12, 12, 0));

  EXPECT_TRUE(llm_approval_decode_integer(0x7f, 1, true, &decoded));
  EXPECT_EQ_INT(decoded, 127);
  EXPECT_TRUE(!llm_approval_decode_integer(0x80, 1, true, &decoded));
  EXPECT_TRUE(llm_approval_decode_integer(0xff, 1, false, &decoded));
  EXPECT_EQ_INT(decoded, 255);
  EXPECT_TRUE(llm_approval_decode_integer(0x7fff, 2, true, &decoded));
  EXPECT_EQ_INT(decoded, 32767);
  EXPECT_TRUE(!llm_approval_decode_integer(0x8000, 2, true, &decoded));
  EXPECT_TRUE(llm_approval_decode_integer(0xffff, 2, false, &decoded));
  EXPECT_EQ_INT(decoded, 65535);
  EXPECT_TRUE(llm_approval_decode_integer(0x7fffffff, 4, true, &decoded));
  EXPECT_EQ_INT(decoded, 0x7fffffff);
  EXPECT_TRUE(!llm_approval_decode_integer(0x80000000, 4, true, &decoded));
  EXPECT_TRUE(llm_approval_decode_integer(0xffffffff, 4, false, &decoded));
  EXPECT_EQ_INT(decoded, 0xffffffffu);
  EXPECT_TRUE(!llm_approval_decode_integer(1, 3, false, &decoded));
}

static void test_scroll_bounds(void) {
  EXPECT_EQ_INT(llm_min_scroll_offset_y(168, 100, 32000), 0);
  EXPECT_EQ_INT(llm_min_scroll_offset_y(168, 500, 32000), -332);
  EXPECT_EQ_INT(llm_min_scroll_offset_y(168, 40000, 32000), -32000);
  EXPECT_EQ_INT(llm_clamp_scroll_offset_y(10, 168, 500, 32000), 0);
  EXPECT_EQ_INT(llm_clamp_scroll_offset_y(-100, 168, 500, 32000), -100);
  EXPECT_EQ_INT(llm_clamp_scroll_offset_y(-500, 168, 500, 32000), -332);
}

static int16_t test_line_height_provider(void *context) {
  int16_t *height = context;
  s_line_height_calls += 1;
  return *height;
}

static void test_progress_scroll_does_not_read_layout_metrics(void) {
  int16_t source_height = 22;
  int16_t height = 0;

  s_line_height_calls = 0;
  EXPECT_TRUE(!llm_get_scroll_line_height(true, test_line_height_provider,
      &source_height, &height));
  EXPECT_EQ_INT(s_line_height_calls, 0);

  EXPECT_TRUE(llm_get_scroll_line_height(false, test_line_height_provider,
      &source_height, &height));
  EXPECT_EQ_INT(s_line_height_calls, 1);
  EXPECT_EQ_INT(height, source_height);
}

int main(void) {
  test_setting_normalizers();
  test_utf8_prefixes();
  test_response_append();
  test_response_turn_eviction();
  test_response_truncation();
  test_response_trim();
  test_response_transfer_chunks();
  test_response_transfer_reset_and_finish();
  test_request_response_lifecycle_guards();
  test_approval_lifecycle_guards();
  test_scroll_bounds();
  test_progress_scroll_does_not_read_layout_metrics();

  if (s_failures != 0) {
    fprintf(stderr, "%d C test assertion(s) failed\n", s_failures);
    return 1;
  }

  printf("llm_core: all tests passed\n");
  return 0;
}
