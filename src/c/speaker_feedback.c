#include "speaker_feedback.h"

#if defined(PBL_SPEAKER)

#include <pebble.h>
#include <stdint.h>

#define SPEAKER_FEEDBACK_BUFFER_SIZE 512
#define SPEAKER_FEEDBACK_MAX_BYTES_PER_TICK 4096
#define SPEAKER_FEEDBACK_PUMP_INTERVAL_MS 20
#define SPEAKER_FEEDBACK_VOLUME 30

static uint8_t s_buffer[SPEAKER_FEEDBACK_BUFFER_SIZE];
static AppTimer *s_pump_timer;
static ResHandle s_resource;
static size_t s_resource_size;
static size_t s_offset;
static bool s_enabled;
static bool s_owns_playback;
static bool s_stream_open;
static bool s_finish_callback_registered;

static void prv_pump(void *context);

static bool prv_suppressed(void) {
  return quiet_time_is_active() || speaker_is_muted();
}

static void prv_cancel_pump_timer(void) {
  if (s_pump_timer) {
    app_timer_cancel(s_pump_timer);
    s_pump_timer = NULL;
  }
}

static void prv_clear_playback_state(void) {
  s_resource = NULL;
  s_resource_size = 0;
  s_offset = 0;
  s_owns_playback = false;
  s_stream_open = false;
}

static void prv_finish_callback(SpeakerFinishReason reason, void *context) {
  (void)reason;
  (void)context;

  prv_cancel_pump_timer();
  speaker_set_finish_callback(NULL, NULL);
  s_finish_callback_registered = false;
  prv_clear_playback_state();
}

static void prv_schedule_pump(void) {
  if (!s_pump_timer && s_owns_playback) {
    s_pump_timer = app_timer_register(SPEAKER_FEEDBACK_PUMP_INTERVAL_MS, prv_pump, NULL);
    if (!s_pump_timer) {
      speaker_feedback_stop();
    }
  }
}

static void prv_pump(void *context) {
  size_t bytes_this_tick = 0;
  (void)context;

  s_pump_timer = NULL;
  if (!s_owns_playback) {
    return;
  }
  if (!s_enabled || prv_suppressed()) {
    speaker_feedback_stop();
    return;
  }

  while (s_offset < s_resource_size &&
         bytes_this_tick < SPEAKER_FEEDBACK_MAX_BYTES_PER_TICK) {
    size_t requested = s_resource_size - s_offset;
    size_t loaded;
    uint32_t written;

    if (requested > sizeof(s_buffer)) {
      requested = sizeof(s_buffer);
    }
    if (requested > SPEAKER_FEEDBACK_MAX_BYTES_PER_TICK - bytes_this_tick) {
      requested = SPEAKER_FEEDBACK_MAX_BYTES_PER_TICK - bytes_this_tick;
    }

    loaded = resource_load_byte_range(s_resource, (uint32_t)s_offset, s_buffer, requested);
    if (loaded != requested) {
      speaker_feedback_stop();
      return;
    }

    written = speaker_stream_write(s_buffer, (uint32_t)loaded);
    if (written > loaded) {
      speaker_feedback_stop();
      return;
    }

    s_offset += written;
    bytes_this_tick += written;
    if (written < loaded) {
      break;
    }
  }

  if (s_offset == s_resource_size) {
    speaker_stream_close();
    s_stream_open = false;
    return;
  }

  prv_schedule_pump();
}

void speaker_feedback_set_enabled(bool enabled) {
  s_enabled = enabled;
  if (!enabled) {
    speaker_feedback_stop();
  }
}

void speaker_feedback_play_response_done(void) {
  ResHandle resource;
  size_t clip_size;

  if (!s_enabled || s_owns_playback || prv_suppressed() ||
      speaker_get_status() != SpeakerStatusIdle) {
    return;
  }

  resource = resource_get_handle(RESOURCE_ID_SOUND_HERDR_DONE);
  if (!resource) {
    return;
  }
  clip_size = resource_size(resource);
  if (clip_size == 0 || (clip_size & 1) != 0) {
    return;
  }

  speaker_set_finish_callback(prv_finish_callback, NULL);
  s_finish_callback_registered = true;
  if (!speaker_stream_open(SpeakerPcmFormat_16kHz_16bit, SPEAKER_FEEDBACK_VOLUME)) {
    speaker_set_finish_callback(NULL, NULL);
    s_finish_callback_registered = false;
    return;
  }

  s_resource = resource;
  s_resource_size = clip_size;
  s_offset = 0;
  s_stream_open = true;
  s_owns_playback = true;
  prv_pump(NULL);
}

void speaker_feedback_stop(void) {
  bool owned = s_owns_playback;
  bool stream_open = s_stream_open;
  bool callback_registered = s_finish_callback_registered;

  prv_cancel_pump_timer();
  if (callback_registered) {
    speaker_set_finish_callback(NULL, NULL);
  }
  s_finish_callback_registered = false;
  prv_clear_playback_state();

  if (owned) {
    if (stream_open) {
      speaker_stream_close();
    }
    speaker_stop();
  }
}

#else

void speaker_feedback_set_enabled(bool enabled) {
  (void)enabled;
}

void speaker_feedback_play_response_done(void) {
}

void speaker_feedback_stop(void) {
}

#endif
