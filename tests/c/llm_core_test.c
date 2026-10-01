#include "llm_core.h"

#include <stdbool.h>
#include <stdio.h>
#include <string.h>

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

static void test_scroll_bounds(void) {
  EXPECT_EQ_INT(llm_min_scroll_offset_y(168, 100, 32000), 0);
  EXPECT_EQ_INT(llm_min_scroll_offset_y(168, 500, 32000), -332);
  EXPECT_EQ_INT(llm_min_scroll_offset_y(168, 40000, 32000), -32000);
  EXPECT_EQ_INT(llm_clamp_scroll_offset_y(10, 168, 500, 32000), 0);
  EXPECT_EQ_INT(llm_clamp_scroll_offset_y(-100, 168, 500, 32000), -100);
  EXPECT_EQ_INT(llm_clamp_scroll_offset_y(-500, 168, 500, 32000), -332);
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
  test_scroll_bounds();

  if (s_failures != 0) {
    fprintf(stderr, "%d C test assertion(s) failed\n", s_failures);
    return 1;
  }

  printf("llm_core: all tests passed\n");
  return 0;
}
